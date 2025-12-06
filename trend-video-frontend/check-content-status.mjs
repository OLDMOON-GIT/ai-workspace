import mysql from 'mysql2/promise';

const connection = await mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: 'trend2024',
  database: 'trend_video'
});

try {
  console.log('\n📋 현재 content.status 값 확인\n');

  const [rows] = await connection.execute(`
    SELECT status, COUNT(*) as cnt
    FROM content
    GROUP BY status
    ORDER BY cnt DESC
  `);

  console.table(rows);

  console.log('\n');

} catch (error) {
  console.error('❌ Error:', error.message);
} finally {
  await connection.end();
}
