const mysql = require('mysql2/promise');

async function main() {
  const conn = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'trend2024',
    database: 'trend_video'
  });

  // SPEC 등록
  await conn.execute(`
    INSERT INTO bugs (id, title, summary, status, type, metadata, created_at, updated_at)
    VALUES (
      'BTS-0001172',
      'bugs 테이블에 priority 컬럼 추가 및 BTS UI 표시',
      'bugs 테이블에 priority 컬럼(P0/P1/P2/P3) 추가하고, Admin BTS 페이지에서 우선순위를 표시하도록 구현',
      'open',
      'spec',
      '{"priority": "P1", "components": ["schema-mysql.sql", "admin/bugs/page.tsx"]}',
      NOW(),
      NOW()
    )
  `);

  console.log('BTS-0001172 SPEC 등록 완료');
  await conn.end();
}

main().catch(console.error);
