const fs = require('fs');
const path = 'C:/Users/oldmoon/workspace/mcp-debugger/src/monitor.ts';
let content = fs.readFileSync(path, 'utf8');

// scaleWorkers 함수 전체를 찾아서 교체
const scaleWorkersRegex = /function scaleWorkers\(\) \{[\s\S]*?^\}/m;

const newScaleWorkers = `function scaleWorkers() {
  const stats = getErrorStats();
  const pending = stats.pending;
  // workerMeta.size 사용 (cmd.exe /c start로 실행된 프로세스는 즉시 종료되므로 workerProcesses.size는 부정확)
  const currentWorkers = workerMeta.size;

  // 필요한 워커 수 계산 (에러 1개당 워커 1개, 최대 MAX_WORKERS개)
  const needed = Math.min(pending, MAX_WORKERS);

  // 이미 최대치에 도달했으면 추가하지 않음
  if (currentWorkers >= MAX_WORKERS) {
    return;
  }

  if (needed > currentWorkers) {
    // 워커 추가 (한 번에 1개씩만 추가하여 과다 생성 방지)
    const toAdd = Math.min(needed - currentWorkers, 1);
    for (let i = 0; i < toAdd; i++) {
      // 추가 전 다시 한번 체크
      if (workerMeta.size >= MAX_WORKERS) {
        console.log(\`  [!] 워커 한도(\${MAX_WORKERS}개) 도달 - 스킵\`);
        break;
      }
      const id = spawnWorker();
      console.log(\`  [+] 워커 추가: \${id} (대기 에러: \${pending}개, 현재 워커: \${workerMeta.size}/\${MAX_WORKERS})\`);
    }
  } else if (needed < currentWorkers && pending === 0) {
    // 에러가 없으면 워커 축소
    const toRemove = currentWorkers - needed;
    const workerIds = Array.from(workerProcesses.keys());
    for (let i = 0; i < toRemove; i++) {
      const id = workerIds[i];
      killWorker(id);
      workerMeta.delete(id); // workerMeta도 함께 삭제
      console.log(\`  [-] 워커 제거: \${id}\`);
    }
  }
}`;

if (scaleWorkersRegex.test(content)) {
  content = content.replace(scaleWorkersRegex, newScaleWorkers);
  fs.writeFileSync(path, content, 'utf8');
  console.log('SUCCESS: scaleWorkers function updated');
} else {
  console.log('FAILED: scaleWorkers function not found');
}
