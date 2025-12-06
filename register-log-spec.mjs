import mysql from 'mysql2/promise';

const conn = await mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: 'trend2024',
  database: 'trend_video'
});

const title = 'Log Monitor 상태 로그 간소화 - 변경 시에만 출력';
const summary = `현재 문제: 10초마다 동일한 상태 로그가 계속 출력됨

개선:
1. 이전 상태와 동일하면 로그 출력 스킵
2. 상태 변경 시에만 로그 출력 (워커 추가/제거, 버그 수 변경)
3. 또는 1분에 1회만 상태 출력, 변경 시 즉시 출력

관련 파일:
- mcp-debugger/src/monitor.ts - setInterval 내 console.log 부분
- 이전 상태 저장 변수 추가하여 비교 후 출력`;

const [result] = await conn.execute(
  'INSERT INTO bugs (type, title, summary, status, created_at, updated_at) VALUES (?, ?, ?, ?, NOW(), NOW())',
  ['spec', title, summary, 'open']
);

const bugId = 'BTS-' + String(result.insertId).padStart(7, '0');
console.log('SPEC 등록 완료:', bugId);

await conn.end();
