#!/usr/bin/env node
import mysql from 'mysql2/promise';

const dbConfig = {
  host: 'localhost',
  user: 'root',
  password: 'trend2024',
  database: 'trend_video'
};

async function main() {
  const conn = await mysql.createConnection(dbConfig);

  // 현재 가장 큰 버그 번호 확인
  const [rows] = await conn.execute(`
    SELECT id FROM bugs WHERE id REGEXP '^BTS-[0-9]+$' ORDER BY CAST(SUBSTRING(id, 5) AS UNSIGNED) DESC LIMIT 1
  `);

  console.log(`📊 조회된 버그 수: ${rows.length}`);

  if (rows.length > 0) {
    const lastId = rows[0].id;
    const match = lastId.match(/BTS-(\d+)/);
    if (match) {
      const lastNum = parseInt(match[1]);
      const nextNum = lastNum + 1;

      console.log(`📊 마지막 Bug ID: ${lastId}`);
      console.log(`🔢 다음 번호: ${nextNum}`);

      await conn.execute(`UPDATE bug_sequence SET next_number = ? WHERE id = 1`, [nextNum]);
      console.log(`✅ bug_sequence 업데이트 완료: next_number = ${nextNum}`);
    }
  } else {
    console.log('⚠️  버그가 하나도 없습니다. next_number를 1로 설정합니다.');
    await conn.execute(`UPDATE bug_sequence SET next_number = 1 WHERE id = 1`);
  }

  // 확인
  const [seq] = await conn.execute(`SELECT * FROM bug_sequence WHERE id = 1`);
  console.log('\n현재 bug_sequence:', seq[0]);

  await conn.end();
}

main().catch(err => {
  console.error('❌ 에러:', err);
  process.exit(1);
});
