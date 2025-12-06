const mysql = require('mysql2/promise');

async function main() {
  const conn = await mysql.createConnection({
    host: '127.0.0.1',
    user: 'root',
    password: 'trend2024',
    database: 'trend_video'
  });

  try {
    const [rows] = await conn.query('DESCRIBE bugs');
    console.log('bugs 테이블 스키마:');
    console.table(rows);

    // type 컬럼 확인
    const typeCol = rows.find(r => r.Field === 'type');
    if (!typeCol) {
      console.log('\n❌ type 컬럼이 없습니다!');
    } else {
      console.log('\n✅ type 컬럼 존재:', typeCol);
    }
  } catch (err) {
    console.error('에러:', err.message);
  } finally {
    await conn.end();
  }
}

main();
