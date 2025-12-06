const mysql = require('mysql2/promise');

(async () => {
  const conn = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'trend2024',
    database: 'trend_video'
  });

  // open이고 assigned_to가 NULL인 버그만
  const [rows] = await conn.execute(
    "SELECT id, title, status, priority, type, assigned_to FROM bugs WHERE status = 'open' AND (assigned_to IS NULL OR assigned_to = '') ORDER BY priority ASC, created_at ASC LIMIT 20"
  );

  console.log('미할당 open 버그:', rows.length, '건');
  rows.forEach(b => console.log(b.id, b.priority || 'P2', b.type || 'bug', '|', b.title?.substring(0,60)));

  await conn.end();
})();
