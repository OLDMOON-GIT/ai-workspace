import mysql from 'mysql2/promise';

const pool = mysql.createPool({
  host: '127.0.0.1',
  port: 3306,
  user: 'root',
  password: 'trend2024!',
  database: 'trend_video',
  charset: 'utf8mb4',
  timezone: '+09:00',
});

try {
  const [rows] = await pool.query(`
    SELECT * FROM task_lock
    WHERE lock_type = 'youtube'
    ORDER BY created_at DESC
    LIMIT 10
  `);

  console.log('=== Task Lock (YouTube) ===');
  if (rows.length === 0) {
    console.log('락이 없습니다.');
  } else {
    rows.forEach(row => {
      console.log('\n---');
      console.log(`Lock Type: ${row.lock_type}`);
      console.log(`Task ID: ${row.task_id}`);
      console.log(`Status: ${row.status}`);
      console.log(`User ID: ${row.user_id || 'N/A'}`);
      console.log(`Created: ${row.created_at}`);
      console.log(`Updated: ${row.updated_at || 'N/A'}`);
    });
  }

  await pool.end();
} catch (error) {
  console.error('Error:', error.message);
  process.exit(1);
}
