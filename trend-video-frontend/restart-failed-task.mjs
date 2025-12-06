import mysql from 'mysql2/promise';

const taskId = '77fb7660-56a7-47d9-bd46-cd35b4180b64';

const connection = await mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: 'trend2024',
  database: 'trend_video'
});

try {
  console.log(`\n🔄 Failed task 재시작: ${taskId}\n`);

  // 1. 현재 상태 확인
  const [queue] = await connection.execute(`
    SELECT type, status, error FROM task_queue WHERE task_id = ?
  `, [taskId]);

  console.log('현재 상태:');
  console.table(queue);

  if (queue[0].status !== 'failed') {
    console.log('\n⚠️  failed 상태가 아닙니다. 현재 상태:', queue[0].status);
  } else {
    // 2. status를 waiting으로 변경하고 error 제거
    await connection.execute(`
      UPDATE task_queue
      SET status = 'waiting', error = NULL
      WHERE task_id = ?
    `, [taskId]);

    console.log('\n✅ task_queue 상태 변경:');
    console.log(`   status: failed → waiting`);
    console.log(`   error: 제거됨`);

    // 3. 최종 상태 확인
    const [updated] = await connection.execute(`
      SELECT type, status, error FROM task_queue WHERE task_id = ?
    `, [taskId]);

    console.log('\n최종 상태:');
    console.table(updated);

    console.log('\n✅ 재시작 완료! unified-worker가 곧 처리합니다.\n');
  }

} catch (error) {
  console.error('❌ 에러:', error.message);
} finally {
  await connection.end();
}
