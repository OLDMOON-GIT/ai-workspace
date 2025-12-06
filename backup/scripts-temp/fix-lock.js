const fs = require('fs');
const filePath = 'C:/Users/oldmoon/workspace/trend-video-frontend/src/workers/unified-worker.js';
let content = fs.readFileSync(filePath, 'utf-8');

// BTS-0001202: finally 블록에서 lock_task_id만 초기화하는 것을 전체 락 해제로 변경
const oldPattern = /\/\/ lock_task_id 초기화 \(task 처리 완료\)\s+try \{\s+await run\(`\s+UPDATE task_lock\s+SET lock_task_id = NULL\s+WHERE task_type = \? AND worker_pid = \?\s+`, \[type, process\.pid\]\);\s+\} catch \(e\) \{\s+console\.error\(`⚠️ \[LOCK\] Failed to clear lock_task_id:`, e\.message\);\s+\}/;

const newCode = `// ⭐ BTS-0001202: 작업 완료 후 전체 락 해제
          try {
            await releaseLock(type, this.workerId);
            workerState.hasLock = false;
          } catch (e) {
            console.error(\`⚠️ [LOCK] Failed to release lock:\`, e.message);
          }`;

if (content.includes('lock_task_id 초기화')) {
  content = content.replace(oldPattern, newCode);
  fs.writeFileSync(filePath, content, 'utf-8');
  console.log('Fixed: finally block now releases full lock');
} else if (content.includes('BTS-0001202: 작업 완료')) {
  console.log('Already fixed');
} else {
  console.log('Pattern not found - checking content...');
  console.log(content.includes('lock_task_id'));
}
