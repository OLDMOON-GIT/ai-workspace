const mysql = require('mysql2/promise');

(async () => {
  const conn = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'trend2024',
    database: 'trend_video'
  });

  // 다음 ID 조회
  const [rows] = await conn.execute('SELECT MAX(CAST(SUBSTRING(id, 5) AS UNSIGNED)) as maxNum FROM bugs');
  const nextNum = (rows[0].maxNum || 0) + 1;
  const nextId = 'BTS-' + String(nextNum).padStart(7, '0');

  const title = '[SPEC] 버그/SPEC 등록 시스템 자기참조 방지 예약어 필터';
  const summary = `## 문제
버그 등록 시스템이 '버그등록', 'SPEC등록' 관련 에러를 감지하면 자기 자신을 버그로 등록하려 함.
이로 인해 Claude CLI가 복수 개 띄워지는 무한 루프 발생.

## 해결방안
BTS 등록 시 예약어 필터를 추가:
- '버그등록', 'BUG-CREATE', 'bug-bridge'
- 'SPEC등록', 'SPEC-CREATE'
- 'notification-worker', 'mcp-debugger'
- 'BTS-' (자기 버그 ID 참조 방지)

## 구현 위치
- mcp-debugger/src/bug-bridge.ts
- mcp-debugger/notification-worker.cjs

## 예약어 목록
\`\`\`javascript
const RESERVED_KEYWORDS = [
  'BUG-CREATE', 'SPEC-CREATE',
  'bug-bridge', 'notification-worker',
  'mcp-debugger', 'BTS-',
  '버그등록', 'SPEC등록', '스펙등록'
];
\`\`\`

예약어가 포함된 에러는 BTS 등록 대상에서 제외.`;

  await conn.execute(
    'INSERT INTO bugs (id, title, summary, status, type, metadata, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())',
    [nextId, title, summary, 'open', 'spec', '{}']
  );

  console.log('SPEC 등록 완료:', nextId);
  console.log('제목:', title);
  await conn.end();
})();
