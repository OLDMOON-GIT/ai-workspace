import mysql from 'mysql2/promise';

const pool = mysql.createPool({
  host: 'localhost',
  user: 'root',
  password: 'trend2024',
  database: 'trend_video',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

async function fixStuckTask() {
  const taskId = '0b928aee-c3cb-46e0-bcba-df35648a31a8';

  try {
    console.log(`=== Task ${taskId} 수정 ===\n`);

    // 1. task_queue를 image waiting으로 변경
    await pool.query(`
      UPDATE task_queue
      SET type = 'image', status = 'waiting'
      WHERE task_id = ?
    `, [taskId]);
    console.log('✅ task_queue: image waiting으로 변경');

    // 2. content.status를 draft로 변경
    await pool.query(`
      UPDATE content
      SET status = 'draft'
      WHERE content_id = ?
    `, [taskId]);
    console.log('✅ content.status: draft로 변경');

    console.log('\n✅ 수정 완료! 이미지 워커가 다시 처리할 것입니다.');

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

fixStuckTask();
