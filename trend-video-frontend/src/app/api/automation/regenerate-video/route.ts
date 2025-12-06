import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import db from '@/lib/sqlite';
import path from 'path';

const dbPath = path.join(process.cwd(), 'data', 'database.sqlite');

/**
 * POST /api/automation/regenerate-video
 * 영상 재생성
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user || !user.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { videoId, scriptId } = body;

    if (!videoId && !scriptId) {
      return NextResponse.json({ error: 'videoId or scriptId is required' }, { status: 400 });
    }

    console.log(`🔄 영상 재생성 요청: videoId=${videoId}, scriptId=${scriptId}`);

    // MySQL: using imported db

    // videoId가 있으면 비디오 기록 확인, 없으면 scriptId 사용
    // v6: task_id = content_id (통합 키 시스템)
    let targetVideoId = videoId;

    if (!targetVideoId && scriptId) {
      // scriptId가 곧 content_id
      targetVideoId = scriptId;
    }

    if (!targetVideoId) {
      // MySQL: pool manages connections
      return NextResponse.json({ error: '영상을 찾을 수 없습니다.' }, { status: 404 });
    }

    // ⭐ 기존 영상 확인 (video_path 조건 제거, 폴더로 확인)
    const existingVideo = await db.prepare(`
      SELECT content_id, title, status
      FROM content
      WHERE content_id = ?
    `).get(targetVideoId) as any;

    if (!existingVideo) {
      // MySQL: pool manages connections
      return NextResponse.json({ error: '기존 콘텐츠를 찾을 수 없습니다.' }, { status: 404 });
    }

    // 기존 영상 상태를 pending으로 변경
    await db.prepare(`
      UPDATE content
      SET status = 'pending',
          error = NULL,
          updated_at = CURRENT_TIMESTAMP
      WHERE content_id = ?
    `).run(targetVideoId);

    // MySQL: pool manages connections

    console.log(`✅ 영상 재생성 준비 완료: ${targetVideoId}`);
    console.log(`   기존 제목: ${existingVideo.title}`);
    console.log(`   상태: ${existingVideo.status} → pending`);

    return NextResponse.json({
      success: true,
      message: '영상이 재생성 대기 상태로 변경되었습니다. 스케줄러가 자동으로 재생성합니다.',
      videoId: targetVideoId
    });

  } catch (error: any) {
    console.error('POST /api/automation/regenerate-video error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
