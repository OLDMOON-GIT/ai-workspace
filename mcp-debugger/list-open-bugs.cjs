#!/usr/bin/env node
const mysql = require('mysql2/promise');

(async () => {
  const conn = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'trend2024',
    database: 'trend_video'
  });

  const [rows] = await conn.execute(`
    SELECT id, title, summary
    FROM bugs
    WHERE status != 'resolved' AND status != 'closed'
    ORDER BY created_at DESC
    LIMIT 20
  `);

  console.log(`\n미해결 버그 ${rows.length}건:\n`);
  rows.forEach((b, idx) => {
    console.log(`${idx + 1}. ${b.id}: ${b.title}`);
  });

  await conn.end();
})();
