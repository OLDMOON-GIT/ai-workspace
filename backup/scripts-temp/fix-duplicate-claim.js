const fs = require('fs');
const filePath = 'C:/Users/oldmoon/workspace/mcp-debugger/src/monitor.ts';
let content = fs.readFileSync(filePath, 'utf8');

// Normalize line endings
content = content.replace(/\r\n/g, '\n');

// 1. Change spawnWorker to async function
const oldFnStart = 'function spawnWorker(): string {';
const newFnStart = 'async function spawnWorker(): Promise<string> {';

if (content.includes(oldFnStart)) {
  content = content.replace(oldFnStart, newFnStart);
  console.log('1. spawnWorker changed to async');
} else {
  console.log('1. spawnWorker already async or not found');
}

// 2. Change bugClaim to await and add error handling
const oldBugClaim = `  // MySQL bugs 테이블에서도 in_progress로 마킹 (BTS-2339)
  bugClaim(workerId).catch(err => {
    console.log(\`  [!] MySQL bug claim 실패 (무시): \${err.message}\`);
  });`;

const newBugClaim = `  // MySQL bugs 테이블에서도 in_progress로 마킹 (BTS-2339, BTS-2346)
  // await로 동기 처리하여 중복 할당 방지
  try {
    const claimedBug = await bugClaim(workerId);
    if (claimedBug) {
      console.log(\`  [✓] MySQL bug claimed: \${claimedBug.id}\`);
    }
  } catch (err: any) {
    console.log(\`  [!] MySQL bug claim 실패 (무시): \${err.message}\`);
  }`;

if (content.includes(oldBugClaim)) {
  content = content.replace(oldBugClaim, newBugClaim);
  console.log('2. bugClaim changed to await');
} else {
  console.log('2. bugClaim pattern not found');
}

// 3. Update scaleWorkers to handle async spawnWorker
const oldScaleCall = `      const id = spawnWorker();
      console.log(\`  [+] 워커 추가: \${id} (대기 에러: \${pending}개, 현재 워커: \${workerMeta.size}/\${MAX_WORKERS})\`);`;

const newScaleCall = `      spawnWorker().then(id => {
        console.log(\`  [+] 워커 추가: \${id} (대기 에러: \${pending}개, 현재 워커: \${workerMeta.size}/\${MAX_WORKERS})\`);
      });`;

if (content.includes(oldScaleCall)) {
  content = content.replace(oldScaleCall, newScaleCall);
  console.log('3. scaleWorkers call updated');
} else {
  console.log('3. scaleWorkers call pattern not found');
}

// Convert back to CRLF
content = content.replace(/\n/g, '\r\n');
fs.writeFileSync(filePath, content, 'utf8');
console.log('Done!');
