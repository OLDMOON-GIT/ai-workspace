const mysql = require('mysql2/promise');

async function main() {
  const conn = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'trend2024',
    database: 'trend_video'
  });

  const [rows] = await conn.execute(`
    SELECT id, type, title, status,
           JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.priority')) as priority,
           created_at
    FROM bugs
    WHERE status = 'open'
    ORDER BY created_at ASC
    LIMIT 20
  `);

  console.log('=== Open Bugs/SPECs ===');
  console.log('Total:', rows.length);
  console.log('');
  rows.forEach(r => {
    console.log(`[${r.id}] (${r.type || 'bug'}) ${r.priority || 'P3'} - ${r.title}`);
  });

  await conn.end();
}

main().catch(console.error);
