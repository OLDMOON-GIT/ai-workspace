import mysql from 'mysql2/promise';
import { randomUUID } from 'crypto';

const connection = await mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: 'trend2024',
  database: 'trend_video'
});

// unified-worker.js의 run 함수 시뮬레이션
async function run(sql, params) {
  await connection.execute(sql, params);
}

// unified-worker.js의 triggerNextStage 함수 (실제 코드)
async function triggerNextStage(currentType, taskId, emoji = '✅') {
  const nextTypeMap = {
    script: 'image',
    image: 'video',
    video: 'youtube',
    youtube: null
  };

  const nextType = nextTypeMap[currentType];
  if (!nextType) {
    console.log(`${emoji} [${currentType}] Pipeline completed for: ${taskId}`);
    return false;
  }

  const nextEmoji = { image: '📸', video: '🎬', youtube: '📺' }[nextType];

  try {
    // 1. content.status를 다음 type으로 설정 (script/image/video/youtube)
    await run(`
      UPDATE content
      SET status = ?
      WHERE content_id = ?
    `, [nextType, taskId]);

    // 2. task_queue의 type과 status를 다음 단계로 UPDATE
    await run(`
      UPDATE task_queue
      SET type = ?, status = 'waiting'
      WHERE task_id = ?
    `, [nextType, taskId]);

    console.log(`${emoji} → ${nextEmoji} [${currentType}→${nextType}] Triggered next stage for: ${taskId}`);
    return true;

  } catch (error) {
    console.error(`${emoji} [${currentType}] Failed to trigger next stage:`, error);
    return false;
  }
}

// 기존 user 가져오기
const [users] = await connection.execute(`SELECT user_id FROM user LIMIT 1`);
if (users.length === 0) {
  console.error('❌ 테스트할 user가 없습니다!');
  await connection.end();
  process.exit(1);
}

const testTaskId = randomUUID();
const testUserId = users[0].user_id;

console.log('\n🧪 Worker triggerNextStage 통합 테스트\n');
console.log('='.repeat(80));
console.log(`📝 테스트 Task ID: ${testTaskId}`);
console.log(`👤 테스트 User ID: ${testUserId}\n`);

let passed = 0;
let failed = 0;

async function assert(condition, message) {
  if (condition) {
    console.log(`✅ ${message}`);
    passed++;
  } else {
    console.log(`❌ ${message}`);
    failed++;
  }
}

async function getTaskQueue() {
  const [rows] = await connection.execute(`
    SELECT task_id, type, status FROM task_queue WHERE task_id = ?
  `, [testTaskId]);
  return rows[0];
}

async function getContent() {
  const [rows] = await connection.execute(`
    SELECT content_id, status FROM content WHERE content_id = ?
  `, [testTaskId]);
  return rows[0];
}

try {
  // 0. 테스트 데이터 준비
  console.log('📦 테스트 데이터 생성...\n');
  
  await connection.execute(`
    INSERT INTO task (task_id, user_id, scheduled_time) VALUES (?, ?, NULL)
  `, [testTaskId, testUserId]);
  
  await connection.execute(`
    INSERT INTO content (content_id, user_id, title, status) 
    VALUES (?, ?, 'Worker Test', 'pending')
  `, [testTaskId, testUserId]);

  await connection.execute(`
    INSERT INTO task_queue (task_id, type, status, user_id, created_at)
    VALUES (?, 'script', 'processing', ?, NOW())
  `, [testTaskId, testUserId]);

  console.log('✅ 초기 데이터 생성 완료\n');

  // 1. script 완료 → image 전환 (실제 워커 로직)
  console.log('1️⃣  script → image 전환 (triggerNextStage 호출)\n');
  
  const result1 = await triggerNextStage('script', testTaskId);
  
  const queue1 = await getTaskQueue();
  const content1 = await getContent();
  
  await assert(result1 === true, 'triggerNextStage 반환값: true');
  await assert(queue1.type === 'image', 'task_queue.type: image');
  await assert(queue1.status === 'waiting', 'task_queue.status: waiting');
  await assert(content1.status === 'image', 'content.status: image');
  console.log('');

  // 2. image 완료 → video 전환
  console.log('2️⃣  image → video 전환 (triggerNextStage 호출)\n');
  
  // image 처리 시작
  await run(`UPDATE task_queue SET status = 'processing' WHERE task_id = ?`, [testTaskId]);
  
  const result2 = await triggerNextStage('image', testTaskId);
  
  const queue2 = await getTaskQueue();
  const content2 = await getContent();
  
  await assert(result2 === true, 'triggerNextStage 반환값: true');
  await assert(queue2.type === 'video', 'task_queue.type: video');
  await assert(queue2.status === 'waiting', 'task_queue.status: waiting');
  await assert(content2.status === 'video', 'content.status: video');
  console.log('');

  // 3. video 완료 → youtube 전환
  console.log('3️⃣  video → youtube 전환 (triggerNextStage 호출)\n');
  
  // video 처리 시작
  await run(`UPDATE task_queue SET status = 'processing' WHERE task_id = ?`, [testTaskId]);
  
  const result3 = await triggerNextStage('video', testTaskId);
  
  const queue3 = await getTaskQueue();
  const content3 = await getContent();
  
  await assert(result3 === true, 'triggerNextStage 반환값: true');
  await assert(queue3.type === 'youtube', 'task_queue.type: youtube');
  await assert(queue3.status === 'waiting', 'task_queue.status: waiting');
  await assert(content3.status === 'youtube', 'content.status: youtube');
  console.log('');

  // 4. youtube 완료 (마지막 단계)
  console.log('4️⃣  youtube 완료 (triggerNextStage 호출)\n');
  
  // youtube 처리 시작
  await run(`UPDATE task_queue SET status = 'processing' WHERE task_id = ?`, [testTaskId]);
  
  const result4 = await triggerNextStage('youtube', testTaskId);
  
  await assert(result4 === false, 'triggerNextStage 반환값: false (마지막 단계)');
  
  // youtube 완료 시 worker가 수동으로 completed 설정
  await run(`UPDATE content SET status = 'completed' WHERE content_id = ?`, [testTaskId]);
  await run(`UPDATE task_queue SET status = 'completed' WHERE task_id = ?`, [testTaskId]);
  
  const queue4 = await getTaskQueue();
  const content4 = await getContent();
  
  await assert(queue4.type === 'youtube', 'task_queue.type: youtube (변경 없음)');
  await assert(queue4.status === 'completed', 'task_queue.status: completed');
  await assert(content4.status === 'completed', 'content.status: completed');
  console.log('');

  // 5. 정리
  console.log('🧹 테스트 데이터 정리...\n');
  await connection.execute(`DELETE FROM task_queue WHERE task_id = ?`, [testTaskId]);
  await connection.execute(`DELETE FROM content WHERE content_id = ?`, [testTaskId]);
  await connection.execute(`DELETE FROM task WHERE task_id = ?`, [testTaskId]);

  // 결과
  console.log('='.repeat(80));
  console.log(`\n📊 테스트 결과: ${passed}개 통과 / ${failed}개 실패\n`);
  
  if (failed === 0) {
    console.log('✅ 모든 워커 로직 테스트 통과!\n');
  } else {
    console.log(`❌ ${failed}개 테스트 실패!\n`);
    process.exit(1);
  }

} catch (error) {
  console.error('\n❌ 테스트 에러:', error.message);
  console.error('   Stack:', error.stack);
  
  // 정리
  try {
    await connection.execute(`DELETE FROM task_queue WHERE task_id = ?`, [testTaskId]);
    await connection.execute(`DELETE FROM content WHERE content_id = ?`, [testTaskId]);
    await connection.execute(`DELETE FROM task WHERE task_id = ?`, [testTaskId]);
  } catch (e) {}
  
  process.exit(1);
} finally {
  await connection.end();
}
