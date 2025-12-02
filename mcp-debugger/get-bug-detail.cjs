#!/usr/bin/env node
const mysql = require('mysql2/promise');

(async () => {
  const bugId = process.argv[2];
  if (!bugId) {
    console.error('Usage: node get-bug-detail.cjs <bug_id>');
    process.exit(1);
  }

  const conn = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'trend2024',
    database: 'trend_video'
  });

  const [rows] = await conn.execute('SELECT * FROM bugs WHERE id = ?', [bugId]);

  if (rows.length === 0) {
    console.log('버그를 찾을 수 없습니다.');
  } else {
    const bug = rows[0];
    console.log(`\n버그 ID: ${bug.id}`);
    console.log(`제목: ${bug.title}`);
    console.log(`상태: ${bug.status}`);
    console.log(`생성: ${bug.created_at}`);
    console.log(`업데이트: ${bug.updated_at}`);
    if (bug.assigned_to) console.log(`담당: ${bug.assigned_to}`);
    console.log(`\n요약:\n${bug.summary}`);
    if (bug.metadata) {
      console.log(`\n메타데이터:\n${JSON.stringify(bug.metadata, null, 2)}`);
    }
    if (bug.log_path) console.log(`\n로그: ${bug.log_path}`);
    if (bug.resolution_note) console.log(`\n해결 노트: ${bug.resolution_note}`);
  }

  await conn.end();
})();
