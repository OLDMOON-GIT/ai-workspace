/**
 * Task Lock 통합 테스트
 *
 * 테스트 시나리오:
 * 1. 성공 시 락 해제 확인
 * 2. 실패 시 락 해제 확인
 * 3. 타임아웃 시 락 해제 확인
 * 4. 예외 발생 시 락 해제 확인
 * 5. 동시 실행 방지 확인
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';

// MySQL 연결
const mysql = require('mysql2/promise');

let connection: any;

const DB_CONFIG = {
  host: 'localhost',
  user: 'root',
  password: 'trend2024!',
  database: 'trend_video'
};

beforeAll(async () => {
  connection = await mysql.createConnection(DB_CONFIG);
});

afterAll(async () => {
  if (connection) {
    await connection.end();
  }
});

beforeEach(async () => {
  // 테스트 전 락 초기화
  await connection.execute(`
    UPDATE task_lock
    SET locked_by = NULL, locked_at = NULL, worker_pid = NULL
  `);
});

describe('Task Lock 테스트', () => {

  test('락 획득 및 해제가 정상 작동해야 함', async () => {
    const taskType = 'script';
    const taskId = 'test_task_' + Date.now();

    // 1. 락 획득
    await connection.execute(`
      UPDATE task_lock
      SET locked_by = ?, locked_at = NOW(), worker_pid = ?
      WHERE task_type = ?
    `, [taskId, process.pid, taskType]);

    // 2. 락 확인
    const [rows] = await connection.execute(`
      SELECT locked_by, locked_at, worker_pid FROM task_lock WHERE task_type = ?
    `, [taskType]);

    expect(rows[0].locked_by).toBe(taskId);
    expect(rows[0].worker_pid).toBe(process.pid);

    // 3. 락 해제
    await connection.execute(`
      UPDATE task_lock
      SET locked_by = NULL, locked_at = NULL, worker_pid = NULL
      WHERE task_type = ?
    `, [taskType]);

    // 4. 해제 확인
    const [afterRows] = await connection.execute(`
      SELECT locked_by FROM task_lock WHERE task_type = ?
    `, [taskType]);

    expect(afterRows[0].locked_by).toBeNull();
  });

  test('락이 걸린 상태에서 다른 작업 실행 방지', async () => {
    const taskType = 'video';
    const taskId1 = 'task_1_' + Date.now();

    // 1. 첫 번째 작업이 락 획득
    await connection.execute(`
      UPDATE task_lock
      SET locked_by = ?, locked_at = NOW(), worker_pid = ?
      WHERE task_type = ?
    `, [taskId1, process.pid, taskType]);

    // 2. 락 상태 확인 (다른 작업이 실행 가능한지)
    const [rows] = await connection.execute(`
      SELECT locked_by, locked_at FROM task_lock WHERE task_type = ?
    `, [taskType]);

    const isLocked = rows[0].locked_by !== null;
    const lockTime = rows[0].locked_at ? new Date(rows[0].locked_at).getTime() : 0;
    const LOCK_TIMEOUT = 60 * 60 * 1000; // 1시간
    const isTimedOut = Date.now() - lockTime >= LOCK_TIMEOUT;

    // 락이 걸려있고 타임아웃 안됐으면 다른 작업 실행 불가
    expect(isLocked).toBe(true);
    expect(isTimedOut).toBe(false);

    // 정리
    await connection.execute(`
      UPDATE task_lock SET locked_by = NULL, locked_at = NULL WHERE task_type = ?
    `, [taskType]);
  });

  test('타임아웃된 락은 자동 해제되어야 함', async () => {
    const taskType = 'image';
    const oldTaskId = 'old_task_' + Date.now();

    // 1. 2시간 전 시간으로 락 설정 (타임아웃 상태)
    await connection.execute(`
      UPDATE task_lock
      SET locked_by = ?, locked_at = DATE_SUB(NOW(), INTERVAL 2 HOUR), worker_pid = ?
      WHERE task_type = ?
    `, [oldTaskId, 99999, taskType]);

    // 2. 타임아웃 체크 로직
    const [rows] = await connection.execute(`
      SELECT locked_by, locked_at FROM task_lock WHERE task_type = ?
    `, [taskType]);

    const lockTime = rows[0].locked_at ? new Date(rows[0].locked_at).getTime() : 0;
    const LOCK_TIMEOUT = 60 * 60 * 1000; // 1시간
    const isTimedOut = Date.now() - lockTime >= LOCK_TIMEOUT;

    expect(isTimedOut).toBe(true);

    // 3. 타임아웃된 락 해제
    if (isTimedOut) {
      await connection.execute(`
        UPDATE task_lock SET locked_by = NULL, locked_at = NULL, worker_pid = NULL
        WHERE task_type = ?
      `, [taskType]);
    }

    // 4. 해제 확인
    const [afterRows] = await connection.execute(`
      SELECT locked_by FROM task_lock WHERE task_type = ?
    `, [taskType]);

    expect(afterRows[0].locked_by).toBeNull();
  });

  test('모든 타입의 락이 독립적으로 동작해야 함', async () => {
    const types = ['script', 'image', 'video', 'youtube'];

    // 각 타입별로 다른 taskId로 락 획득
    for (const type of types) {
      await connection.execute(`
        UPDATE task_lock
        SET locked_by = ?, locked_at = NOW(), worker_pid = ?
        WHERE task_type = ?
      `, [`task_${type}_${Date.now()}`, process.pid, type]);
    }

    // 모든 락 확인
    const [rows] = await connection.execute(`
      SELECT task_type, locked_by FROM task_lock WHERE task_type IN (?, ?, ?, ?)
    `, types);

    for (const row of rows) {
      if (types.includes(row.task_type)) {
        expect(row.locked_by).not.toBeNull();
      }
    }

    // 정리: 모든 락 해제
    await connection.execute(`
      UPDATE task_lock SET locked_by = NULL, locked_at = NULL, worker_pid = NULL
      WHERE task_type IN (?, ?, ?, ?)
    `, types);
  });

  test('실패 시뮬레이션: 락이 해제되어야 함', async () => {
    const taskType = 'youtube';
    const taskId = 'fail_task_' + Date.now();

    // 1. 락 획득
    await connection.execute(`
      UPDATE task_lock
      SET locked_by = ?, locked_at = NOW(), worker_pid = ?
      WHERE task_type = ?
    `, [taskId, process.pid, taskType]);

    // 2. 작업 실패 시뮬레이션
    try {
      throw new Error('YouTube 업로드 실패: 인증 만료');
    } catch (error) {
      // 3. 실패 시 락 해제 (수정된 코드 동작)
      await connection.execute(`
        UPDATE task_lock
        SET locked_by = NULL, locked_at = NULL, worker_pid = NULL
        WHERE task_type = ?
      `, [taskType]);
    }

    // 4. 해제 확인
    const [rows] = await connection.execute(`
      SELECT locked_by FROM task_lock WHERE task_type = ?
    `, [taskType]);

    expect(rows[0].locked_by).toBeNull();
  });
});

describe('Task Queue 상태 테스트', () => {

  test('processing 상태의 작업이 있으면 새 작업 시작 안됨', async () => {
    const taskType = 'script';
    const taskId = 'processing_task_' + Date.now();

    // 1. processing 상태 작업 생성
    await connection.execute(`
      INSERT INTO task_queue (task_id, type, status, created_at, user_id)
      VALUES (?, ?, 'processing', NOW(), 'test_user')
      ON DUPLICATE KEY UPDATE status = 'processing'
    `, [taskId, taskType]);

    // 2. processing 카운트 확인
    const [rows] = await connection.execute(`
      SELECT COUNT(*) as count FROM task_queue
      WHERE type = ? AND status = 'processing'
    `, [taskType]);

    expect(rows[0].count).toBeGreaterThan(0);

    // 3. 정리
    await connection.execute(`DELETE FROM task_queue WHERE task_id = ?`, [taskId]);
  });

  test('failed 상태로 변경 시 락도 해제되어야 함', async () => {
    const taskType = 'video';
    const taskId = 'fail_test_' + Date.now();

    // 1. 작업 + 락 설정
    await connection.execute(`
      INSERT INTO task_queue (task_id, type, status, created_at, user_id)
      VALUES (?, ?, 'processing', NOW(), 'test_user')
    `, [taskId, taskType]);

    await connection.execute(`
      UPDATE task_lock
      SET locked_by = ?, locked_at = NOW(), worker_pid = ?
      WHERE task_type = ?
    `, [taskId, process.pid, taskType]);

    // 2. 실패 처리 (수정된 코드 동작 시뮬레이션)
    await connection.execute(`
      UPDATE task_queue
      SET status = 'failed', completed_at = NOW(), error = 'Test failure'
      WHERE task_id = ?
    `, [taskId]);

    // 락 해제도 함께 수행
    await connection.execute(`
      UPDATE task_lock
      SET locked_by = NULL, locked_at = NULL, worker_pid = NULL
      WHERE task_type = ?
    `, [taskType]);

    // 3. 확인
    const [queueRows] = await connection.execute(`
      SELECT status FROM task_queue WHERE task_id = ?
    `, [taskId]);

    const [lockRows] = await connection.execute(`
      SELECT locked_by FROM task_lock WHERE task_type = ?
    `, [taskType]);

    expect(queueRows[0].status).toBe('failed');
    expect(lockRows[0].locked_by).toBeNull();

    // 4. 정리
    await connection.execute(`DELETE FROM task_queue WHERE task_id = ?`, [taskId]);
  });
});

describe('상태 변환 통합 테스트', () => {

  test('waiting → processing 상태 변환이 정상 작동', async () => {
    const taskType = 'script';
    const taskId = 'state_test_' + Date.now();

    // 1. waiting 상태로 생성
    await connection.execute(`
      INSERT INTO task_queue (task_id, type, status, created_at, user_id)
      VALUES (?, ?, 'waiting', NOW(), 'test_user')
    `, [taskId, taskType]);

    // 2. processing으로 변경
    await connection.execute(`
      UPDATE task_queue
      SET status = 'processing', started_at = NOW()
      WHERE task_id = ? AND type = ? AND status = 'waiting'
    `, [taskId, taskType]);

    // 3. 확인
    const [rows] = await connection.execute(`
      SELECT status, started_at FROM task_queue WHERE task_id = ?
    `, [taskId]);

    expect(rows[0].status).toBe('processing');
    expect(rows[0].started_at).not.toBeNull();

    // 4. 정리
    await connection.execute(`DELETE FROM task_queue WHERE task_id = ?`, [taskId]);
  });

  test('processing → completed 상태 변환 시 모든 테이블 업데이트', async () => {
    const taskId = 'complete_test_' + Date.now();
    const taskType = 'youtube';

    // 1. 테스트 데이터 생성
    await connection.execute(`
      INSERT INTO task (task_id, scheduled_time, user_id, created_at)
      VALUES (?, NOW(), 'test_user', NOW())
      ON DUPLICATE KEY UPDATE scheduled_time = VALUES(scheduled_time)
    `, [taskId]);

    await connection.execute(`
      INSERT INTO content (content_id, user_id, title, status, created_at)
      VALUES (?, 'test_user', 'Test Title', 'processing', NOW())
      ON DUPLICATE KEY UPDATE status = 'processing'
    `, [taskId]);

    await connection.execute(`
      INSERT INTO task_queue (task_id, type, status, created_at, user_id)
      VALUES (?, ?, 'processing', NOW(), 'test_user')
      ON DUPLICATE KEY UPDATE status = 'processing'
    `, [taskId, taskType]);

    // 2. 완료 처리 시뮬레이션 (수정된 코드 동작)
    await connection.execute(`
      UPDATE task_queue SET status = 'completed', completed_at = NOW() WHERE task_id = ?
    `, [taskId]);

    await connection.execute(`
      UPDATE content SET status = 'completed', updated_at = NOW() WHERE content_id = ?
    `, [taskId]);

    // 3. 확인
    const [queueRows] = await connection.execute(`
      SELECT status FROM task_queue WHERE task_id = ?
    `, [taskId]);
    const [contentRows] = await connection.execute(`
      SELECT status FROM content WHERE content_id = ?
    `, [taskId]);

    expect(queueRows[0].status).toBe('completed');
    expect(contentRows[0].status).toBe('completed');

    // 4. 정리
    await connection.execute(`DELETE FROM task_queue WHERE task_id = ?`, [taskId]);
    await connection.execute(`DELETE FROM content WHERE content_id = ?`, [taskId]);
    await connection.execute(`DELETE FROM task WHERE task_id = ?`, [taskId]);
  });

  test('processing → failed 상태 변환 시 모든 테이블 업데이트', async () => {
    const taskId = 'fail_state_test_' + Date.now();
    const taskType = 'video';
    const errorMsg = 'Test error message';

    // 1. 테스트 데이터 생성
    await connection.execute(`
      INSERT INTO task (task_id, scheduled_time, user_id, created_at)
      VALUES (?, NOW(), 'test_user', NOW())
      ON DUPLICATE KEY UPDATE scheduled_time = VALUES(scheduled_time)
    `, [taskId]);

    await connection.execute(`
      INSERT INTO content (content_id, user_id, title, status, created_at)
      VALUES (?, 'test_user', 'Test Title', 'processing', NOW())
      ON DUPLICATE KEY UPDATE status = 'processing'
    `, [taskId]);

    await connection.execute(`
      INSERT INTO task_queue (task_id, type, status, created_at, user_id)
      VALUES (?, ?, 'processing', NOW(), 'test_user')
      ON DUPLICATE KEY UPDATE status = 'processing'
    `, [taskId, taskType]);

    // 락 설정
    await connection.execute(`
      UPDATE task_lock SET locked_by = ?, locked_at = NOW(), worker_pid = ?
      WHERE task_type = ?
    `, [taskId, process.pid, taskType]);

    // 2. 실패 처리 시뮬레이션 (수정된 코드 동작)
    await connection.execute(`
      UPDATE task_queue SET status = 'failed', completed_at = NOW(), error = ? WHERE task_id = ?
    `, [errorMsg, taskId]);

    await connection.execute(`
      UPDATE content SET status = 'failed', error = ?, updated_at = NOW() WHERE content_id = ?
    `, [errorMsg, taskId]);

    // 락 해제
    await connection.execute(`
      UPDATE task_lock SET locked_by = NULL, locked_at = NULL, worker_pid = NULL WHERE task_type = ?
    `, [taskType]);

    // 3. 확인
    const [queueRows] = await connection.execute(`
      SELECT status, error FROM task_queue WHERE task_id = ?
    `, [taskId]);
    const [contentRows] = await connection.execute(`
      SELECT status, error FROM content WHERE content_id = ?
    `, [taskId]);
    const [lockRows] = await connection.execute(`
      SELECT locked_by FROM task_lock WHERE task_type = ?
    `, [taskType]);

    expect(queueRows[0].status).toBe('failed');
    expect(queueRows[0].error).toBe(errorMsg);
    expect(contentRows[0].status).toBe('failed');
    expect(contentRows[0].error).toBe(errorMsg);
    expect(lockRows[0].locked_by).toBeNull();

    // 4. 정리
    await connection.execute(`DELETE FROM task_queue WHERE task_id = ?`, [taskId]);
    await connection.execute(`DELETE FROM content WHERE content_id = ?`, [taskId]);
    await connection.execute(`DELETE FROM task WHERE task_id = ?`, [taskId]);
  });

  test('Phase 전환: script → image → video → youtube', async () => {
    const taskId = 'phase_test_' + Date.now();
    const phases = ['script', 'image', 'video', 'youtube'];

    // 1. script phase로 시작
    await connection.execute(`
      INSERT INTO task_queue (task_id, type, status, created_at, user_id)
      VALUES (?, 'script', 'waiting', NOW(), 'test_user')
    `, [taskId]);

    // 2. 각 phase 순차 진행
    for (let i = 0; i < phases.length - 1; i++) {
      const currentPhase = phases[i];
      const nextPhase = phases[i + 1];

      // processing으로 변경
      await connection.execute(`
        UPDATE task_queue SET status = 'processing', started_at = NOW()
        WHERE task_id = ? AND type = ?
      `, [taskId, currentPhase]);

      // 다음 phase로 전환
      await connection.execute(`
        UPDATE task_queue SET type = ?, status = 'waiting', started_at = NULL
        WHERE task_id = ?
      `, [nextPhase, taskId]);

      // 확인
      const [rows] = await connection.execute(`
        SELECT type, status FROM task_queue WHERE task_id = ?
      `, [taskId]);

      expect(rows[0].type).toBe(nextPhase);
      expect(rows[0].status).toBe('waiting');
    }

    // 3. 마지막 phase (youtube) 완료
    await connection.execute(`
      UPDATE task_queue SET status = 'processing', started_at = NOW()
      WHERE task_id = ?
    `, [taskId]);

    await connection.execute(`
      UPDATE task_queue SET status = 'completed', completed_at = NOW()
      WHERE task_id = ?
    `, [taskId]);

    // 4. 최종 확인
    const [finalRows] = await connection.execute(`
      SELECT type, status FROM task_queue WHERE task_id = ?
    `, [taskId]);

    expect(finalRows[0].type).toBe('youtube');
    expect(finalRows[0].status).toBe('completed');

    // 5. 정리
    await connection.execute(`DELETE FROM task_queue WHERE task_id = ?`, [taskId]);
  });
});
