const fs = require('fs');
const path = require('path');

const schedulerPath = path.join(__dirname, '..', 'src', 'lib', 'automation-scheduler.ts');
let content = fs.readFileSync(schedulerPath, 'utf-8');

// 현재 패턴 찾기
const patterns = [
  /const imageWorkerPath = .+;/,
];

// 새로운 코드 - 완전 동적으로 경로 생성
const newCode = `const workerName = String.fromCharCode(115,116,97,114,116,45,105,109,97,103,101,45,119,111,114,107,101,114,46,106,115);
        const imageWorkerPath = path.join(process.cwd(), workerName);`;

for (const pattern of patterns) {
  if (pattern.test(content)) {
    content = content.replace(pattern, newCode);
    console.log('✅ Worker path 수정 완료');
    break;
  }
}

fs.writeFileSync(schedulerPath, content, 'utf-8');
