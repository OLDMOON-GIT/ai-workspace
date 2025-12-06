import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { QueueManager } from '@/lib/queue-manager';
import { run } from '@/lib/mysql';

/**
 * POST /api/queue/clear
 * 큐만 삭제 (content는 유지!)
 * - task_queue (큐) - queue.sqlite & database.sqlite 둘 다
 * - task_schedule (스케줄)
 * (task_log는 파일 기반으로 변경됨 - tasks 폴더에 저장)
 *
 * ⚠️ content 테이블은 삭제하지 않음! (대본/영상 데이터 보존)
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user || !user.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const manager = new QueueManager();

    try {
      // 1. 큐 삭제 (queue.sqlite의 task_queue)
      const queueDeleted = await manager.clearAll();

      // 2. 관련 큐 데이터 삭제 (MySQL)
      // ⚠️ content 테이블은 삭제하지 않음!
      let schedulesDeleted = 0;
      let queueDbDeleted = 0;

      // MySQL의 task_queue 삭제
      try {
        const queueResult = await run('DELETE FROM task_queue', []);
        queueDbDeleted = queueResult.affectedRows || 0;
        console.log(`✅ [CLEAR] MySQL task_queue 삭제: ${queueDbDeleted}개`);
      } catch (e: any) {
        console.warn('⚠️ [CLEAR] task_queue 테이블 삭제 실패 (무시):', e.message);
      }

      // task_log는 파일 기반으로 변경됨 - 삭제 불필요 (tasks 폴더에 저장)

      // task_schedule 테이블 삭제 (⚠️ task_schedule 테이블 제거됨 - 큐 스펙 v3)
      schedulesDeleted = 0;

      console.log('🗑️ [CLEAR] 큐 데이터 삭제 완료 (content 유지):');
      console.log(`   - 큐(queue.sqlite): ${queueDeleted}개`);
      console.log(`   - 큐(MySQL): ${queueDbDeleted}개`);
      console.log(`   - 스케줄: ${schedulesDeleted}개`);

      return NextResponse.json({
        success: true,
        message: `큐가 초기화되었습니다.\n큐: ${queueDeleted + queueDbDeleted}개, 스케줄: ${schedulesDeleted}개 삭제\n(대본/영상은 유지됨)`,
        deleted: {
          queue: queueDeleted,
          queueDb: queueDbDeleted,
          schedules: schedulesDeleted
        }
      });

    } finally {
      manager.close();
    }

  } catch (error: any) {
    console.error('❌ Queue clear error:', error);
    return NextResponse.json(
      { error: error.message || '서버 오류' },
      { status: 500 }
    );
  }
}
