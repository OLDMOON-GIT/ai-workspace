import mysql from 'mysql2/promise';

const DB_CONFIG = {
  host: '127.0.0.1',
  port: 3306,
  user: 'root',
  password: 'trend2024',
  database: 'trend_video'
};

async function checkStatus() {
  const connection = await mysql.createConnection(DB_CONFIG);

  const [rows] = await connection.query(
    'SELECT task_id, type, status, error, created_at FROM task_queue WHERE task_id = ?',
    ['eaaaacd5-a59a-4e38-b904-79f677696470']
  );

  console.log('Current status in task_queue:');
  console.table(rows);

  await connection.end();
}

checkStatus().catch(console.error);
