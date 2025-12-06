import mysql from 'mysql2/promise';

const taskId = 'c35d6ad0-c463-4833-b162-e35c9afeff5b';

const conn = await mysql.createConnection({
  host: '127.0.0.1',
  user: 'root',
  password: 'trend2024!',
  database: 'trend_video'
});

console.log(`Fixing task_queue for ${taskId}...`);

// 현재 상태 확인
const [before] = await conn.query(
  'SELECT task_id, type, status FROM task_queue WHERE task_id = ? AND type = "youtube"',
  [taskId]
);
console.log('Before:', before);

// status를 waiting으로 변경
const [result] = await conn.query(
  'UPDATE task_queue SET status = "waiting", error = NULL WHERE task_id = ? AND type = "youtube"',
  [taskId]
);
console.log('Updated rows:', result.affectedRows);

// 변경 후 상태 확인
const [after] = await conn.query(
  'SELECT task_id, type, status FROM task_queue WHERE task_id = ? AND type = "youtube"',
  [taskId]
);
console.log('After:', after);

await conn.end();
console.log('✅ Done!');
