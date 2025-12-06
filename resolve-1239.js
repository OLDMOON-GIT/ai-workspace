const mysql = require('mysql2/promise');

async function main() {
  const conn = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'trend2024',
    database: 'trend_video'
  });

  const sql = `UPDATE bugs SET status = 'resolved', resolution_note = 'coupang-deeplink.ts, coupang-client.ts에서 딥링크 생성 실패 시 console.error 로그 제거. 정상 스킵 동작 시 노이즈 방지.', updated_at = NOW() WHERE id = 'BTS-0001239'`;

  await conn.query(sql);
  console.log('BTS-0001239 resolved');

  await conn.end();
}

main().catch(console.error);
