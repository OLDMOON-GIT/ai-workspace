const mysql = require('mysql2/promise');

async function checkBugCount() {
  const connection = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'trend2024',
    database: 'trend_video'
  });

  const [rows] = await connection.execute(
    "SELECT COUNT(*) as count FROM bugs WHERE status != 'resolved' AND status != 'closed'"
  );
  
  await connection.end();
  console.log(rows[0].count);
}

checkBugCount().catch(console.error);
