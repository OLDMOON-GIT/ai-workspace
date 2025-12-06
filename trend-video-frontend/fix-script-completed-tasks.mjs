import mysql from 'mysql2/promise';

const taskId = '77fb7660-56a7-47d9-bd46-cd35b4180b64';

const connection = await mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: 'trend2024',
  database: 'trend_video'
});

try {
  console.log(`\n🔧 BTS-0000008 수정: script completed task 복구\n`);
  console.log(`Task ID: ${taskId}\n`);

  // 1. 현재 상태 확인
  console.log('1️⃣ 현재 상태 확인...');
  const [currentQueue] = await connection.execute(`
    SELECT type, status FROM task_queue WHERE task_id = ?
  `, [taskId]);

  const [currentContent] = await connection.execute(`
    SELECT status FROM content WHERE content_id = ?
  `, [taskId]);

  console.log(`   task_queue: ${currentQueue[0]?.type} ${currentQueue[0]?.status}`);
  console.log(`   content.status: ${currentContent[0]?.status}\n`);

  // 2. user_id 가져오기
  const [content] = await connection.execute(`
    SELECT user_id FROM content WHERE content_id = ?
  `, [taskId]);

  if (content.length === 0) {
    throw new Error('Content not found');
  }

  const userId = content[0].user_id;
  console.log(`2️⃣ user_id: ${userId}\n`);

  // 3. content.status를 'waiting'으로 변경 (다음 단계 대기)
  console.log('3️⃣ content.status를 waiting으로 변경...');
  await connection.execute(`
    UPDATE content
    SET status = 'waiting', error = NULL
    WHERE content_id = ?
  `, [taskId]);
  console.log(`   ✅ content.status = 'waiting'\n`);

  // 4. image waiting 큐 생성
  console.log('4️⃣ image waiting 큐 생성...');
  await connection.execute(`
    INSERT INTO task_queue (task_id, type, status, user_id, created_at)
    VALUES (?, 'image', 'waiting', ?, NOW())
  `, [taskId, userId]);
  console.log(`   ✅ image waiting 큐 생성 완료\n`);

  // 5. 최종 상태 확인
  console.log('5️⃣ 최종 상태 확인:\n');
  const [finalQueues] = await connection.execute(`
    SELECT type, status, created_at
    FROM task_queue
    WHERE task_id = ?
    ORDER BY created_at ASC
  `, [taskId]);

  console.table(finalQueues);

  const [finalContent] = await connection.execute(`
    SELECT status FROM content WHERE content_id = ?
  `, [taskId]);

  console.log(`\n📄 content.status: ${finalContent[0].status}`);
  console.log('\n✅ 수정 완료! unified-worker가 image 큐를 처리할 예정입니다.');

} catch (error) {
  console.error('❌ 에러:', error.message);
} finally {
  await connection.end();
}
