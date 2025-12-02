import mysql from 'mysql2/promise';

const connection = await mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: 'trend2024',
  database: 'trend_video'
});

const [rows] = await connection.execute(`
  SELECT task_id, type, status, updated_at,
         TIMESTAMPDIFF(MINUTE, updated_at, NOW()) as minutes_elapsed
  FROM task_queue
  WHERE status='processing'
  ORDER BY updated_at DESC
  LIMIT 5
`);

console.log('Processing tasks:');
rows.forEach(row => {
  console.log(`- ${row.task_id}: ${row.type}, ${row.minutes_elapsed}분 경과, updated_at=${row.updated_at}`);
});

if (rows.length === 0) {
  console.log('No processing tasks found');
}

await connection.end();
