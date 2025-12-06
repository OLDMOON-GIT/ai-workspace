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
      'SELECT id, title, summary, metadata FROM bugs WHERE id IN (3170, 3174)'
    );

    for (const bug of rows) {
      console.log(`\n=== BTS-${bug.id} ===`);
      console.log('Title:', bug.title);
      console.log('Summary:', bug.summary);
      console.log('Metadata:', bug.metadata);
    }
  } finally {
    await conn.end();
  }
}

main().catch(console.error);
