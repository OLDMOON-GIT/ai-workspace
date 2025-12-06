
import mysql from 'mysql2/promise';

(async () => {
  const conn = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'trend2024',
    database: 'trend_video'
  });

  const [rows] = await conn.execute('DESCRIBE bugs');

  console.log(rows);

  await conn.end();
})();
