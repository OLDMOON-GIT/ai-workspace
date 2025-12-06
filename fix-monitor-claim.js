const fs = require('fs');
const filePath = 'C:/Users/oldmoon/workspace/mcp-debugger/src/monitor.ts';
let content = fs.readFileSync(filePath, 'utf8');

// 1. Import bugClaim, bugUpdate from bug-bridge.js
const oldImport = "import { bugCreate } from './bug-bridge.js';";
const newImport = "import { bugCreate, bugClaim, bugUpdate } from './bug-bridge.js';";

if (content.includes(oldImport)) {
  content = content.replace(oldImport, newImport);
  console.log('1. Import updated');
} else {
  console.log('1. Import already updated or not found');
}

// 2. Modify spawnWorker to claim MySQL bug first
const oldSpawnStart = `function spawnWorker(): string {
  const workerId = \`auto-worker-\${++workerIdCounter}\`;

  // 에러 정보 가져오기
  const error = claimError(workerId);
  if (!error) return workerId;

  // 상태 선반영 (processing)
  updateErrorStatus(error.id, 'processing', workerId);`;

const newSpawnStart = `function spawnWorker(): string {
  const workerId = \`auto-worker-\${++workerIdCounter}\`;

  // 에러 정보 가져오기
  const error = claimError(workerId);
  if (!error) return workerId;

  // 상태 선반영 (processing)
  updateErrorStatus(error.id, 'processing', workerId);

  // MySQL bugs 테이블에서도 in_progress로 마킹 (BTS-2339)
  const bugId = error.metadata?.bug_id || \`BTS-\${error.id}\`;
  bugClaim(workerId).catch(err => {
    console.log(\`  [!] MySQL bug claim 실패 (무시): \${err.message}\`);
  });`;

if (content.includes(oldSpawnStart)) {
  content = content.replace(oldSpawnStart, newSpawnStart);
  console.log('2. spawnWorker bug claim added');
} else {
  console.log('2. spawnWorker pattern not found - checking alternative');
}

// 3. Add error recovery in proc.on('error')
const oldErrorHandler = `    proc.on('error', (err) => {
      console.error(\`  [!] 워커 스폰 실패: \${workerId} (\${workerCfg.name})\`, err);
      workerProcesses.delete(workerId);
      workerMeta.delete(workerId);
    });`;

const newErrorHandler = `    proc.on('error', (err) => {
      console.error(\`  [!] 워커 스폰 실패: \${workerId} (\${workerCfg.name})\`, err);
      workerProcesses.delete(workerId);
      workerMeta.delete(workerId);
      // 실패 시 에러 상태 복원 (BTS-2339)
      updateErrorStatus(error.id, 'pending', null);
      bugUpdate(bugId, workerId, 'open', '워커 스폰 실패로 재오픈').catch(() => {});
    });`;

if (content.includes(oldErrorHandler)) {
  content = content.replace(oldErrorHandler, newErrorHandler);
  console.log('3. Error handler updated');
} else {
  console.log('3. Error handler pattern not found');
}

fs.writeFileSync(filePath, content, 'utf8');
console.log('Done!');
