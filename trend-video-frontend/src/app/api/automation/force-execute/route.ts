import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { getOne, run } from '@/lib/mysql';
import { getSql } from '@/lib/sql-mapper';

/**
 * POST /api/automation/force-execute
 * 즉시 파이프라인 실행
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user || !user.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { titleId } = body;

    if (!titleId) {
      return NextResponse.json({ error: 'Title ID is required' }, { status: 400 });
    }

    // v5: task + content + content_setting 조인 조회
    const title = await getOne(
      getSql('automation', 'getTaskForForceExecute'),
      [titleId]
    ) as any;
    if (!title) {
      return NextResponse.json({ error: 'Title not found' }, { status: 404 });
    }

    // task_schedule 제거됨 - task_queue만 사용

    // ============================================================
    // 큐 상태 확인 (기존 큐가 있는지만 확인)
    // ============================================================
    const queueStatus = await getOne(
      getSql('automation', 'getQueueStatusForForceExecute'),
      [titleId]
    ) as any;

    // task.scheduled_time 업데이트 (즉시 실행 - 과거 시간)
    // ⭐ MySQL datetime 형식으로 변환: 'YYYY-MM-DD HH:MM:SS'
    // ✅ BTS-0000025: 로컬 시간대 유지
    const now = new Date(Date.now() - 1000); // 1초 전
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    const pastTime = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;

    await run(
      getSql('automation', 'updateTaskScheduledTimeForForceExecute'),
      [pastTime, titleId]
    );

    console.log(`✅ [FORCE-EXEC] Updated task.scheduled_time: ${titleId}`);

    // ============================================================
    // ⭐ task_queue 업데이트: type을 'script'로, status를 'waiting'으로 변경
    // ⚠️ worker가 lock을 잡고 처리하도록 함
    // ============================================================
    if (queueStatus) {
      // 기존 queue가 있으면 type을 'script'로, status를 'waiting'으로 업데이트
      await run(
        getSql('automation', 'updateQueueForForceExecute'),
        [titleId]
      );
      console.log(`✅ [FORCE-EXEC] Updated task_queue: ${titleId} (${queueStatus.type} → script, waiting for worker)`);
    } else {
      // queue가 없으면 새로 생성 (⚠️ task_id가 PK - REPLACE 필수!)
      await run(
        getSql('automation', 'replaceQueueForForceExecute'),
        [titleId, title.user_id || user.userId]
      );
      console.log(`✅ [FORCE-EXEC] Created new task_queue: ${titleId} (script, waiting for worker)`);
    }

    console.log(`🚀 [Force Execute] Queued for worker: ${title.title}`);

    return NextResponse.json({
      success: true,
      taskId: titleId,
      message: 'Worker 큐에 추가되었습니다'
    });

  } catch (error: any) {
    console.error('POST /api/automation/force-execute error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
