const mysql = require('mysql2/promise');

async function main() {
  const conn = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'trend2024',
    database: 'trend_video'
  });

  // 최근 실행된 작업 확인
  const [tasks] = await conn.execute(`
    SELECT tq.task_id, tq.type, tq.status, c.title, tq.created_at
    FROM task_queue tq
    LEFT JOIN content c ON tq.task_id = c.content_id
    ORDER BY tq.created_at DESC
    LIMIT 10
  `);

  console.log('=== 최근 task_queue 작업 ===');
  tasks.forEach(t => {
    const title = t.title ? t.title.substring(0, 30) : 'N/A';
    console.log(`[${t.status}] ${t.type} - ${t.task_id.substring(0,8)}... - ${title}`);
  });

  // 실행 중인 작업
  const [running] = await conn.execute(`
    SELECT task_id, type, status FROM task_queue WHERE status IN ('running', 'processing')
  `);
  console.log('\n=== 실행 중인 작업 ===');
  if (running.length === 0) {
    console.log('없음');
  } else {
    running.forEach(r => {
      console.log(`[${r.type}] ${r.task_id} - ${r.status}`);
    });
  }

  await conn.end();
}

main().catch(console.error);
