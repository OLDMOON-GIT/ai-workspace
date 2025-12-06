import { NextRequest, NextResponse } from 'next/server';
import { findJobById } from '@/lib/db';
import { getOne } from '@/lib/mysql';
import path from 'path';
import fs from 'fs';

const BACKEND_PATH = path.join(process.cwd(), '..', 'trend-video-backend');

/**
 * GET /api/jobs/[id]/longform-url - 숏폼의 원본 롱폼 YouTube URL 조회
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id: taskId } = await params;

    if (!taskId) {
      return NextResponse.json({ success: false, error: 'taskId 필수' }, { status: 400 });
    }

    // 1. Job 조회
    const job = await findJobById(taskId);
    if (!job) {
      return NextResponse.json({ success: false, error: 'Job을 찾을 수 없음' }, { status: 404 });
    }

    // shortform 타입인지 확인
    if (job.type !== 'shortform') {
      return NextResponse.json({ success: true, longformUrl: null, reason: '숏폼이 아님' });
    }

    // ✅ BTS-0000022: MySQL로 전환 (better-sqlite3 제거)
    let longformUrl = '';
    let longformChannelId = '';

    // 2. sourceContentId로 원본 롱폼 찾기
    const sourceContentId = (job as any).sourceContentId;
    console.log('🔍 [longform-url API] sourceContentId:', sourceContentId);

    if (sourceContentId) {
      // content.youtube_url 먼저 확인
      const contentWithUrl = await getOne(
        "SELECT youtube_url FROM content WHERE content_id = ? AND youtube_url IS NOT NULL AND youtube_url != ''",
        [sourceContentId]
      ) as { youtube_url?: string } | undefined;

      if (contentWithUrl?.youtube_url) {
        longformUrl = contentWithUrl.youtube_url;
        console.log('📺 [longform-url API] content.youtube_url에서 발견:', longformUrl);
      } else {
        // youtube_uploads 테이블 확인 (channel_id도 함께 조회)
        const upload = await getOne(
          "SELECT youtube_url, channel_id FROM youtube_uploads WHERE content_id = ? AND status != 'deleted' ORDER BY uploaded_at DESC LIMIT 1",
          [sourceContentId]
        ) as { youtube_url?: string; channel_id?: string } | undefined;

        if (upload?.youtube_url) {
          longformUrl = upload.youtube_url;
          console.log('📺 [longform-url API] youtube_uploads에서 발견:', longformUrl);
        }
        if (upload?.channel_id) {
          longformChannelId = upload.channel_id;
          console.log('📺 [longform-url API] 롱폼 채널 ID 발견:', longformChannelId);
        }
      }

      // ⭐ 채널 ID가 아직 없으면 task 테이블에서 조회
      if (!longformChannelId) {
        const taskWithChannel = await getOne(
          "SELECT channel FROM task WHERE task_id = ?",
          [sourceContentId]
        ) as { channel?: string } | undefined;

        if (taskWithChannel?.channel) {
          longformChannelId = taskWithChannel.channel;
          console.log('📺 [longform-url API] task.channel에서 발견:', longformChannelId);
        }
      }
    }

    // 3. story.json에서 확인 (fallback)
    if (!longformUrl) {
      try {
        const taskFolder = path.join(BACKEND_PATH, 'tasks', taskId);
        const storyJsonPath = path.join(taskFolder, 'story.json');

        if (fs.existsSync(storyJsonPath)) {
          const storyData = JSON.parse(fs.readFileSync(storyJsonPath, 'utf-8'));

          if (storyData.metadata?.longform_youtube_url) {
            longformUrl = storyData.metadata.longform_youtube_url;
            console.log('📺 [longform-url API] story.json에서 발견:', longformUrl);
          } else if (storyData.metadata?.converted_from) {
            // converted_from으로 다시 조회
            const upload = await getOne(
              "SELECT youtube_url FROM youtube_uploads WHERE content_id = ? AND status != 'deleted' ORDER BY uploaded_at DESC LIMIT 1",
              [storyData.metadata.converted_from]
            ) as { youtube_url?: string } | undefined;

            if (upload?.youtube_url) {
              longformUrl = upload.youtube_url;
              console.log('📺 [longform-url API] converted_from 기반으로 발견:', longformUrl);
            }
          }
        }
      } catch (err) {
        console.warn('⚠️ [longform-url API] story.json 읽기 실패:', err);
      }
    }

    // 4. youtube_upload.log에서 확인 (최종 fallback)
    if (!longformUrl) {
      // sourceContentId 또는 converted_from으로 롱폼 taskId 확인
      let longformTaskId = sourceContentId;

      if (!longformTaskId) {
        try {
          const taskFolder = path.join(BACKEND_PATH, 'tasks', taskId);
          const storyJsonPath = path.join(taskFolder, 'story.json');
          if (fs.existsSync(storyJsonPath)) {
            const storyData = JSON.parse(fs.readFileSync(storyJsonPath, 'utf-8'));
            longformTaskId = storyData.metadata?.converted_from;
          }
        } catch {}
      }

      if (longformTaskId) {
        try {
          const longformLogPath = path.join(BACKEND_PATH, 'tasks', longformTaskId, 'youtube_upload.log');
          if (fs.existsSync(longformLogPath)) {
            const logContent = fs.readFileSync(longformLogPath, 'utf-8');
            // youtu.be/xxx 또는 youtube.com/watch?v=xxx 패턴 찾기
            const urlMatch = logContent.match(/https:\/\/youtu\.be\/[a-zA-Z0-9_-]+/) ||
                             logContent.match(/https:\/\/www\.youtube\.com\/watch\?v=[a-zA-Z0-9_-]+/);
            if (urlMatch) {
              longformUrl = urlMatch[0];
              console.log('📺 [longform-url API] youtube_upload.log에서 발견:', longformUrl);
            }
          }
        } catch (err) {
          console.warn('⚠️ [longform-url API] youtube_upload.log 읽기 실패:', err);
        }
      }
    }

    return NextResponse.json({
      success: true,
      longformUrl: longformUrl || null,
      longformChannelId: longformChannelId || null,  // ⭐ 롱폼 채널 ID 추가
      isShortform: true
    });

  } catch (error: any) {
    console.error('❌ [longform-url API] 오류:', error);
    return NextResponse.json({
      success: false,
      error: error.message || '알 수 없는 오류'
    }, { status: 500 });
  }
}
