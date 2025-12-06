const mysql = require('mysql2/promise');

async function main() {
  const conn = await mysql.createConnection({
    host: '127.0.0.1',
    user: 'root',
    password: 'trend2024',
    database: 'trend_video'
  });

  try {
    // API와 동일한 쿼리 테스트

    // 1. status counts
    console.log('=== Status Counts ===');
    const [countRows] = await conn.query(
      'SELECT status, COUNT(*) as count FROM bugs GROUP BY status'
    );
    console.log('countRows:', countRows);

    // 2. type counts
    console.log('\n=== Type Counts ===');
    const [typeRows] = await conn.query(
      'SELECT type, COUNT(*) as count FROM bugs GROUP BY type'
    );
    console.log('typeRows:', typeRows);

    // 3. 버그 목록 조회
    console.log('\n=== Bugs List (first 3) ===');
    const [bugRows] = await conn.query(
      'SELECT * FROM bugs WHERE 1=1 ORDER BY created_at DESC LIMIT 3'
    );
    console.log('bugRows:', bugRows);

    // 4. status 값 확인
    console.log('\n=== Distinct Status Values ===');
    const [statuses] = await conn.query(
      'SELECT DISTINCT status FROM bugs'
    );
    console.log('statuses:', statuses);

  } catch (err) {
    console.error('에러:', err.message);
    console.error('Full error:', err);
  } finally {
    await conn.end();
  }
}

main();
