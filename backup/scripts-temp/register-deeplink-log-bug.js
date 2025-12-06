const mysql = require('mysql2/promise');

async function main() {
  const conn = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'trend2024',
    database: 'trend_video'
  });

  // 최대 버그 번호 확인
  const [max] = await conn.execute('SELECT MAX(CAST(SUBSTRING(id, 5) AS UNSIGNED)) as maxNum FROM bugs');
  const nextNum = (max[0].maxNum || 0) + 1;
  const bugId = 'BTS-' + String(nextNum).padStart(7, '0');

  await conn.execute(
    `INSERT INTO bugs (id, title, summary, status, type, priority, metadata, created_at, updated_at)
     VALUES (?, ?, ?, 'open', 'bug', 'P3', '{}', NOW(), NOW())`,
    [
      bugId,
      '딥링크 생성 실패 시 불필요한 로그 출력',
      '딥링크 생성 실패는 정상 동작(스킵)이지만 에러처럼 보이는 로그가 남아 노이즈 발생. 로그 레벨 조정 또는 제거 필요.'
    ]
  );

  console.log(bugId + ' 등록 완료');
  await conn.end();
}

main().catch(console.error);
