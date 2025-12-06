const mysql = require('mysql2/promise');

async function main() {
  const conn = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'trend2024',
    database: 'trend_video'
  });

  // priority 컬럼 추가
  try {
    await conn.execute(`
      ALTER TABLE bugs
      ADD COLUMN priority ENUM('P0', 'P1', 'P2', 'P3') DEFAULT 'P2'
      COMMENT 'P0=Critical, P1=High, P2=Medium, P3=Low'
      AFTER type
    `);
    console.log('✅ priority 컬럼 추가 완료');
  } catch (e) {
    if (e.code === 'ER_DUP_FIELDNAME') {
      console.log('⚠️ priority 컬럼 이미 존재');
    } else {
      throw e;
    }
  }

  // 기존 데이터의 metadata에서 priority 추출하여 업데이트
  const [bugs] = await conn.execute(`SELECT id, metadata FROM bugs WHERE priority IS NULL AND metadata IS NOT NULL`);
  console.log(`\n📦 ${bugs.length}개 버그의 priority 마이그레이션 중...`);

  for (const bug of bugs) {
    try {
      const meta = JSON.parse(bug.metadata);
      if (meta.priority) {
        await conn.execute(`UPDATE bugs SET priority = ? WHERE id = ?`, [meta.priority, bug.id]);
        console.log(`  ✓ ${bug.id}: ${meta.priority}`);
      }
    } catch (e) {
      // JSON 파싱 실패 무시
    }
  }

  console.log('\n✅ 마이그레이션 완료');

  // 확인
  const [result] = await conn.execute(`SELECT id, priority, title FROM bugs ORDER BY created_at DESC LIMIT 5`);
  console.log('\n=== 최근 5개 버그 ===');
  result.forEach(r => console.log(`[${r.priority || 'NULL'}] ${r.id}: ${r.title?.substring(0, 40)}...`));

  await conn.end();
}

main().catch(console.error);
