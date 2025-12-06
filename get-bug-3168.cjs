const mysql = require('mysql2/promise');

async function main() {
  const conn = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'trend2024',
    database: 'trend_video'
  });

  try {
    const [rows] = await conn.query('SELECT * FROM bugs WHERE id = ?', [3168]);
    if (rows.length > 0) {
      const bug = rows[0];
      console.log('=== BTS-3168 ===');
      console.log('Title:', bug.title);
      console.log('Summary:', bug.summary);
      console.log('Metadata:', bug.metadata);
    }
  } finally {
    await conn.end();
  }
}

main().catch(console.error);
