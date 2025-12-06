const mysql = require('mysql2/promise');

(async () => {
  const conn = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'trend2024',
    database: 'trend_video'
  });

  // 다음 버그 ID 조회 (id는 int 타입)
  const [maxId] = await conn.execute('SELECT MAX(id) as maxNum FROM bugs');
  const bugId = (maxId[0].maxNum || 0) + 1;

  const title = 'spawning-pool 스폰 명령어에서 auto-worker 제거 및 버그 내용 전달';
  const summary = `현재 문제:
스폰 명령어: claude --dangerously-skip-permissions auto-worker "BTS-3015 ..."

문제점:
1. auto-worker 파라미터가 불필요하게 포함됨
2. 버그 내용(summary)이 제대로 전달되지 않음 ("BTS-3015 ..."만 표시)

수정 필요:
1. auto-worker 제거
2. 버그 제목과 요약 내용을 함께 전달하도록 수정

예상 수정 위치: mcp-debugger/src/spawning-pool.ts`;

  await conn.execute(
    'INSERT INTO bugs (id, title, summary, type, priority, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())',
    [bugId, title, summary, 'bug', 'P1', 'open']
  );

  console.log('버그 등록 완료: ' + bugId);
  console.log('제목: ' + title);

  await conn.end();
})();
