#!/usr/bin/env node
/**
 * BTS-3023: notification-worker.cjs에 PID 기반 워커 ID 추가
 */
const fs = require('fs');
const path = require('path');

const targetPath = path.join(__dirname, 'notification-worker.cjs');

// 현재 파일 읽기
let content = fs.readFileSync(targetPath, 'utf-8');

// 이미 MY_WORKER_ID가 있는지 확인
if (content.includes('MY_WORKER_ID')) {
  console.log('MY_WORKER_ID already exists in notification-worker.cjs');
  process.exit(0);
}

// PID 관련 코드 추가 (dbConfig 다음에)
const pidCode = `
// BTS-3023: PID 기반 worker ID
const MY_PID = process.pid;
const MY_WORKER_ID = \`worker-\${MY_PID}\`;

// BTS-3023: assigned_to가 자기 PID인지 확인
function isMyBug(assignedTo) {
  return assignedTo === MY_WORKER_ID;
}
`;

// dbConfig 다음에 추가
content = content.replace(
  /(const dbConfig = \{[^}]+\};)/,
  `$1\n${pidCode}`
);

// 헤더 주석 업데이트
content = content.replace(
  '* 10초마다 MySQL bugs 테이블을 확인하고 알림',
  '* 10초마다 MySQL bugs 테이블을 확인하고 알림\n * BTS-3023: PID 기반 worker ID 사용'
);

// 워커 시작 메시지에 PID 표시
content = content.replace(
  "console.log('║           🔔 버그 알림 워커 (10초마다 체크)                  ║');",
  "console.log(`║  🔔 버그 알림 워커 (PID: ${MY_PID}, ID: ${MY_WORKER_ID})`.padEnd(63) + '║');"
);

// assigned_to 표시 시 본인 여부 표시
content = content.replace(
  "if (bug.assigned_to) {\n              console.log(`   👤 담당: ${bug.assigned_to}`);",
  "if (bug.assigned_to) {\n              const myMark = isMyBug(bug.assigned_to) ? ' (나)' : '';\n              console.log(`   👤 담당: ${bug.assigned_to}${myMark}`);"
);

// 파일 저장
fs.writeFileSync(targetPath, content, 'utf-8');
console.log('notification-worker.cjs updated with PID-based worker ID');
console.log('Added: MY_PID, MY_WORKER_ID, isMyBug()');
