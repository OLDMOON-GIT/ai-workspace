#!/usr/bin/env node
const mysql = require('mysql2/promise');

(async () => {
  const conn = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'trend2024',
    database: 'trend_video'
  });

  // 테스트/더미 버그 일괄 삭제 또는 resolved 처리
  const testBugs = [
    'BTS-AUTO-1764709439568-qklk',
    'BTS-AUTO-1764709422083-tcwn',
    'BTS-AUTO-1764705503986-t0ic',
    'BTS-AUTO-1764705361732-h42u',
    'BTS-AUTO-1764705340795-cui7'
  ];

  console.log('\n테스트/더미 버그 정리 중...\n');

  for (const bugId of testBugs) {
    await conn.execute(`
      UPDATE bugs
      SET status = 'resolved',
          resolution_note = '테스트/더미 버그 - 자동 정리',
          updated_at = NOW()
      WHERE id = ?
    `, [bugId]);
    console.log(`✅ ${bugId} resolved`);
  }

  console.log(`\n총 ${testBugs.length}건 처리 완료!\n`);

  await conn.end();
})();
