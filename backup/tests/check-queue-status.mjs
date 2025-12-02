import mysql from 'mysql2/promise';

const pool = mysql.createPool({
  host: '127.0.0.1',
  port: 3306,
  user: 'root',
  password: 'trend2024',
  database: 'trend_video',
  charset: 'utf8mb4',
  timezone: '+09:00',
});

try {
  const [rows] = await pool.query(`
    SELECT
      status,
      COUNT(*) as count
    FROM task_queue
    WHERE type = 'schedule'
    GROUP BY status
    ORDER BY count DESC
  `);

  console.log('=== Task Queue Status 분포 ===');
  if (rows.length === 0) {
    console.log('큐가 비어있습니다.');
  } else {
    rows.forEach(row => {
      console.log(`${row.status.padEnd(25)} : ${row.count}개`);
    });
  }

  console.log('\n=== 최근 10개 작업 상태 ===');
  const [recent] = await pool.query(`
    SELECT
      task_id,
      type,
      status,
      created_at
    FROM task_queue
    WHERE type = 'schedule'
    ORDER BY created_at DESC
    LIMIT 10
  `);

  recent.forEach(r => {
    console.log(`[${r.status}] ${r.task_id.substring(0, 8)}... (${r.created_at})`);
  });

  await pool.end();
} catch (error) {
  console.error('Error:', error.message);
  process.exit(1);
}
