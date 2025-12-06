const mysql = require('mysql2/promise');

async function main() {
  const conn = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'trend2024',
    database: 'trend_video'
  });

  // 현재 최대 BTS ID 확인
  const [maxRows] = await conn.execute("SELECT MAX(CAST(SUBSTRING(id, 5) AS UNSIGNED)) as max_num FROM bugs WHERE id LIKE 'BTS-%'");
  const maxNum = maxRows[0].max_num || 0;
  const nextNum = maxNum + 1;

  // sequence 테이블 동기화
  await conn.execute('UPDATE bug_sequence SET next_number = ?', [nextNum + 1]);

  const btsId = 'BTS-' + String(nextNum).padStart(7, '0');

  // SPEC 등록
  await conn.execute(`
    INSERT INTO bugs (id, type, title, summary, status, metadata, created_at, updated_at)
    VALUES (?, 'spec', ?, ?, 'open', ?, NOW(), NOW())
  `, [
    btsId,
    '설정 페이지 쿠팡 통계/딥링크/베스트셀러 섹션 제거',
    '설정 페이지에서 쿠팡 관련 기능 제거: 1) 쿠팡 통계 섹션(총 링크 수, 총 클릭 수, 예상 수익, 전환율) 2) 생성된 딥링크 목록 3) 베스트셀러 상품 섹션. 이유: 쿠팡 API에서 통계를 가져오지 못하고, 해당 기능들이 현재 사용되지 않음.',
    JSON.stringify({
      source: 'user-request',
      category: 'ui-cleanup',
      priority: 'P2'
    })
  ]);

  console.log('SPEC 등록 완료:', btsId);
  await conn.end();
}

main().catch(console.error);
