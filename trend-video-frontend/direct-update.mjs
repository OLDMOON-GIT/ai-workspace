import mysql from 'mysql2/promise';

const DB_CONFIG = {
  host: '127.0.0.1',
  port: 3306,
  user: 'root',
  password: 'trend2024',
  database: 'trend_video'
};

async function directUpdate() {
  const connection = await mysql.createConnection(DB_CONFIG);

  const taskId = 'eaaaacd5-a59a-4e38-b904-79f677696470';

  // Before
  const [before] = await connection.query(
    'SELECT task_id, type, status, error FROM task_queue WHERE task_id = ?',
    [taskId]
  );
  console.log('\n📊 BEFORE UPDATE:');
  console.table(before);

  // UPDATE
  const [result] = await connection.query(
    'UPDATE task_queue SET type = ?, status = ?, error = NULL WHERE task_id = ?',
    ['script', 'waiting', taskId]
  );
  console.log('\n✅ UPDATE result:', result);
  console.log('   affectedRows:', result.affectedRows);
  console.log('   changedRows:', result.changedRows);

  // After
  const [after] = await connection.query(
    'SELECT task_id, type, status, error FROM task_queue WHERE task_id = ?',
    [taskId]
  );
  console.log('\n📊 AFTER UPDATE:');
  console.table(after);

  await connection.end();
}

directUpdate().catch(console.error);
