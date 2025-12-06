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
      'SELECT id, title, status, type, priority FROM bugs WHERE status = ? ORDER BY priority ASC, created_at ASC LIMIT 10',
      ['open']
    );

    if (rows.length === 0) {
      console.log('No open bugs found.');
    } else {
      console.log('Open bugs:');
      rows.forEach(r => {
        console.log(`  - BTS-${r.id}: ${r.title} (${r.type}, ${r.priority})`);
      });
    }
  } finally {
    await conn.end();
  }
}

main().catch(console.error);
