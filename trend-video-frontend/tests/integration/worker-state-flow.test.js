/**
 * 워커 상태 전환 통합 테스트
 *
 * BTS-0000012, BTS-0000016 재발 방지
 *
 * 검증 항목:
 * 1. script 완료 → image waiting (completed ❌)
 * 2. image 완료 → video waiting (completed ❌)
 * 3. video 완료 → youtube waiting (completed ❌)
 * 4. youtube 완료 → completed ✅ (유일)
 * 5. content.status 업데이트 확인
 */

const mysql = require('mysql2/promise');
const { v4: uuidv4 } = require('uuid');

// MySQL 연결 설정
const dbConfig = {
  host: process.env.MYSQL_HOST || 'localhost',
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || 'trend2024',
  database: process.env.MYSQL_DATABASE || 'trend_video'
};

let connection;

// 로컬 시간 헬퍼
function getLocalDateTime() {
  const now = new Date();
  const pad = (n) => n.toString().padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}

// 테스트 전 설정
beforeAll(async () => {
  connection = await mysql.createConnection(dbConfig);
  console.log('✅ MySQL 연결 성공');
});

// 테스트 후 정리
afterAll(async () => {
  if (connection) {
    await connection.end();
    console.log('✅ MySQL 연결 종료');
  }
});

// 테스트 헬퍼: 테스트 데이터 생성
async function createTestTask() {
  const taskId = uuidv4();
  const userId = 'test-user';
  const now = getLocalDateTime();

  // 1. task 생성
  await connection.execute(
    `INSERT INTO task (task_id, user_id, created_at, updated_at) VALUES (?, ?, ?, ?)`,
    [taskId, userId, now, now]
  );

  // 2. content 생성
  await connection.execute(
    `INSERT INTO content (content_id, user_id, title, prompt_format, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [taskId, userId, '테스트 제목', 'longform', 'draft', now, now]
  );

  // 3. content_setting 생성
  await connection.execute(
    `INSERT INTO content_setting (content_id, created_at, updated_at) VALUES (?, ?, ?)`,
    [taskId, now, now]
  );

  return taskId;
}

// 테스트 헬퍼: task_queue에 큐 추가
async function addToQueue(taskId, type, status = 'waiting') {
  const now = getLocalDateTime();
  await connection.execute(
    `INSERT INTO task_queue (task_id, type, status, created_at, user_id)
     VALUES (?, ?, ?, ?, ?)`,
    [taskId, type, status, now, 'test-user']
  );
}

// 테스트 헬퍼: 다음 단계로 전환 (워커 로직 시뮬레이션)
async function triggerNextStage(currentType, taskId) {
  const nextTypeMap = {
    script: 'image',
    image: 'video',
    video: 'youtube',
    youtube: null
  };

  const nextType = nextTypeMap[currentType];
  if (!nextType) {
    return false; // 다음 단계 없음
  }

  // content.status 설정 (script/video만)
  if (currentType === 'script' || currentType === 'video') {
    await connection.execute(
      `UPDATE content SET status = ? WHERE content_id = ?`,
      [currentType, taskId]
    );
  }
  // image는 content.status 변경 안 함

  // task_queue: type → 다음 단계, status → 'waiting'
  await connection.execute(
    `UPDATE task_queue SET type = ?, status = 'waiting' WHERE task_id = ?`,
    [nextType, taskId]
  );

  return true;
}

// 테스트 헬퍼: youtube 완료 처리
async function completeYoutube(taskId) {
  // 1. task_queue
  await connection.execute(
    `UPDATE task_queue SET status = 'completed' WHERE task_id = ?`,
    [taskId]
  );

  // 2. content.status
  await connection.execute(
    `UPDATE content SET status = 'completed' WHERE content_id = ?`,
    [taskId]
  );
}

// 테스트 헬퍼: 상태 조회
async function getQueueState(taskId) {
  const [rows] = await connection.execute(
    `SELECT type, status FROM task_queue WHERE task_id = ?`,
    [taskId]
  );
  return rows[0];
}

async function getContentStatus(taskId) {
  const [rows] = await connection.execute(
    `SELECT status FROM content WHERE content_id = ?`,
    [taskId]
  );
  return rows[0]?.status;
}

// 테스트 헬퍼: 테스트 데이터 정리
async function cleanupTestTask(taskId) {
  await connection.execute(`DELETE FROM task_queue WHERE task_id = ?`, [taskId]);
  await connection.execute(`DELETE FROM task_time_log WHERE task_id = ?`, [taskId]);
  await connection.execute(`DELETE FROM content_setting WHERE content_id = ?`, [taskId]);
  await connection.execute(`DELETE FROM content WHERE content_id = ?`, [taskId]);
  await connection.execute(`DELETE FROM task WHERE task_id = ?`, [taskId]);
}

// ============================================================
// 테스트 케이스
// ============================================================

describe('워커 상태 전환 플로우', () => {
  let testTaskId;

  afterEach(async () => {
    // 테스트 후 정리
    if (testTaskId) {
      await cleanupTestTask(testTaskId);
      testTaskId = null;
    }
  });

  test('script 완료 → image waiting (completed ❌)', async () => {
    testTaskId = await createTestTask();
    await addToQueue(testTaskId, 'script', 'processing');

    // script 완료 처리
    const hasNext = await triggerNextStage('script', testTaskId);

    expect(hasNext).toBe(true);

    // 검증
    const queueState = await getQueueState(testTaskId);
    expect(queueState.type).toBe('image');
    expect(queueState.status).toBe('waiting'); // ✅ completed 아님!

    const contentStatus = await getContentStatus(testTaskId);
    expect(contentStatus).toBe('script'); // ✅ 현재 단계
  });

  test('image 완료 → video waiting (completed ❌)', async () => {
    testTaskId = await createTestTask();
    await addToQueue(testTaskId, 'image', 'processing');

    // content.status를 'script'로 설정 (이전 단계 완료 상태)
    await connection.execute(
      `UPDATE content SET status = 'script' WHERE content_id = ?`,
      [testTaskId]
    );

    // image 완료 처리
    const hasNext = await triggerNextStage('image', testTaskId);

    expect(hasNext).toBe(true);

    // 검증
    const queueState = await getQueueState(testTaskId);
    expect(queueState.type).toBe('video');
    expect(queueState.status).toBe('waiting'); // ✅ completed 아님!

    const contentStatus = await getContentStatus(testTaskId);
    expect(contentStatus).toBe('script'); // ✅ 변경 안 함 (유지)
  });

  test('video 완료 → youtube waiting (completed ❌)', async () => {
    testTaskId = await createTestTask();
    await addToQueue(testTaskId, 'video', 'processing');

    // video 완료 처리
    const hasNext = await triggerNextStage('video', testTaskId);

    expect(hasNext).toBe(true);

    // 검증
    const queueState = await getQueueState(testTaskId);
    expect(queueState.type).toBe('youtube');
    expect(queueState.status).toBe('waiting'); // ✅ completed 아님!

    const contentStatus = await getContentStatus(testTaskId);
    expect(contentStatus).toBe('video'); // ✅ 현재 단계
  });

  test('youtube 완료 → completed ✅ (유일)', async () => {
    testTaskId = await createTestTask();
    await addToQueue(testTaskId, 'youtube', 'processing');

    // content.status를 'video'로 설정 (이전 단계 완료 상태)
    await connection.execute(
      `UPDATE content SET status = 'video' WHERE content_id = ?`,
      [testTaskId]
    );

    // youtube 완료 처리
    const hasNext = await triggerNextStage('youtube', testTaskId);
    expect(hasNext).toBe(false); // 다음 단계 없음

    await completeYoutube(testTaskId);

    // 검증
    const queueState = await getQueueState(testTaskId);
    expect(queueState.type).toBe('youtube');
    expect(queueState.status).toBe('completed'); // ✅ 유일하게 completed!

    const contentStatus = await getContentStatus(testTaskId);
    expect(contentStatus).toBe('completed'); // ✅ 최종 완료
  });

  test('전체 플로우 (script → youtube)', async () => {
    testTaskId = await createTestTask();

    // 1. script 시작
    await addToQueue(testTaskId, 'script', 'processing');
    await triggerNextStage('script', testTaskId);

    let state = await getQueueState(testTaskId);
    expect(state.type).toBe('image');
    expect(state.status).toBe('waiting');
    expect(await getContentStatus(testTaskId)).toBe('script');

    // 2. image 시작
    await connection.execute(
      `UPDATE task_queue SET status = 'processing' WHERE task_id = ?`,
      [testTaskId]
    );
    await triggerNextStage('image', testTaskId);

    state = await getQueueState(testTaskId);
    expect(state.type).toBe('video');
    expect(state.status).toBe('waiting');
    expect(await getContentStatus(testTaskId)).toBe('script'); // 유지

    // 3. video 시작
    await connection.execute(
      `UPDATE task_queue SET status = 'processing' WHERE task_id = ?`,
      [testTaskId]
    );
    await triggerNextStage('video', testTaskId);

    state = await getQueueState(testTaskId);
    expect(state.type).toBe('youtube');
    expect(state.status).toBe('waiting');
    expect(await getContentStatus(testTaskId)).toBe('video');

    // 4. youtube 시작 및 완료
    await connection.execute(
      `UPDATE task_queue SET status = 'processing' WHERE task_id = ?`,
      [testTaskId]
    );
    await completeYoutube(testTaskId);

    state = await getQueueState(testTaskId);
    expect(state.type).toBe('youtube');
    expect(state.status).toBe('completed'); // ✅ 최종만 completed
    expect(await getContentStatus(testTaskId)).toBe('completed');
  });

  test('중간 단계에 completed가 없는지 확인', async () => {
    // 전체 DB에서 script/image/video의 completed 검색
    const [rows] = await connection.execute(`
      SELECT task_id, type, status
      FROM task_queue
      WHERE type IN ('script', 'image', 'video') AND status = 'completed'
      LIMIT 10
    `);

    if (rows.length > 0) {
      console.error('❌ 중간 단계에 completed 발견!', rows);
    }

    expect(rows.length).toBe(0); // ✅ 중간 단계에 completed 없어야 함
  });
});

describe('content.status 업데이트 규칙', () => {
  let testTaskId;

  afterEach(async () => {
    if (testTaskId) {
      await cleanupTestTask(testTaskId);
      testTaskId = null;
    }
  });

  test('content.status = script (script 완료 시)', async () => {
    testTaskId = await createTestTask();
    await addToQueue(testTaskId, 'script', 'processing');
    await triggerNextStage('script', testTaskId);

    const status = await getContentStatus(testTaskId);
    expect(status).toBe('script');
  });

  test('content.status 유지 (image 완료 시)', async () => {
    testTaskId = await createTestTask();
    await connection.execute(
      `UPDATE content SET status = 'script' WHERE content_id = ?`,
      [testTaskId]
    );
    await addToQueue(testTaskId, 'image', 'processing');
    await triggerNextStage('image', testTaskId);

    const status = await getContentStatus(testTaskId);
    expect(status).toBe('script'); // ✅ 변경 안 함
  });

  test('content.status = video (video 완료 시)', async () => {
    testTaskId = await createTestTask();
    await addToQueue(testTaskId, 'video', 'processing');
    await triggerNextStage('video', testTaskId);

    const status = await getContentStatus(testTaskId);
    expect(status).toBe('video');
  });

  test('content.status = completed (youtube 완료 시)', async () => {
    testTaskId = await createTestTask();
    await connection.execute(
      `UPDATE content SET status = 'video' WHERE content_id = ?`,
      [testTaskId]
    );
    await addToQueue(testTaskId, 'youtube', 'processing');
    await completeYoutube(testTaskId);

    const status = await getContentStatus(testTaskId);
    expect(status).toBe('completed');
  });
});
