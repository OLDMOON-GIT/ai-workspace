import mysql from 'mysql2/promise';
import { randomUUID } from 'crypto';

const connection = await mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: 'trend2024',
  database: 'trend_video'
});

// 기존 user 가져오기
const [users] = await connection.execute(`SELECT user_id FROM user LIMIT 1`);
if (users.length === 0) {
  console.error('❌ 테스트할 user가 없습니다!');
  await connection.end();
  process.exit(1);
}

const testTaskId = randomUUID();
const testUserId = users[0].user_id;

console.log('\n🧪 task_queue Type/Status 통합 테스트\n');
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
  return rows;
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
    VALUES (?, ?, 'Test Content', 'pending')
  `, [testTaskId, testUserId]);

  // 1. 초기 상태: task_queue 생성
  console.log('1️⃣  초기 상태 테스트 (script/waiting)\n');
  
  await connection.execute(`
    INSERT INTO task_queue (task_id, type, status, user_id, created_at)
    VALUES (?, 'script', 'waiting', ?, NOW())
  `, [testTaskId, testUserId]);

  let queue = await getTaskQueue();
  await assert(queue.length === 1, '레코드 개수: 1개');
  await assert(queue[0].type === 'script', 'type: script');
  await assert(queue[0].status === 'waiting', 'status: waiting');
  console.log('');

  // 2. script → image 전환
  console.log('2️⃣  script → image 전환 테스트\n');
  
  await connection.execute(`
    UPDATE content SET status = 'image' WHERE content_id = ?
  `, [testTaskId]);
  
  await connection.execute(`
    UPDATE task_queue SET type = 'image', status = 'waiting' WHERE task_id = ?
  `, [testTaskId]);

  queue = await getTaskQueue();
  const content2 = await getContent();
  await assert(queue.length === 1, '레코드 개수: 여전히 1개 (UPDATE)');
  await assert(queue[0].type === 'image', 'task_queue.type: image');
  await assert(queue[0].status === 'waiting', 'task_queue.status: waiting');
  await assert(content2.status === 'image', 'content.status: image');
  console.log('');

  // 3. image → video 전환
  console.log('3️⃣  image → video 전환 테스트\n');
  
  await connection.execute(`
    UPDATE content SET status = 'video' WHERE content_id = ?
  `, [testTaskId]);
  
  await connection.execute(`
    UPDATE task_queue SET type = 'video', status = 'waiting' WHERE task_id = ?
  `, [testTaskId]);

  queue = await getTaskQueue();
  const content3 = await getContent();
  await assert(queue.length === 1, '레코드 개수: 여전히 1개 (UPDATE)');
  await assert(queue[0].type === 'video', 'task_queue.type: video');
  await assert(queue[0].status === 'waiting', 'task_queue.status: waiting');
  await assert(content3.status === 'video', 'content.status: video');
  console.log('');

  // 4. video → youtube 전환
  console.log('4️⃣  video → youtube 전환 테스트\n');
  
  await connection.execute(`
    UPDATE content SET status = 'youtube' WHERE content_id = ?
  `, [testTaskId]);
  
  await connection.execute(`
    UPDATE task_queue SET type = 'youtube', status = 'waiting' WHERE task_id = ?
  `, [testTaskId]);

  queue = await getTaskQueue();
  const content4 = await getContent();
  await assert(queue.length === 1, '레코드 개수: 여전히 1개 (UPDATE)');
  await assert(queue[0].type === 'youtube', 'task_queue.type: youtube');
  await assert(queue[0].status === 'waiting', 'task_queue.status: waiting');
  await assert(content4.status === 'youtube', 'content.status: youtube');
  console.log('');

  // 5. youtube 완료 (최종)
  console.log('5️⃣  youtube 완료 테스트 (최종 단계)\n');
  
  await connection.execute(`
    UPDATE content SET status = 'completed' WHERE content_id = ?
  `, [testTaskId]);
  
  await connection.execute(`
    UPDATE task_queue SET status = 'completed' WHERE task_id = ?
  `, [testTaskId]);

  queue = await getTaskQueue();
  const content5 = await getContent();
  await assert(queue.length === 1, '레코드 개수: 여전히 1개');
  await assert(queue[0].type === 'youtube', 'task_queue.type: youtube (변경 없음)');
  await assert(queue[0].status === 'completed', 'task_queue.status: completed');
  await assert(content5.status === 'completed', 'content.status: completed');
  console.log('');

  // 6. 정리
  console.log('🧹 테스트 데이터 정리...\n');
  await connection.execute(`DELETE FROM task_queue WHERE task_id = ?`, [testTaskId]);
  await connection.execute(`DELETE FROM content WHERE content_id = ?`, [testTaskId]);
  await connection.execute(`DELETE FROM task WHERE task_id = ?`, [testTaskId]);

  // 결과
  console.log('='.repeat(80));
  console.log(`\n📊 테스트 결과: ${passed}개 통과 / ${failed}개 실패\n`);
  
  if (failed === 0) {
    console.log('✅ 모든 테스트 통과!\n');
  } else {
    console.log(`❌ ${failed}개 테스트 실패!\n`);
    process.exit(1);
  }

} catch (error) {
  console.error('\n❌ 테스트 에러:', error.message);
  
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
