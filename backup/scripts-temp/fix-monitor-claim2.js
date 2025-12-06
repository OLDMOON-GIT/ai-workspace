const fs = require('fs');
const filePath = 'C:/Users/oldmoon/workspace/mcp-debugger/src/monitor.ts';
let content = fs.readFileSync(filePath, 'utf8');

// 1. Add bug claim after updateErrorStatus
const oldCode1 = `  // 상태 선반영 (processing)
  updateErrorStatus(error.id, 'processing', workerId);

  // 상세 에러 정보 출력`;

const newCode1 = `  // 상태 선반영 (processing)
  updateErrorStatus(error.id, 'processing', workerId);

  // MySQL bugs 테이블에서도 in_progress로 마킹 (BTS-2339)
  bugClaim(workerId).catch(err => {
    console.log(\`  [!] MySQL bug claim 실패 (무시): \${err.message}\`);
  });

  // 상세 에러 정보 출력`;

if (content.includes(oldCode1)) {
  content = content.replace(oldCode1, newCode1);
  console.log('1. Bug claim added after updateErrorStatus');
} else {
  console.log('1. Pattern not found');
}

// 2. Update error handler to restore status on failure
const oldCode2 = `    proc.on('error', (err) => {
      console.error(\`  [!] 워커 스폰 실패: \${workerId} (\${workerCfg.name})\`, err);
      workerProcesses.delete(workerId);
      workerMeta.delete(workerId);
    });`;

const newCode2 = `    proc.on('error', (err) => {
      console.error(\`  [!] 워커 스폰 실패: \${workerId} (\${workerCfg.name})\`, err);
      workerProcesses.delete(workerId);
      workerMeta.delete(workerId);
      // 실패 시 에러 상태 복원 (BTS-2339)
      updateErrorStatus(error.id, 'pending', null);
      bugUpdate(btsId, workerId, 'open', '워커 스폰 실패로 재오픈').catch(() => {});
    });`;

if (content.includes(oldCode2)) {
  content = content.replace(oldCode2, newCode2);
  console.log('2. Error handler updated');
} else {
  console.log('2. Error handler pattern not found');
}

fs.writeFileSync(filePath, content, 'utf8');
console.log('Done!');
