const mysql = require('mysql2/promise');

async function main() {
  const conn = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'trend2024',
    database: 'trend_video'
  });

  try {
    // 운영 이슈로 분류된 버그들 (코드 수정 불필요)
    const operationalBugs = [
      { id: 3168, note: '운영 이슈: Claude.ai 세션 만료 - setup_login.py 재실행 필요' },
      { id: 3169, note: '운영 이슈: 사용자가 브라우저를 닫아서 발생한 에러' },
      { id: 3173, note: '운영 이슈: 사용자가 브라우저를 닫아서 발생한 에러 (중복)' },
      { id: 3175, note: '운영 이슈: Claude.ai 세션 만료 - setup_login.py 재실행 필요 (중복)' },
      { id: 3177, note: '운영 이슈: 사용자가 브라우저를 닫아서 발생한 에러 (중복)' },
    ];

    // 오탐으로 분류된 버그들 (버그가 아님)
    const falsePosiveBugs = [
      { id: 3171, note: '오탐: "알림 이메일 전송 완료"는 성공 로그임' },
      { id: 3172, note: '오탐: UUID 출력은 정상 디버그 로그' },
      { id: 3176, note: '오탐: 코드 스니펫이 로그에 출력된 것을 에러로 오인' },
    ];

    // 실제 조사가 필요한 버그들 (분석 필요)
    const needsInvestigation = [
      { id: 3170, note: 'Python traceback - 추가 분석 필요' },
      { id: 3174, note: 'HTTP 500 에러 - 추가 분석 필요' },
    ];

    console.log('=== 운영 이슈 버그 종료 ===');
    for (const bug of operationalBugs) {
      await conn.query(
        'UPDATE bugs SET status = ?, resolution_note = ?, updated_at = NOW() WHERE id = ?',
        ['wontfix', bug.note, bug.id]
      );
      console.log(`  BTS-${bug.id}: wontfix`);
    }

    console.log('\n=== 오탐 버그 종료 ===');
    for (const bug of falsePosiveBugs) {
      await conn.query(
        'UPDATE bugs SET status = ?, resolution_note = ?, updated_at = NOW() WHERE id = ?',
        ['invalid', bug.note, bug.id]
      );
      console.log(`  BTS-${bug.id}: invalid`);
    }

    console.log('\n=== 분석 필요 버그 (유지) ===');
    for (const bug of needsInvestigation) {
      console.log(`  BTS-${bug.id}: open 유지 - ${bug.note}`);
    }

  } finally {
    await conn.end();
  }
}

main().catch(console.error);
