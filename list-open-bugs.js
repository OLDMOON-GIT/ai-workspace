const mysql = require('mysql2/promise');

async function main() {
  const conn = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'trend2024',
    database: 'trend_video'
  });

  const [bugs] = await conn.execute(`
    SELECT id, title, priority, type, created_at
    FROM bugs
    WHERE status = 'open'
    ORDER BY
      CASE priority WHEN 'P0' THEN 0 WHEN 'P1' THEN 1 WHEN 'P2' THEN 2 ELSE 3 END,
      created_at ASC
    LIMIT 15
  `);

  console.log('=== Open 버그/SPEC 목록 (우선순위순) ===');
  bugs.forEach(b => {
    const title = b.title ? b.title.substring(0, 50) : '';
    console.log(`[${b.priority || 'P2'}] ${b.id} (${b.type}): ${title}`);
  });
  console.log(`\n총 ${bugs.length}개`);

  await conn.end();
}

main().catch(console.error);
