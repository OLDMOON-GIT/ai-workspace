const mysql = require('mysql2/promise');

async function main() {
  const conn = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'trend2024',
    database: 'trend_video'
  });

  // Unknown Error 버그들 상세 확인
  const [bugs] = await conn.execute(`
    SELECT id, title, summary
    FROM bugs
    WHERE id IN ('BTS-0001203', 'BTS-0001204', 'BTS-0001205', 'BTS-0001206', 'BTS-0001207', 'BTS-0001208', 'BTS-0001209', 'BTS-0001210', 'BTS-0001211')
    ORDER BY id
  `);

  bugs.forEach(b => {
    console.log(`=== ${b.id}: ${b.title} ===`);
    console.log(b.summary || 'N/A');
    console.log('');
  });

  await conn.end();
}

main().catch(console.error);
