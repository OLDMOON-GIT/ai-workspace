import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import db from '@/lib/sqlite';
import path from 'path';
import { addContentLog } from '@/lib/content';

const dbPath = path.join(process.cwd(), 'data', 'database.sqlite');

/**
 * DELETE /api/automation/cleanup
 * 큐 전체 초기화 (task, task_schedule, task_queue 삭제, content는 유지)
 */
export async function DELETE(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user || !user.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // MySQL: using imported db

    // 삭제할 task 목록 조회 (content 상태 포함)
    const tasksToDelete = await db.prepare(`
      SELECT t.task_id, c.status as contentStatus
      FROM task t
      LEFT JOIN content c ON t.task_id = c.content_id
      WHERE t.user_id = ?
    `).all(user.userId);
    console.log(`🔍 [CLEANUP] Found ${tasksToDelete.length} tasks to delete for user ${user.userId}`);

    let deletedTaskCount = 0;
    let deletedQueueCount = 0;
    let deletedLockCount = 0;
    let deletedContentCount = 0;

    for (const task of tasksToDelete as any[]) {
      // 1. task_queue 삭제
      const queueResult = await db.prepare('DELETE FROM task_queue WHERE task_id = ?').run(task.task_id);
      deletedQueueCount += queueResult.changes;

      // 2. task_time_log 삭제
      await db.prepare('DELETE FROM task_time_log WHERE task_id = ?').run(task.task_id);

      // 3. content.status = 'draft'인 경우 content_setting, content 삭제
      if (task.contentStatus === 'draft') {
        await db.prepare('DELETE FROM content_setting WHERE content_id = ?').run(task.task_id);
        const contentResult = await db.prepare('DELETE FROM content WHERE content_id = ?').run(task.task_id);
        deletedContentCount += contentResult.changes;
      }

      // 4. task_lock 해제 (lock_task_id = task_id → NULL)
      const lockResult = await db.prepare('UPDATE task_lock SET lock_task_id = NULL, locked_at = NULL, worker_pid = NULL WHERE lock_task_id = ?').run(task.task_id);
      deletedLockCount += lockResult.changes;

      // 5. task 삭제
      const taskResult = await db.prepare('DELETE FROM task WHERE task_id = ?').run(task.task_id);
      deletedTaskCount += taskResult.changes;
    }

    // MySQL: pool manages connections

    const message = `${deletedTaskCount}개의 작업이 삭제되었습니다 (큐: ${deletedQueueCount}개, 락: ${deletedLockCount}개, draft 콘텐츠: ${deletedContentCount}개)`;
    console.log(`🗑️ [CLEANUP] ${message}`);

    return NextResponse.json({
      success: true,
      deletedCount: deletedTaskCount,
      deletedQueueCount,
      deletedLockCount,
      deletedContentCount,
      message
    });

  } catch (error: any) {
    console.error('DELETE /api/automation/cleanup error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * POST /api/automation/cleanup
 * stuck된 processing 스케줄 정리
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user || !user.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // MySQL: using imported db

    // 10분 이상 processing 상태인 작업 찾기 (task_queue 기준)
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();

    const stuckTasks = await db.prepare(`
      SELECT q.task_id as taskId, q.type, q.status
      FROM task_queue q
      LEFT JOIN task_time_log log ON q.task_id = log.task_id AND q.type = log.type AND log.end_time IS NULL
      WHERE q.status = 'processing'
        AND log.start_time IS NOT NULL
        AND log.start_time < ?
    `).all(tenMinutesAgo) as any[];

    console.log(`🧹 [CLEANUP] Found ${stuckTasks.length} stuck tasks`);

    let cleanedCount = 0;

    for (const task of stuckTasks) {
      try {
        // task_queue에서 상태 업데이트
        await db.prepare(`
          UPDATE task_queue
          SET status = 'failed', error = 'Stuck 작업 자동 정리 (10분 이상 진행 없음)'
          WHERE task_id = ? AND type = ?
        `).run(task.taskId, task.type);

        // 파일 기반 로그 (task_log 테이블 대신)
        addContentLog(task.taskId, '⚠️ Stuck 작업 자동 정리 (10분 이상 진행 없음)', task.type);

        cleanedCount++;
        console.log(`✅ [CLEANUP] Cleaned task: ${task.taskId} (type: ${task.type})`);
      } catch (e: any) {
        console.error(`❌ [CLEANUP] Failed to clean task ${task.taskId}:`, e.message);
      }
    }

    // MySQL: pool manages connections

    return NextResponse.json({
      success: true,
      cleanedCount,
      message: `${cleanedCount}개의 stuck 작업을 정리했습니다`
    });

  } catch (error: any) {
    console.error('POST /api/automation/cleanup error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
