const mysql = require('mysql2/promise');

async function main() {
  const conn = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'trend2024',
    database: 'trend_video'
  });

  try {
    const [rows] = await conn.query(
      'SELECT * FROM bugs WHERE id = ?',
      [3133]
    );

    if (rows.length === 0) {
      console.log('Bug not found.');
    } else {
      const bug = rows[0];
      console.log('=== BTS-3133 ===');
      console.log('Title:', bug.title);
      console.log('Type:', bug.type);
      console.log('Status:', bug.status);
      console.log('Priority:', bug.priority);
      console.log('Summary:', bug.summary);
      console.log('Metadata:', bug.metadata);
      console.log('Assigned:', bug.assigned_to);
    }
  } finally {
    await conn.end();
  }
}

main().catch(console.error);
