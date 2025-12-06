const mysql = require('mysql2/promise');

async function resetFailedTasks() {
  const c = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'trend2024',
    database: 'trend_video'
  });

  try {
    console.log('Reset failed image tasks to retry:');
    const [failed] = await c.query(
      'SELECT task_id FROM task_queue WHERE status="failed" AND type="image" LIMIT 3'
    );

    for (const row of failed) {
      await c.query(
        'UPDATE task_queue SET status="waiting", error=NULL WHERE task_id=?',
        [row.task_id]
      );
      console.log(`  OK ${row.task_id} -> waiting`);
    }

    console.log(`\nReset ${failed.length} tasks`);
  } finally {
    await c.end();
  }
}

resetFailedTasks().catch(console.error);
