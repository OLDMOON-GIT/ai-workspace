const mysql = require('mysql2/promise');

async function reopenBug() {
  const connection = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'trend2024',
    database: 'trend_video'
  });

  try {
    // BTS-0000058 재오픈
    const bugId = 'BTS-0000058';

    // 기존 메타데이터 가져오기
    const [rows] = await connection.query(
      'SELECT metadata FROM bugs WHERE id = ?',
      [bugId]
    );

    if (rows.length === 0) {
      console.error(`❌ Bug ${bugId} not found`);
      return;
    }

    const existingMetadata = JSON.parse(rows[0].metadata);

    // 재발 정보 추가
    existingMetadata.reopened_count = (existingMetadata.reopened_count || 0) + 1;
    existingMetadata.reopened_at = new Date().toISOString();
    existingMetadata.reopen_reason = '수정이 실제로 적용되지 않아 동일 에러 재발';
    existingMetadata.actual_fix_applied_at = new Date().toISOString();

    // 상태를 resolved로 유지하되, 메타데이터 업데이트
    await connection.query(
      'UPDATE bugs SET metadata = ?, updated_at = NOW() WHERE id = ?',
      [JSON.stringify(existingMetadata), bugId]
    );

    console.log(`✅ Bug ${bugId} 재발 정보 업데이트 완료`);
    console.log(`   - 재발 횟수: ${existingMetadata.reopened_count}`);
    console.log(`   - 재발 사유: ${existingMetadata.reopen_reason}`);
    console.log(`   - 실제 수정 적용: ${existingMetadata.actual_fix_applied_at}`);

  } finally {
    await connection.end();
  }
}

reopenBug().catch(console.error);
