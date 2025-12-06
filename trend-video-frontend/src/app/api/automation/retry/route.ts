import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { QueueManager } from '@/lib/queue-manager';
import { parseJsonSafely } from '@/lib/json-utils';
import { addTitleLog } from '@/lib/automation';
import db from '@/lib/sqlite';
import path from 'path';
import fs from 'fs';
// BTS-0000033: executeRetryPipeline import 제거 (더 이상 사용하지 않음)

const dbPath = path.join(process.cwd(), 'data', 'database.sqlite');

/**
 * POST /api/automation/retry
 * task_queue의 현재 type/status에 맞게 적절한 단계부터 재시도
 *
 * - image failed → story.json 확인 후 image부터 재시도
 * - video failed → 이미지 파일 확인 후 video부터 재시도
 * - youtube failed → output.mp4 확인 후 youtube부터 재시도
 */
export async function POST(request: NextRequest) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`🔄 [RETRY API] Called at ${new Date().toISOString()}`);
  console.log(`🔄 [RETRY API] TEST: This log should appear if code is updated!`);
  console.log(`${'='.repeat(80)}\n`);

  try {
    const user = await getCurrentUser(request);
    if (!user || !user.isAdmin) {
      console.log(`❌ [RETRY API] Unauthorized`);
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { taskId, preview, forceType } = body;
    console.log(`🔍 [RETRY API] Request body:`, { taskId, preview, forceType });

    if (!taskId) {
      return NextResponse.json({ error: 'taskId is required' }, { status: 400 });
    }

    // forceType이 지정되면 해당 단계부터 강제 재시도 (completed 상태에서도 재업로드 가능)
    if (forceType && ['script', 'image', 'video', 'youtube'].includes(forceType)) {
      // MySQL: using imported db

      // task_queue 업데이트
      const forceResult = await db.prepare(`
        UPDATE task_queue
        SET type = ?, status = 'waiting', error = NULL
        WHERE task_id = ?
      `).run(forceType, taskId);

      console.log(`🔄 [RETRY FORCE] UPDATE task_queue: taskId=${taskId}, type=${forceType}, affected=${forceResult.changes || 0}`);

      // MySQL: pool manages connections

      console.log(`✅ [RETRY] Force ${forceType} for ${taskId}`);
      addTitleLog(taskId, 'info', `🔄 ${forceType}부터 강제 재시도`, forceType as any);
      return NextResponse.json({
        success: true,
        taskId,
        retryFromType: forceType,
        message: `${forceType}부터 강제 재시도`
      });
    }

    // MySQL: using imported db

    // 1. task_queue에서 현재 상태 확인
    const queueItem = await db.prepare(`
      SELECT task_id, type, status, error
      FROM task_queue
      WHERE task_id = ?
    `).get(taskId) as any;

    if (!queueItem) {
      // MySQL: pool manages connections
      return NextResponse.json({ error: 'Task not found in queue' }, { status: 404 });
    }

    // 2. task + content + content_setting 정보 조회 (v5: 통합 키 시스템)
    const task = await db.prepare(`
      SELECT t.*, c.title, c.prompt_format, c.youtube_url,
             cs.settings, cs.media_mode, c.youtube_channel
      FROM task t
      LEFT JOIN content c ON t.task_id = c.content_id
      LEFT JOIN content_setting cs ON t.task_id = cs.content_id
      WHERE t.task_id = ?
    `).get(taskId) as any;
    if (!task) {
      // MySQL: pool manages connections
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    // 2-1. YouTube 업로드 여부 확인 (content.youtube_url 컬럼 사용)
    let hasYoutubeLink = false;
    let youtubeUrl = '';
    if (task.youtube_url) {
      hasYoutubeLink = true;
      youtubeUrl = task.youtube_url;
    }

    // 3. 파일 경로 확인 (backend/tasks 폴더)
    const backendPath = path.join(process.cwd(), '..', 'trend-video-backend', 'tasks', taskId);
    const storyPath = path.join(backendPath, 'story.json');

    // story.json 존재 + 유효한 JSON인지 확인 (parseJsonSafely 사용)
    let hasStory = false;
    let storyValid = false;
    if (fs.existsSync(storyPath)) {
      hasStory = true;
      const storyContent = fs.readFileSync(storyPath, 'utf-8');
      const parseResult = parseJsonSafely(storyContent, { logErrors: false });
      if (parseResult.success && parseResult.data) {
        // scenes 배열이 있고 비어있지 않으면 유효
        storyValid = Array.isArray(parseResult.data.scenes) && parseResult.data.scenes.length > 0;
        if (parseResult.fixed) {
          console.log(`🔧 [RETRY] story.json 자동 수정됨`);
        }
      } else {
        console.log(`⚠️ [RETRY] story.json 파싱 실패: ${parseResult.error}`);
        storyValid = false;
      }
    }

    // 비디오 파일 확인 (output.mp4, merged.mp4, 또는 다른 mp4 파일)
    let hasVideo = false;
    let videoFileName = '';
    if (fs.existsSync(backendPath)) {
      const files = fs.readdirSync(backendPath);
      // scene_XX.mp4는 제외하고 최종 영상 파일 찾기
      const videoFile = files.find(f =>
        f.endsWith('.mp4') &&
        !f.startsWith('scene_') &&
        !f.includes('_audio')
      );
      if (videoFile) {
        hasVideo = true;
        videoFileName = videoFile;
      }
    }

    // 4. media_mode 확인
    let mediaMode = 'crawl';
    if (task.settings) {
      try {
        const settings = JSON.parse(task.settings);
        mediaMode = settings.mediaMode || settings.media_mode || 'crawl';
      } catch (e) {}
    }
    if (task.media_mode) {
      mediaMode = task.media_mode;
    }

    // 이미지 파일 확인 (.png, .jpg, .jpeg 모두 체크)
    // scene_* 패턴 또는 숫자.확장자 패턴 (1.jpeg, 2.jpeg 등 Whisk 출력)
    let hasImages = false;
    let imageCount = 0;
    if (fs.existsSync(backendPath)) {
      const files = fs.readdirSync(backendPath);
      const imageFiles = files.filter(f => {
        const ext = f.endsWith('.png') || f.endsWith('.jpg') || f.endsWith('.jpeg');
        if (!ext) return false;
        // scene_* 패턴
        if (f.startsWith('scene_')) return true;
        // 숫자.확장자 패턴 (1.jpeg, 2.jpg 등)
        const numMatch = f.match(/^(\d+)\.(png|jpg|jpeg)$/);
        if (numMatch) return true;
        return false;
      });
      hasImages = imageFiles.length > 0;
      imageCount = imageFiles.length;
    }

    console.log(`🔍 [RETRY] ========================================`);
    console.log(`🔍 [RETRY] Task: ${taskId}`);
    console.log(`🔍 [RETRY] Current Queue Status:`);
    console.log(`   - type: ${queueItem.type}`);
    console.log(`   - status: ${queueItem.status}`);
    console.log(`   - error: ${queueItem.error || 'N/A'}`);
    console.log(`🔍 [RETRY] Files:`);
    console.log(`   - story: ${hasStory} (valid: ${storyValid})`);
    console.log(`   - images: ${hasImages} (${imageCount}개)`);
    console.log(`   - video: ${hasVideo}${videoFileName ? ` (${videoFileName})` : ''}`);
    console.log(`   - youtube: ${hasYoutubeLink}`);
    console.log(`   - mediaMode: ${mediaMode}`);

    // 5. 재시도 시작 단계 결정 - 현재 type 기준 (파일 부족 시에만 fallback)
    let retryFromType = queueItem.type;
    let message = '';

    if (queueItem.status === 'failed' || queueItem.status === 'cancelled' || queueItem.status === 'completed') {
      // ✅ YouTube 재업로드 허용: hasYoutubeLink가 있어도 재시도 가능
      // ✅ completed 상태도 재시도 허용 (재업로드 기능)

      // ⭐ 현재 type 기준으로 재시도 (파일 부족 시에만 이전 단계로 fallback)
      if (queueItem.type === 'youtube') {
        if (hasVideo) {
          retryFromType = 'youtube';
          message = `YouTube 업로드 재시도 (${videoFileName})`;
        } else {
          retryFromType = 'video';
          message = '영상 파일이 없어서 video 단계부터 재시도합니다.';
        }
      } else if (queueItem.type === 'video') {
        // video는 그대로 재시도 (이미지/story 없어도 다시 시도)
        retryFromType = 'video';
        message = hasImages
          ? `영상 생성 재시도 (이미지 ${imageCount}개)`
          : '영상 생성 재시도';
      } else if (queueItem.type === 'image') {
        // image도 그대로 재시도 (story 파싱 실패해도 파일 존재하면 시도)
        if (hasStory) {
          retryFromType = 'image';
          message = `이미지 생성 재시도 (${mediaMode})`;
        } else {
          retryFromType = 'script';
          message = 'story.json이 없어서 script부터 재시도합니다.';
        }
      } else {
        retryFromType = 'script';
        message = '대본 생성부터 재시도합니다.';
      }

    } else if (queueItem.status === 'waiting') {
      message = `이미 대기 중입니다. (${queueItem.type})`;
      // MySQL: pool manages connections
      return NextResponse.json({
        success: false,
        error: message,
        currentType: queueItem.type,
        currentStatus: queueItem.status
      }, { status: 400 });
    } else if (queueItem.status === 'processing') {
      // ✅ processing 상태라도 10분 이상 지속되면 좀비 프로세스로 간주하고 재시도 허용
      const updatedAt = new Date(queueItem.updated_at || queueItem.updatedAt);
      const now = new Date();
      const minutesElapsed = (now.getTime() - updatedAt.getTime()) / 1000 / 60;

      if (minutesElapsed > 10) {
        console.log(`⚠️ [RETRY] Zombie processing detected (${minutesElapsed.toFixed(1)}분 경과) - 강제 재시도`);
        retryFromType = queueItem.type;
        message = `좀비 프로세스 감지 (${minutesElapsed.toFixed(0)}분 경과) - 강제 재시도`;
      } else {
        message = `현재 처리 중입니다. (${queueItem.type})`;
        // MySQL: pool manages connections
        return NextResponse.json({
          success: false,
          error: message,
          currentType: queueItem.type,
          currentStatus: queueItem.status,
          minutesElapsed: minutesElapsed.toFixed(1)
        }, { status: 400 });
      }
    }
    // ✅ completed 상태 차단 제거 - 재업로드 허용

    // preview 모드면 정보만 반환 (DB 업데이트 없음)
    if (preview) {
      // MySQL: pool manages connections
      console.log(`🔍 [RETRY PREVIEW] ${taskId}: ${queueItem.type} → ${retryFromType} (미리보기)`);
      return NextResponse.json({
        success: true,
        preview: true,
        taskId,
        previousType: queueItem.type,
        previousStatus: queueItem.status,
        retryFromType,
        message,
        files: {
          hasStory,
          storyValid,
          hasImages,
          imageCount,
          hasVideo,
          videoFileName: videoFileName || null,
          hasYoutubeLink,
          youtubeUrl: youtubeUrl || null
        },
        mediaMode
      });
    }

    // 6. task_queue 업데이트 전 확인
    console.log(`🔄 [RETRY] UPDATE 시도 중...`);
    console.log(`   - taskId: ${taskId}`);
    console.log(`   - retryFromType: ${retryFromType}`);
    console.log(`   - 변경 전 상태: type=${queueItem.type}, status=${queueItem.status}`);

    // 6-1. UPDATE 전에 레코드 존재 확인
    const beforeUpdate = await db.prepare(`
      SELECT task_id, type, status, error FROM task_queue WHERE task_id = ?
    `).get(taskId) as any;

    if (!beforeUpdate) {
      console.error(`❌ [RETRY] task_queue에 레코드 없음! taskId=${taskId}`);
      return NextResponse.json({
        error: 'task_queue에 레코드가 없습니다.',
        taskId,
        retryFromType
      }, { status: 500 });
    }

    console.log(`✅ [RETRY] UPDATE 전 레코드 확인: type=${beforeUpdate.type}, status=${beforeUpdate.status}`);

    // 6-2. task_queue 업데이트: type 변경, status는 waiting으로 (BTS-0000033: worker가 자연스럽게 처리)
    const updateResult = await db.prepare(`
      UPDATE task_queue
      SET type = ?, status = 'waiting', error = NULL
      WHERE task_id = ?
    `).run(retryFromType, taskId);

    console.log(`🔄 [RETRY] UPDATE 실행 완료: affected=${updateResult.changes || 0}`);

    if (updateResult.changes === 0) {
      console.error(`❌ [RETRY] task_queue 업데이트 실패 - affected rows = 0`);
      return NextResponse.json({
        error: 'task_queue 업데이트 실패 (affected rows = 0)',
        taskId,
        retryFromType
      }, { status: 500 });
    }

    // 6-3. task_lock 해제 (혹시 걸려있으면)
    await db.prepare(`
      UPDATE task_lock
      SET lock_task_id = NULL, locked_at = NULL, worker_pid = NULL
      WHERE lock_task_id = ?
    `).run(taskId);

    console.log(`✅ [RETRY] ${taskId}: ${queueItem.type} → ${retryFromType} (waiting, worker will handle)`);
    addTitleLog(taskId, 'info', `🔄 재시도: ${queueItem.type}(${queueItem.status}) → ${retryFromType}`, retryFromType as any);

    // BTS-0000033: executeRetryPipeline 호출 제거
    // - status='waiting'으로 설정했으므로 Worker가 자동으로 처리
    // - executeRetryPipeline과 Worker가 동시에 실행되면서 락 충돌 발생
    // - uploadToYouTube() 함수도 작동하지 않음 (항상 에러 발생)
    // → Worker에게만 처리 위임

    return NextResponse.json({
      success: true,
      taskId,
      previousType: queueItem.type,
      previousStatus: queueItem.status,
      retryFromType,
      message,
      files: {
        hasStory,
        storyValid,
        hasImages,
        imageCount,
        hasVideo,
        videoFileName: videoFileName || null,
        hasYoutubeLink,
        youtubeUrl: youtubeUrl || null
      },
      mediaMode
    });

  } catch (error: any) {
    console.error('POST /api/automation/retry error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
