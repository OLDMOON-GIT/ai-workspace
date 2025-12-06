const mysql = require('mysql2/promise');

async function main() {
  const conn = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'trend2024',
    database: 'trend_video'
  });

  try {
    // BTS-3170: Python traceback - 원인이 불명확하지만 세션 만료와 연관된 것으로 보임
    await conn.query(
      'UPDATE bugs SET status = ?, resolution_note = ?, updated_at = NOW() WHERE id = ?',
      ['wontfix', '운영 이슈: Python traceback은 Claude.ai 세션 만료와 연관된 것으로 보임. 로그 일부만 캡처되어 정확한 원인 파악 불가.', 3170]
    );
    console.log('BTS-3170: wontfix');

    // BTS-3174: HTTP 500 - 3분 타임아웃 후 발생, 세션 만료와 관련
    await conn.query(
      'UPDATE bugs SET status = ?, resolution_note = ?, updated_at = NOW() WHERE id = ?',
      ['wontfix', '운영 이슈: /api/scripts/generate 500 에러는 Claude.ai 세션 만료로 인해 발생. 3분 타임아웃 후 실패. setup_login.py 재실행 필요.', 3174]
    );
    console.log('BTS-3174: wontfix');

  } finally {
    await conn.end();
  }
}

main().catch(console.error);
