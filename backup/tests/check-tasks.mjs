import mysql from 'mysql2/promise';

const connection = await mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: 'trend2024',
  database: 'trend_video'
});

const taskIds = [
  'dfc0826d-f0d3-4f19-9ed5-136c342781d3',
  'ede29eeb-c2e1-4c43-8c5d-8398f715b047'
];

console.log('\n=== Task Queue Status ===\n');

for (const taskId of taskIds) {
  const [queues] = await connection.query(`
    SELECT tq.task_id, tq.type, tq.status, tq.error, tq.created_at,
           c.title, c.prompt_format
    FROM task_queue tq
    LEFT JOIN content c ON tq.task_id = c.content_id
    WHERE tq.task_id = ?
    ORDER BY tq.created_at DESC
  `, [taskId]);

  console.log(`Task: ${taskId.substring(0, 8)}...`);
  if (queues.length === 0) {
    console.log('  No queue entries found\n');
  } else {
    queues.forEach(q => {
      console.log(`  Type: ${q.type} | Status: ${q.status} | Title: ${q.title || 'N/A'}`);
      if (q.error) {
        console.log(`  Error: ${q.error.substring(0, 100)}...`);
      }
    });
    console.log('');
  }
}

await connection.end();
