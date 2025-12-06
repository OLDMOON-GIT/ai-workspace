import { NextRequest, NextResponse } from 'next/server';
import { run, getOne } from '@/lib/mysql';

/**
 * BTS-3203: Spawn 완료 후 task_queue 상태 업데이트 API
 *
 * POST: Spawn 결과를 task_queue에 반영
 */

// BTS-3317: status ENUM 유효값 목록
const VALID_STATUS = ['waiting', 'processing', 'completed', 'failed', 'cancelled'] as const;

// BTS-3317: 비표준 status 값을 ENUM 값으로 매핑
function normalizeStatus(status: string | undefined): string {
  if (!status) return 'completed';

  // 이미 유효한 ENUM 값이면 그대로 반환
  if (VALID_STATUS.includes(status as any)) {
    return status;
  }

  // 비표준 값 매핑
  const statusMap: Record<string, string> = {
    'script_completed': 'completed',
    'script': 'completed',
    'done': 'completed',
    'success': 'completed',
    'error': 'failed',
    'fail': 'failed',
    'pending': 'waiting',
    'running': 'processing',
  };

  return statusMap[status.toLowerCase()] || 'completed';
}

export async function POST(request: NextRequest) {
  try {
    const { taskId, storyPath, sceneCount, status: rawStatus } = await request.json();

    // BTS-3317: status 값 정규화
    const status = normalizeStatus(rawStatus);

    if (!taskId) {
      return NextResponse.json(
        { error: 'taskId가 필요합니다.' },
        { status: 400 }
      );
    }

    // task_queue 존재 여부 확인
    const existing = await getOne<any>(
      'SELECT task_id, status FROM task_queue WHERE task_id = ?',
      [taskId]
    );

    if (existing) {
      // 기존 레코드 업데이트
      await run(
        `UPDATE task_queue
         SET status = ?,
             script_completed_at = NOW(),
             updated_at = NOW()
         WHERE task_id = ?`,
        [status, taskId]
      );

      console.log(`[UPDATE-SPAWN] ${taskId} task_queue 업데이트: ${status}`);
    } else {
      // task_queue에 없으면 새로 생성
      await run(
        `INSERT INTO task_queue (task_id, type, status, script_completed_at, created_at, updated_at, user_id)
         VALUES (?, 'script', ?, NOW(), NOW(), NOW(), 'system')`,
        [taskId, status]
      );

      console.log(`[UPDATE-SPAWN] ${taskId} task_queue 생성: ${status}`);
    }

    return NextResponse.json({
      success: true,
      taskId,
      status,
      storyPath,
      sceneCount
    });

  } catch (error: any) {
    console.error('Update spawn error:', error);
    return NextResponse.json(
      { error: error.message || 'task_queue 업데이트 실패' },
      { status: 500 }
    );
  }
}
