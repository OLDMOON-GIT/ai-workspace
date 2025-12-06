const mysql = require('mysql2/promise');

async function main() {
  const conn = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'trend2024',
    database: 'trend_video'
  });

  // BTS-0001203 resolved
  await conn.execute(
    `UPDATE bugs
     SET status = 'resolved',
         summary = CONCAT(summary, ' 해결: json-utils.cjs fixJsonString에 잘못된 Unicode escape 수정 로직 추가.'),
         updated_at = NOW()
     WHERE id = 'BTS-0001203'`
  );
  console.log('✅ BTS-0001203 resolved');

  // Open 버그 목록 확인
  const [bugs] = await conn.execute(`SELECT id, title, priority, status FROM bugs WHERE status = 'open' ORDER BY created_at ASC LIMIT 10`);
  console.log('\n=== Remaining Open Bugs ===');
  bugs.forEach(b => console.log(`[${b.priority}] ${b.id}: ${b.title}`));

  await conn.end();
}

main().catch(console.error);
