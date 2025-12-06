/**
 * @fileoverview 서버 재시작 시 중단된 작업 복구
 * @description PC/서버가 죽었다가 다시 살아났을 때 processing 상태로 남아있는 작업들을
 *              failed로 변경하여 재시도 가능하게 만듦
 */

import { getAll, run } from './mysql';

/** 로컬 시간을 YYYY-MM-DD HH:mm:ss 형식으로 반환 */
function getLocalDateTime(): string {
  const now = new Date();
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}

export interface RecoveryResult {
  contentRecovered: number;
  queueRecovered: number;
  scheduleRecovered: number;
  recoveredIds: string[];
  locksReleased: number;
}

/**
 * 서버 시작 시 중단된 작업들을 복구합니다.
 * - content 테이블: processing → failed
 * - task_queue 테이블: processing → failed
 * - task_lock 테이블: 좀비 락 정리 (죽은 PID, 5분 이상 된 락)
 */
export async function recoverStaleProcessingJobs(): Promise<RecoveryResult> {
  const now = getLocalDateTime();
  const recoveredIds: string[] = [];

  console.log('🔄 [STARTUP-RECOVERY] 서버 재시작 - 중단된 작업 복구 시작...');

  // 0. task_lock 좀비 락 정리 (모든 락 해제 - 서버 재시작 시점에는 실행 중인 작업이 없음)
  let locksReleased = 0;
  try {
    const staleLocks = await getAll(`
      SELECT task_type, lock_task_id, locked_at, worker_pid
      FROM task_lock
      WHERE worker_pid IS NOT NULL
    `);

    if (staleLocks.length > 0) {
      console.log(`🔒 [STARTUP-RECOVERY] task_lock 테이블에서 ${staleLocks.length}개의 좀비 락 발견`);

      for (const lock of staleLocks) {
        console.log(`  - ${lock.task_type}: lock_task_id=${lock.lock_task_id}, pid=${lock.worker_pid}, locked_at=${lock.locked_at}`);
      }

      const releaseResult = await run(`
        UPDATE task_lock
        SET lock_task_id = NULL, locked_at = NULL, worker_pid = NULL
        WHERE worker_pid IS NOT NULL
      `);

      locksReleased = releaseResult.affectedRows || 0;
      console.log(`🔓 [STARTUP-RECOVERY] ${locksReleased}개의 좀비 락 해제 완료`);
    }
  } catch (e: any) {
    console.log(`⚠️ [STARTUP-RECOVERY] task_lock 정리 실패: ${e.message}`);
  }

  // 1. content 테이블에서 processing 상태 복구
  const staleContents = await getAll(`
    SELECT content_id, title, status, updated_at
    FROM content
    WHERE status = 'processing'
  `) as { content_id: string; title: string; status: string; updated_at: string }[];

  if (staleContents.length > 0) {
    console.log(`📋 [STARTUP-RECOVERY] content 테이블에서 ${staleContents.length}개의 processing 작업 발견`);

    for (const content of staleContents) {
      console.log(`  - ${content.content_id}: "${content.title}" (마지막 업데이트: ${content.updated_at})`);
      recoveredIds.push(content.content_id);
    }

    await run(`
      UPDATE content
      SET status = 'failed',
          error = ?,
          updated_at = ?
      WHERE status = 'processing'
    `, ['서버 재시작으로 인해 중단됨 - 재시도 필요', now]);
  }

  // 2. task_queue 테이블에서 processing 상태 복구
  let queueRecovered = 0;
  try {
    const staleQueues = await getAll(`
      SELECT task_id, type, status, created_at
      FROM task_queue
      WHERE status = 'processing'
    `) as { task_id: string; type: string; status: string; created_at: string }[];

    if (staleQueues.length > 0) {
      console.log(`📋 [STARTUP-RECOVERY] task_queue 테이블에서 ${staleQueues.length}개의 processing 작업 발견`);

      for (const queue of staleQueues) {
        console.log(`  - ${queue.task_id} (type: ${queue.type}, 시작: ${queue.created_at})`);
        if (!recoveredIds.includes(queue.task_id)) {
          recoveredIds.push(queue.task_id);
        }
      }

      const result = await run(`
        UPDATE task_queue
        SET status = 'failed',
            error = ?
        WHERE status = 'processing'
      `, ['서버 재시작으로 인해 중단됨']);

      queueRecovered = result.affectedRows || 0;
    }
  } catch (e: any) {
    // task_queue 테이블이 없을 수 있음
    console.log(`⚠️ [STARTUP-RECOVERY] task_queue 테이블 접근 실패: ${e.message}`);
  }

  // 3. task_schedule 제거됨 (v6: task_queue만 사용)
  let scheduleRecovered = 0;

  const result: RecoveryResult = {
    contentRecovered: staleContents.length,
    queueRecovered,
    scheduleRecovered,
    recoveredIds,
    locksReleased
  };

  if (recoveredIds.length > 0 || locksReleased > 0) {
    console.log(`✅ [STARTUP-RECOVERY] 복구 완료: content=${result.contentRecovered}, queue=${result.queueRecovered}, locks=${result.locksReleased}`);
    if (recoveredIds.length > 0) {
      console.log(`📝 [STARTUP-RECOVERY] 복구된 작업 ID: ${recoveredIds.join(', ')}`);
    }
  } else {
    console.log('✅ [STARTUP-RECOVERY] 복구할 작업 없음 - 모든 작업이 정상 상태');
  }

  return result;
}

/**
 * 특정 시간 이상 processing 상태로 남아있는 작업을 stale로 판단하여 복구
 * @param thresholdMinutes - stale 판단 기준 시간 (분)
 */
export async function recoverStaleJobsByTime(thresholdMinutes: number = 30): Promise<RecoveryResult> {
  const nowStr = getLocalDateTime();
  const recoveredIds: string[] = [];

  console.log(`🔄 [STALE-RECOVERY] ${thresholdMinutes}분 이상 processing 상태인 작업 복구 시작...`);

  // content 테이블
  const staleContents = await getAll(`
    SELECT content_id, title, updated_at
    FROM content
    WHERE status = 'processing' AND updated_at < DATE_SUB(NOW(), INTERVAL ? MINUTE)
  `, [thresholdMinutes]) as { content_id: string; title: string; updated_at: string }[];

  if (staleContents.length > 0) {
    console.log(`📋 [STALE-RECOVERY] content 테이블에서 ${staleContents.length}개의 stale 작업 발견`);

    for (const content of staleContents) {
      console.log(`  - ${content.content_id}: "${content.title}" (마지막 업데이트: ${content.updated_at})`);
      recoveredIds.push(content.content_id);
    }

    await run(`
      UPDATE content
      SET status = 'failed',
          error = ?,
          updated_at = ?
      WHERE status = 'processing' AND updated_at < DATE_SUB(NOW(), INTERVAL ? MINUTE)
    `, [`${thresholdMinutes}분 이상 응답 없음 - stale 작업으로 판단`, nowStr, thresholdMinutes]);
  }

  // task_queue 테이블
  let queueRecovered = 0;
  try {
    const result = await run(`
      UPDATE task_queue
      SET status = 'failed',
          error = ?
      WHERE status = 'processing' AND created_at < DATE_SUB(NOW(), INTERVAL ? MINUTE)
    `, [`${thresholdMinutes}분 이상 응답 없음`, thresholdMinutes]);
    queueRecovered = result.affectedRows || 0;
  } catch (e: any) {
    console.log(`⚠️ [STALE-RECOVERY] task_queue 업데이트 실패: ${e.message}`);
  }

  // task_lock 정리 (N분 이상 된 락)
  let locksReleased = 0;
  try {
    const lockResult = await run(`
      UPDATE task_lock
      SET lock_task_id = NULL, locked_at = NULL, worker_pid = NULL
      WHERE worker_pid IS NOT NULL AND locked_at < DATE_SUB(NOW(), INTERVAL ? MINUTE)
    `, [thresholdMinutes]);
    locksReleased = lockResult.affectedRows || 0;

    if (locksReleased > 0) {
      console.log(`🔓 [STALE-RECOVERY] ${locksReleased}개의 stale 락 해제 완료`);
    }
  } catch (e: any) {
    console.log(`⚠️ [STALE-RECOVERY] task_lock 정리 실패: ${e.message}`);
  }

  // task_queue 테이블 (task_schedule은 제거됨)
  let scheduleRecovered = 0;
  // task_queue는 이미 위에서 복구했으므로 여기서는 스킵
  // (queueRecovered에 포함됨)

  const result: RecoveryResult = {
    contentRecovered: staleContents.length,
    queueRecovered,
    scheduleRecovered,
    recoveredIds,
    locksReleased
  };

  if (recoveredIds.length > 0) {
    console.log(`✅ [STALE-RECOVERY] 복구 완료: ${recoveredIds.length}개 작업`);
  }

  return result;
}
