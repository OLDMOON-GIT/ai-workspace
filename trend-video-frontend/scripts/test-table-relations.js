/**
 * 테이블 관계 통합 테스트 스크립트
 *
 * 테이블 관계:
 * ┌─────────────────────────────────────────────────────────────┐
 * │                    테이블 관계도                              │
 * ├─────────────────────────────────────────────────────────────┤
 * │                                                             │
 * │    task (작업 설정)                                          │
 * │    ├── id (PK)                                              │
 * │    ├── title, type, category, channel, model                │
 * │    ├── product_info (JSON)                                  │
 * │    └── user_id (FK → user)                                  │
 * │         │                                                   │
 * │         ├──────────────────────┬─────────────────┐          │
 * │         │                      │                 │          │
 * │         ▼                      ▼                 ▼          │
 * │    task_schedule          task_queue         content        │
 * │    (스케줄 정보)          (상태 관리)        (생성물)        │
 * │    ├── task_id (FK)       ├── task_id (FK)   ├── content_id │
 * │    ├── scheduled_time     ├── type (단계)    │   = task_id  │
 * │    ├── youtube_publish    ├── status         ├── type       │
 * │    └── youtube_privacy    ├── error          │   (script/   │
 * │                           └── retry_count    │    video)    │
 * │                                              ├── product_info│
 * │                                              └── category    │
 * │                                                             │
 * │  ID 통일 규칙: task.id = content.content_id = task_queue.task_id │
 * └─────────────────────────────────────────────────────────────┘
 *
 * 실행: node scripts/test-table-relations.js
 */

const Database = require('better-sqlite3');
const path = require('path');
const crypto = require('crypto');

const dbPath = path.join(process.cwd(), 'data', 'database.sqlite');

// 테스트 결과
const results = {
  passed: 0,
  failed: 0,
  errors: []
};

function test(name, fn) {
  try {
    fn();
    console.log(`✅ ${name}`);
    results.passed++;
  } catch (error) {
    console.log(`❌ ${name}`);
    console.log(`   Error: ${error.message}`);
    results.failed++;
    results.errors.push({ name, error: error.message });
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

// 테스트 유저 ID (실제 DB에 있어야 함)
let testUserId = null;

// ============================================================
// 테스트 시작
// ============================================================

console.log('\n========================================');
console.log('테이블 관계 통합 테스트');
console.log('========================================\n');

const db = new Database(dbPath);

// 0. 테스트 유저 확인/생성
test('테스트 유저 확인', () => {
  const user = db.prepare(`SELECT id FROM user LIMIT 1`).get();
  if (user) {
    testUserId = user.id;
    console.log(`   테스트 유저 ID: ${testUserId}`);
  } else {
    throw new Error('테스트 유저가 없습니다. 먼저 유저를 생성하세요.');
  }
});

// 1. task 테이블 구조 확인
test('task 테이블 구조 확인', () => {
  const columns = db.prepare(`PRAGMA table_info(task)`).all();
  const columnNames = columns.map(c => c.name);

  assert(columnNames.includes('id'), 'task.id 컬럼 필요');
  assert(columnNames.includes('title'), 'task.title 컬럼 필요');
  assert(columnNames.includes('type'), 'task.type 컬럼 필요');
  assert(columnNames.includes('product_info'), 'task.product_info 컬럼 필요');
  assert(columnNames.includes('category'), 'task.category 컬럼 필요');
  assert(columnNames.includes('channel'), 'task.channel 컬럼 필요');
  assert(columnNames.includes('model'), 'task.model 컬럼 필요');
});

// 2. task_schedule 테이블 구조 확인
test('task_schedule 테이블 구조 확인', () => {
  const columns = db.prepare(`PRAGMA table_info(task_schedule)`).all();
  const columnNames = columns.map(c => c.name);

  assert(columnNames.includes('task_id'), 'task_schedule.task_id 컬럼 필요');
  assert(columnNames.includes('scheduled_time'), 'task_schedule.scheduled_time 컬럼 필요');
  assert(columnNames.includes('youtube_publish_time'), 'task_schedule.youtube_publish_time 컬럼 필요');
  assert(columnNames.includes('youtube_privacy'), 'task_schedule.youtube_privacy 컬럼 필요');
});

// 3. task_queue 테이블 구조 확인
test('task_queue 테이블 구조 확인', () => {
  const columns = db.prepare(`PRAGMA table_info(task_queue)`).all();
  const columnNames = columns.map(c => c.name);

  assert(columnNames.includes('task_id'), 'task_queue.task_id 컬럼 필요');
  assert(columnNames.includes('type'), 'task_queue.type 컬럼 필요');
  assert(columnNames.includes('status'), 'task_queue.status 컬럼 필요');
  assert(columnNames.includes('error'), 'task_queue.error 컬럼 필요');
});

// 4. content 테이블 구조 확인
test('content 테이블 구조 확인', () => {
  const columns = db.prepare(`PRAGMA table_info(content)`).all();
  const columnNames = columns.map(c => c.name);

  assert(columnNames.includes('content_id'), 'content.content_id 컬럼 필요');
  assert(columnNames.includes('type'), 'content.type 컬럼 필요');
  assert(columnNames.includes('task_id'), 'content.task_id 컬럼 필요');
  assert(columnNames.includes('product_info'), 'content.product_info 컬럼 필요');
  assert(columnNames.includes('category'), 'content.category 컬럼 필요');
});

// 5. 전체 흐름 테스트: task → schedule → queue → content
test('전체 흐름 테스트', () => {
  const taskId = crypto.randomUUID();
  const productInfo = {
    title: '테스트 상품',
    thumbnail: 'https://example.com/thumb.jpg',
    product_link: 'https://link.coupang.com/a/test',
    description: '상품 설명'
  };

  try {
    // 1. Task 생성
    db.prepare(`
      INSERT INTO task (id, title, type, user_id, product_info, category, channel, model, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active')
    `).run(taskId, productInfo.title, 'product', testUserId, JSON.stringify(productInfo), '상품', 'test-channel', 'claude');

    // 2. Schedule 생성
    const scheduleId = crypto.randomUUID();
    db.prepare(`
      INSERT INTO task_schedule (id, task_id, scheduled_time, youtube_publish_time, youtube_privacy)
      VALUES (?, ?, datetime('now'), datetime('now', '+1 hour'), 'private')
    `).run(scheduleId, taskId);

    // 3. Queue 생성 (상태 관리)
    db.prepare(`
      INSERT INTO task_queue (task_id, type, status, user_id, created_at)
      VALUES (?, 'schedule', 'waiting', ?, datetime('now'))
    `).run(taskId, testUserId);

    // 4. Content 생성 (content_id = task_id!)
    db.prepare(`
      INSERT INTO content (content_id, type, user_id, title, task_id, product_info, category, format, status)
      VALUES (?, 'script', ?, ?, ?, ?, '상품', 'product', 'pending')
    `).run(taskId, testUserId, productInfo.title, taskId, JSON.stringify(productInfo));

    // 검증
    const task = db.prepare(`SELECT * FROM task WHERE id = ?`).get(taskId);
    const schedule = db.prepare(`SELECT * FROM task_schedule WHERE task_id = ?`).get(taskId);
    const queue = db.prepare(`SELECT * FROM task_queue WHERE task_id = ? AND type = 'schedule'`).get(taskId);
    const content = db.prepare(`SELECT * FROM content WHERE content_id = ? AND type = 'script'`).get(taskId);

    assert(task, 'Task 생성 실패');
    assert(schedule, 'Schedule 생성 실패');
    assert(queue, 'Queue 생성 실패');
    assert(content, 'Content 생성 실패');

    // ID 통일 규칙 검증
    assert(content.content_id === taskId, 'content.content_id ≠ task.id');
    assert(content.task_id === taskId, 'content.task_id ≠ task.id');
    assert(schedule.task_id === taskId, 'schedule.task_id ≠ task.id');
    assert(queue.task_id === taskId, 'queue.task_id ≠ task.id');

    // product_info 전달 검증
    const taskPI = JSON.parse(task.product_info);
    const contentPI = JSON.parse(content.product_info);
    assert(taskPI.product_link === contentPI.product_link, 'product_info 전달 실패');

    // 상태 검증
    assert(queue.status === 'waiting', 'queue 상태가 waiting이 아님');

    // 카테고리 검증
    assert(content.category === '상품', 'content 카테고리가 상품이 아님');

    console.log(`   생성된 task_id: ${taskId}`);
    console.log(`   schedule.task_id: ${schedule.task_id}`);
    console.log(`   queue.status: ${queue.status}`);
    console.log(`   content.content_id: ${content.content_id}`);
    console.log(`   content.task_id: ${content.task_id}`);

  } finally {
    // 테스트 데이터 정리
    db.prepare(`DELETE FROM content WHERE content_id = ?`).run(taskId);
    db.prepare(`DELETE FROM task_queue WHERE task_id = ?`).run(taskId);
    db.prepare(`DELETE FROM task_schedule WHERE task_id = ?`).run(taskId);
    db.prepare(`DELETE FROM task WHERE id = ?`).run(taskId);
  }
});

// 6. 상태 전이 테스트
test('상태 전이 테스트 (waiting → processing → completed)', () => {
  const taskId = crypto.randomUUID();

  try {
    // Task 생성
    db.prepare(`
      INSERT INTO task (id, title, type, user_id, status)
      VALUES (?, '상태 테스트', 'shortform', ?, 'active')
    `).run(taskId, testUserId);

    // Queue 생성
    db.prepare(`
      INSERT INTO task_queue (task_id, type, status, user_id, created_at)
      VALUES (?, 'schedule', 'waiting', ?, datetime('now'))
    `).run(taskId, testUserId);

    // waiting → processing
    db.prepare(`UPDATE task_queue SET status = 'processing' WHERE task_id = ? AND type = 'schedule'`).run(taskId);
    let queue = db.prepare(`SELECT status FROM task_queue WHERE task_id = ? AND type = 'schedule'`).get(taskId);
    assert(queue.status === 'processing', 'waiting → processing 전이 실패');

    // processing → completed
    db.prepare(`UPDATE task_queue SET status = 'completed' WHERE task_id = ? AND type = 'schedule'`).run(taskId);
    queue = db.prepare(`SELECT status FROM task_queue WHERE task_id = ? AND type = 'schedule'`).get(taskId);
    assert(queue.status === 'completed', 'processing → completed 전이 실패');

    console.log(`   상태 전이 성공: waiting → processing → completed`);

  } finally {
    db.prepare(`DELETE FROM task_queue WHERE task_id = ?`).run(taskId);
    db.prepare(`DELETE FROM task WHERE id = ?`).run(taskId);
  }
});

// 7. 실패 상태 및 에러 저장 테스트
test('실패 상태 및 에러 저장', () => {
  const taskId = crypto.randomUUID();

  try {
    db.prepare(`
      INSERT INTO task (id, title, type, user_id, status)
      VALUES (?, '에러 테스트', 'shortform', ?, 'active')
    `).run(taskId, testUserId);

    db.prepare(`
      INSERT INTO task_queue (task_id, type, status, user_id, created_at)
      VALUES (?, 'script', 'waiting', ?, datetime('now'))
    `).run(taskId, testUserId);

    // 실패로 변경 및 에러 저장
    const errorMessage = 'API 호출 실패: 429 Too Many Requests';
    db.prepare(`
      UPDATE task_queue SET status = 'failed', error = ?
      WHERE task_id = ? AND type = 'script'
    `).run(errorMessage, taskId);

    const queue = db.prepare(`SELECT * FROM task_queue WHERE task_id = ? AND type = 'script'`).get(taskId);
    assert(queue.status === 'failed', '실패 상태 저장 실패');
    assert(queue.error === errorMessage, '에러 메시지 저장 실패');

    console.log(`   에러 저장 성공: ${queue.error}`);

  } finally {
    db.prepare(`DELETE FROM task_queue WHERE task_id = ?`).run(taskId);
    db.prepare(`DELETE FROM task WHERE id = ?`).run(taskId);
  }
});

// 8. 다단계 큐 테스트
test('다단계 큐 테스트 (schedule → script → image → video → youtube)', () => {
  const taskId = crypto.randomUUID();
  const stages = ['schedule', 'script', 'image', 'video', 'youtube'];

  try {
    db.prepare(`
      INSERT INTO task (id, title, type, user_id, status)
      VALUES (?, '다단계 테스트', 'shortform', ?, 'active')
    `).run(taskId, testUserId);

    // 모든 단계 큐 생성
    stages.forEach(type => {
      db.prepare(`
        INSERT INTO task_queue (task_id, type, status, user_id, created_at)
        VALUES (?, ?, 'waiting', ?, datetime('now'))
      `).run(taskId, type, testUserId);
    });

    // 순차 처리 시뮬레이션
    for (const type of stages) {
      db.prepare(`UPDATE task_queue SET status = 'processing' WHERE task_id = ? AND type = ?`).run(taskId, type);
      db.prepare(`UPDATE task_queue SET status = 'completed' WHERE task_id = ? AND type = ?`).run(taskId, type);
    }

    // 모든 단계 완료 확인
    const allCompleted = db.prepare(`
      SELECT COUNT(*) as cnt FROM task_queue
      WHERE task_id = ? AND status = 'completed'
    `).get(taskId);

    assert(allCompleted.cnt === stages.length, `모든 단계 완료 실패 (${allCompleted.cnt}/${stages.length})`);
    console.log(`   ${stages.length}개 단계 모두 완료`);

  } finally {
    db.prepare(`DELETE FROM task_queue WHERE task_id = ?`).run(taskId);
    db.prepare(`DELETE FROM task WHERE id = ?`).run(taskId);
  }
});

// 결과 출력
db.close();

console.log('\n========================================');
console.log('테스트 결과');
console.log('========================================');
console.log(`✅ 성공: ${results.passed}`);
console.log(`❌ 실패: ${results.failed}`);

if (results.errors.length > 0) {
  console.log('\n실패한 테스트:');
  results.errors.forEach((e, i) => {
    console.log(`  ${i + 1}. ${e.name}`);
    console.log(`     ${e.error}`);
  });
}

console.log('========================================\n');

// 종료 코드
process.exit(results.failed > 0 ? 1 : 0);
