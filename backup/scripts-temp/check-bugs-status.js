const mysql = require('mysql2/promise');

(async () => {
  const conn = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'trend2024',
    database: 'trend_video'
  });

  // 모든 버그 상태별 카운트
  const [rows] = await conn.query(`
    SELECT status, COUNT(*) as cnt
    FROM bugs
    GROUP BY status
    ORDER BY cnt DESC
  `);

  console.log('=== 버그 상태별 카운트 ===');
  rows.forEach(r => console.log(r.status + ': ' + r.cnt));

  // 최근 버그 확인
  const [recent] = await conn.query(`
    SELECT id, title, status, updated_at
    FROM bugs
    ORDER BY updated_at DESC
    LIMIT 10
  `);

  console.log('\n=== 최근 업데이트된 버그 ===');
  recent.forEach(r => console.log(r.id + ' | ' + r.status + ' | ' + r.title.substring(0, 40)));

  await conn.end();
})();
