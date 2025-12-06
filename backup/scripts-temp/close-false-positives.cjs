const mysql = require('mysql2/promise');

async function main() {
  const conn = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'trend2024',
    database: 'trend_video'
  });

  try {
    // 오탐 버그들 (정상 로그를 에러로 오인)
    const falsePosiveBugs = [
      { id: 3178, note: '오탐: story.json 파일 경로 출력은 정상 로그' },
      { id: 3179, note: '오탐: story.json 파일 경로 출력은 정상 로그' },
      { id: 3180, note: '오탐: story.json 파일 경로 출력은 정상 로그' },
      { id: 3181, note: '오탐: story.json 파일 경로 출력은 정상 로그' },
      { id: 3182, note: '오탐: 코드 스니펫이 로그에 출력된 것을 에러로 오인' },
      { id: 3183, note: '오탐: "락 해제" 로그는 정상 동작 로그' },
    ];

    console.log('=== 오탐 버그 종료 ===');
    for (const bug of falsePosiveBugs) {
      await conn.query(
        'UPDATE bugs SET status = ?, resolution_note = ?, updated_at = NOW() WHERE id = ?',
        ['invalid', bug.note, bug.id]
      );
      console.log(`  BTS-${bug.id}: invalid`);
    }

    // SPEC 버그들 확인
    const [specs] = await conn.query(
      'SELECT id, title, summary FROM bugs WHERE id IN (3184, 3185)'
    );

    console.log('\n=== SPEC 작업 (유지) ===');
    for (const spec of specs) {
      console.log(`  BTS-${spec.id}: ${spec.title}`);
    }

  } finally {
    await conn.end();
  }
}

main().catch(console.error);
