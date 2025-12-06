#!/usr/bin/env node
/**
 * BTS-3023: bug-db.js에 PID 기반 헬퍼 함수 추가
 */
const fs = require('fs');
const path = require('path');

const targetPath = path.join(__dirname, '..', 'automation', 'bug-db.js');

// 현재 파일 읽기
let content = fs.readFileSync(targetPath, 'utf-8');

// BOM 제거
content = content.replace(/^\uFEFF/, '');

// 이미 getWorkerIdByPid가 있는지 확인
if (content.includes('getWorkerIdByPid')) {
  console.log('getWorkerIdByPid already exists in bug-db.js');
  process.exit(0);
}

// PID 헬퍼 함수 추가 (now() 함수 다음에)
const pidHelpers = `
// BTS-3023: PID 기반 worker ID 생성
function getWorkerIdByPid(pid) {
  const usePid = pid || process.pid;
  return \`worker-\${usePid}\`;
}

// BTS-3023: assigned_to가 자기 PID인지 확인
function isMyWorker(assignedTo, myPid) {
  if (!assignedTo) return false;
  const pid = myPid || process.pid;
  return assignedTo === \`worker-\${pid}\`;
}
`;

// now() 함수 뒤에 추가
content = content.replace(
  /function now\(\) \{\s*return new Date\(\)\.toISOString\(\);\s*\}/,
  `function now() {
  return new Date().toISOString();
}
${pidHelpers}`
);

// module.exports에 새 함수 추가
content = content.replace(
  /module\.exports = \{([^}]+)\};/,
  (match, exportList) => {
    if (!exportList.includes('getWorkerIdByPid')) {
      const newExports = exportList.trim().replace(/,?\s*$/, '') + ',\n  getWorkerIdByPid,\n  isMyWorker';
      return `module.exports = {${newExports}\n};`;
    }
    return match;
  }
);

// 파일 저장
fs.writeFileSync(targetPath, content, 'utf-8');
console.log('bug-db.js updated with PID helpers');
console.log('Added: getWorkerIdByPid(), isMyWorker()');
