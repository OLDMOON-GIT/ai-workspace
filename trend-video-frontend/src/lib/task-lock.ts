/**
 * Task Lock Management
 * task_type별 락을 관리하여 동시성 제어
 */

import { getOne, run } from './mysql';

export type TaskType = 'script' | 'image' | 'video' | 'youtube';

/**
 * 락 획득 시도
 * @returns true if lock acquired, false otherwise
 */
export async function acquireLock(
  taskType: TaskType,
  workerId: string,
  workerPid?: number
): Promise<boolean> {
  try {
    const now = new Date().toISOString().replace('T', ' ').substring(0, 19);

    // UPDATE ... WHERE lock_task_id IS NULL (atomic operation)
    const result = await run(`
      UPDATE task_lock
      SET lock_task_id = ?, locked_at = ?, worker_pid = ?
      WHERE task_type = ? AND (lock_task_id IS NULL OR locked_at < DATE_SUB(NOW(), INTERVAL 5 MINUTE))
    `, [workerId, now, workerPid || process.pid, taskType]);

    const acquired = result.affectedRows > 0;

    if (acquired) {
      console.log(`🔒 [LOCK] Acquired: ${taskType} by ${workerId}`);
    }

    return acquired;
  } catch (error) {
    console.error(`❌ [LOCK] Failed to acquire ${taskType}:`, error);
    return false;
  }
}

/**
 * 락 해제
 */
export async function releaseLock(
  taskType: TaskType,
  workerId: string
): Promise<void> {
  try {
    await run(`
      UPDATE task_lock
      SET lock_task_id = NULL, locked_at = NULL, worker_pid = NULL
      WHERE task_type = ? AND lock_task_id = ?
    `, [taskType, workerId]);

    console.log(`🔓 [LOCK] Released: ${taskType} by ${workerId}`);
  } catch (error) {
    console.error(`❌ [LOCK] Failed to release ${taskType}:`, error);
  }
}

/**
 * 락 상태 확인
 */
export async function checkLock(taskType: TaskType): Promise<{
  locked: boolean;
  lockedBy?: string;
  lockedAt?: Date;
  workerPid?: number;
}> {
  try {
    const lock = await getOne(`
      SELECT lock_task_id, locked_at, worker_pid
      FROM task_lock
      WHERE task_type = ?
    `, [taskType]) as any;

    if (!lock || !lock.lock_task_id) {
      return { locked: false };
    }

    return {
      locked: true,
      lockedBy: lock.lock_task_id,
      lockedAt: lock.locked_at,
      workerPid: lock.worker_pid
    };
  } catch (error) {
    console.error(`❌ [LOCK] Failed to check ${taskType}:`, error);
    return { locked: false };
  }
}

/**
 * 만료된 락 정리 (5분 이상 된 락)
 */
export async function cleanupStaleLocks(): Promise<void> {
  try {
    const result = await run(`
      UPDATE task_lock
      SET lock_task_id = NULL, locked_at = NULL, worker_pid = NULL
      WHERE lock_task_id IS NOT NULL AND locked_at < DATE_SUB(NOW(), INTERVAL 5 MINUTE)
    `);

    if (result.affectedRows > 0) {
      console.log(`🧹 [LOCK] Cleaned up ${result.affectedRows} stale lock(s)`);
    }
  } catch (error) {
    console.error('❌ [LOCK] Failed to cleanup stale locks:', error);
  }
}
