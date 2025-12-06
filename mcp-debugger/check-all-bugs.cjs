#!/usr/bin/env node
const mysql = require('mysql2/promise');

(async () => {
  const conn = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'trend2024',
    database: 'trend_video',
    charset: 'utf8mb4'
  });

  const [rows] = await conn.execute(`
    SELECT id, title, type, status, priority, created_at
    FROM bugs
    WHERE status NOT IN ('resolved', 'closed')
    ORDER BY
      FIELD(priority, 'P1', 'P2', 'P3', NULL),
      created_at ASC
    LIMIT 20
  `);

  console.log(`\n미해결 버그/SPEC ${rows.length}건:\n`);
  rows.forEach((b, i) => {
    console.log(`${i+1}. [${b.type||'bug'}] ${b.id}: ${b.title} (${b.status}, ${b.priority||'N/A'})`);
  });

  if (rows.length === 0) {
    console.log('모든 버그가 해결되었습니다! 🎉');
  }

  await conn.end();
})();
