/**
 * Queue Status Refactoring 통합 테스트
 *
 * 테스트 시나리오:
 * 1. updateQueueStatus 함수 동작 검증
 * 2. Phase별 type + status 조합 검증
 * 3. task_queue 테이블 업데이트 검증
 * 4. 에러 처리 검증
 */

const Database = require('better-sqlite3');
const path = require('path');
const { randomUUID } = require('crypto');

// Jest 환경에서는 __dirname이 제대로 설정되지 않을 수 있으므로 process.cwd() 사용
const dbPath = path.join(process.cwd(), 'data', 'database.sqlite');

// ===========================
// updateQueueStatus 함수 (테스트용 복사)
// ===========================
function updateQueueStatus(taskId, type, status, options = {}) {
  const db = new Database(dbPath);

  try {
    // task_queue에서 기존 큐 조회 (PK: task_id)
    const existingQueue = db.prepare(`
      SELECT task_id FROM task_queue
      WHERE task_id = ?
      LIMIT 1
    `).get(taskId);

    const fields = ['type = ?', 'status = ?'];
    const values = [type, status];

    // error 메시지 처리
    if (options.errorMessage !== undefined) {
      fields.push('error = ?');
      values.push(options.errorMessage);
    } else if (status !== 'failed') {
      // 실패가 아니면 에러 초기화
      fields.push('error = NULL');
    }

    // retry_count 처리
    if (options.retryCount !== undefined) {
      fields.push('retry_count = ?');
      values.push(options.retryCount);
    }

    // started_at 처리 (processing 시작 시 자동 설정)
    if (status === 'processing') {
      fields.push('started_at = CURRENT_TIMESTAMP');
    }

    // completed_at 처리 (completed 시 자동 설정)
    if (status === 'completed') {
      fields.push('completed_at = CURRENT_TIMESTAMP');
    }

    if (existingQueue) {
      // 기존 큐 업데이트 (type과 status 모두 변경)
      values.push(taskId);
      db.prepare(`
        UPDATE task_queue
        SET ${fields.join(', ')}
        WHERE task_id = ?
      `).run(...values);
      console.log(`✅ [updateQueueStatus] Updated: task_id=${taskId}, type=${type}, status=${status}`);
    } else {
      // 큐가 없으면 새로 생성
      const task = db.prepare(`SELECT user_id FROM task WHERE id = ?`).get(taskId);
      db.prepare(`
        INSERT INTO task_queue (task_id, type, status, error, user_id, created_at, started_at, completed_at)
        VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ${status === 'processing' ? 'CURRENT_TIMESTAMP' : 'NULL'}, ${status === 'completed' ? 'CURRENT_TIMESTAMP' : 'NULL'})
      `).run(
        taskId,
        type,
        status,
        options.errorMessage || null,
        task?.user_id || 'system'
      );
      console.log(`✅ [updateQueueStatus] Created: task_id=${taskId}, type=${type}, status=${status}`);
    }
  } finally {
    db.close();
  }
}

// ===========================
// 테스트 헬퍼 함수
// ===========================
function getQueueStatus(taskId) {
  const db = new Database(dbPath);
  try {
    const queue = db.prepare(`
      SELECT * FROM task_queue
      WHERE task_id = ?
      LIMIT 1
    `).get(taskId);
    return queue;
  } finally {
    db.close();
  }
}

function getOrCreateTestTask() {
  const db = new Database(dbPath);

  try {
    // UUID 형식의 task만 가져오기 (timestamp 기반 ID 제외)
    // UUID 형식: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
    const existingTask = db.prepare(`
      SELECT task_id FROM task
      WHERE task_id LIKE '%-%-%-%-%'
      ORDER BY created_at DESC
      LIMIT 1
    `).get();

    if (existingTask) {
      console.log(`✅ UUID 형식 task 사용: ${existingTask.task_id}`);
      return existingTask.task_id;
    }

    // 없으면 새로 생성
    const taskId = randomUUID();
    db.prepare(`
      INSERT INTO task (id, title, type, user_id, created_at, updated_at)
      VALUES (?, 'Queue Status 테스트용', 'shortform', 'test-user', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run(taskId);

    console.log(`📝 테스트 task 생성: ${taskId}`);
    return taskId;
  } finally {
    db.close();
  }
}

function cleanup(taskId) {
  const db = new Database(dbPath);

  try {
    // task_queue만 정리 (실제 task는 유지)
    db.prepare(`DELETE FROM task_queue WHERE task_id = ?`).run(taskId);
    console.log(`🧹 테스트 queue 정리 완료: ${taskId}`);
  } finally {
    db.close();
  }
}

// ===========================
// Jest 테스트 케이스
// ===========================

describe('Queue Status Refactoring 통합 테스트', () => {
  let testTask = null;

  beforeEach(() => {
    // 실제 task_id 가져오기 (기존 task 재사용)
    testTask = getOrCreateTestTask();
    // 기존 queue 데이터 정리
    cleanup(testTask);
  });

  afterEach(() => {
    // 각 테스트 후 정리
    if (testTask) {
      cleanup(testTask);
    }
  });

  it('Phase 0: Schedule waiting', () => {
    updateQueueStatus(testTask, 'schedule', 'waiting');

    const queue = getQueueStatus(testTask);

    expect(queue).toBeTruthy();
    expect(queue.type).toBe('schedule');
    expect(queue.status).toBe('waiting');
  });

  it('Phase 1: Script processing → completed', () => {
    updateQueueStatus(testTask, 'script', 'processing');
    updateQueueStatus(testTask, 'script', 'completed');

    const queue = getQueueStatus(testTask);

    expect(queue).toBeTruthy();
    expect(queue.type).toBe('script');
    expect(queue.status).toBe('completed');
    expect(queue.started_at).toBeTruthy();
    expect(queue.completed_at).toBeTruthy();
  });

  it('Phase 전환: script completed → image waiting', () => {
    // Phase 1 완료
    updateQueueStatus(testTask, 'script', 'processing');
    let queue = getQueueStatus(testTask);
    expect(queue.type).toBe('script');
    expect(queue.status).toBe('processing');

    updateQueueStatus(testTask, 'script', 'completed');
    queue = getQueueStatus(testTask);
    expect(queue.type).toBe('script');
    expect(queue.status).toBe('completed');

    // Phase 2 시작 (같은 row의 type과 status가 변경됨)
    updateQueueStatus(testTask, 'image', 'waiting');
    queue = getQueueStatus(testTask);
    expect(queue.type).toBe('image');
    expect(queue.status).toBe('waiting');
  });

  it('에러 처리: image failed with error message', () => {
    updateQueueStatus(testTask, 'image', 'processing');
    updateQueueStatus(testTask, 'image', 'failed', {
      errorMessage: 'Image crawling failed: timeout'
    });

    const queue = getQueueStatus(testTask);

    expect(queue.type).toBe('image');
    expect(queue.status).toBe('failed');
    expect(queue.error).toBe('Image crawling failed: timeout');
  });

  it('전체 파이프라인: schedule → script → image → video → youtube', () => {
    // Phase 0: Schedule
    updateQueueStatus(testTask, 'schedule', 'waiting');
    let queue = getQueueStatus(testTask);
    expect(queue.type).toBe('schedule');
    expect(queue.status).toBe('waiting');

    // Phase 1: Script (processing → completed)
    updateQueueStatus(testTask, 'script', 'processing');
    queue = getQueueStatus(testTask);
    expect(queue.type).toBe('script');
    expect(queue.status).toBe('processing');

    updateQueueStatus(testTask, 'script', 'completed');
    queue = getQueueStatus(testTask);
    expect(queue.type).toBe('script');
    expect(queue.status).toBe('completed');

    // Phase 2: Image (processing → completed)
    updateQueueStatus(testTask, 'image', 'processing');
    queue = getQueueStatus(testTask);
    expect(queue.type).toBe('image');
    expect(queue.status).toBe('processing');

    updateQueueStatus(testTask, 'image', 'completed');
    queue = getQueueStatus(testTask);
    expect(queue.type).toBe('image');
    expect(queue.status).toBe('completed');

    // Phase 3: Video (processing → completed)
    updateQueueStatus(testTask, 'video', 'processing');
    queue = getQueueStatus(testTask);
    expect(queue.type).toBe('video');
    expect(queue.status).toBe('processing');

    updateQueueStatus(testTask, 'video', 'completed');
    queue = getQueueStatus(testTask);
    expect(queue.type).toBe('video');
    expect(queue.status).toBe('completed');

    // Phase 4: YouTube (processing → completed)
    updateQueueStatus(testTask, 'youtube', 'processing');
    queue = getQueueStatus(testTask);
    expect(queue.type).toBe('youtube');
    expect(queue.status).toBe('processing');

    updateQueueStatus(testTask, 'youtube', 'completed');
    queue = getQueueStatus(testTask);
    expect(queue.type).toBe('youtube');
    expect(queue.status).toBe('completed');

    console.log(`✅ 전체 파이프라인 완료: task_id=${testTask}`);
  });
});
