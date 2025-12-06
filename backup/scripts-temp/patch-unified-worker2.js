const fs = require('fs');
const path = 'C:/Users/oldmoon/workspace/trend-video-frontend/src/workers/unified-worker.js';

let content = fs.readFileSync(path, 'utf-8');
const lines = content.split('\n');

// Find line 408 (0-indexed: 407) and insert new code after line 408
const insertionPoint = 408; // After "console.log(`${emoji} [${type}] Processing: ${taskId}`);"

// Check if already patched
if (content.includes('BTS-0001202')) {
  console.log('✅ Already patched with BTS-0001202');
  process.exit(0);
}

// Find the line index (0-based)
let targetLine = -1;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('console.log(`${emoji} [${type}] Processing: ${taskId}`);') &&
      !lines[i].includes('\\n')) {
    targetLine = i;
    console.log(`Found target line at ${i + 1}: ${lines[i].trim().substring(0, 60)}`);
    break;
  }
}

if (targetLine === -1) {
  console.log('❌ Target line not found');
  process.exit(1);
}

// Check if next line is "if (type === 'script')"
if (!lines[targetLine + 2].trim().startsWith("if (type === 'script')")) {
  console.log(`❌ Expected 'if (type === script)' but found: ${lines[targetLine + 2]}`);
  process.exit(1);
}

const newCode = `
    // ✅ BTS-0001202: script/image도 task_lock 사용 (video/youtube와 동일하게)
    if (type === 'script' || type === 'image') {
      console.log(\`\${emoji} [\${type}] 🔒 task_lock 테이블 락 획득 시도: \${taskId}\`);

      // 1. task_lock 테이블에서 락 획득 시도
      const lockResult = await run(\`
        UPDATE task_lock
        SET lock_task_id = ?, locked_at = NOW(), worker_pid = ?
        WHERE task_type = ? AND lock_task_id IS NULL
      \`, [taskId, process.pid, type]);

      if (lockResult.affectedRows === 0) {
        // 락 획득 실패 - 다른 Worker가 이미 락을 획득했거나 좀비 락
        const currentLock = await getOne(\`
          SELECT lock_task_id, locked_at, worker_pid,
                 TIMESTAMPDIFF(MINUTE, locked_at, NOW()) as minutes_elapsed
          FROM task_lock
          WHERE task_type = ?
        \`, [type]);

        if (!currentLock || !currentLock.lock_task_id) {
          console.error(\`\${emoji} [\${type}] ❌ 락 획득 실패: lock_task_id가 NULL (race condition)\`);
          throw new Error('락 획득 실패: 다른 Worker가 동시에 락을 획득함');
        }

        // 좀비 락 감지: script 10분, image 30분 이상이면 강제 해제
        const timeout = type === 'script' ? 10 : 30;
        if (currentLock.minutes_elapsed > timeout) {
          console.warn(\`\${emoji} [\${type}] ⚠️ 좀비 락 감지 (\${currentLock.minutes_elapsed}분 경과, task=\${currentLock.lock_task_id}) - 강제 해제\`);

          await run(\`
            UPDATE task_lock
            SET lock_task_id = ?, locked_at = NOW(), worker_pid = ?
            WHERE task_type = ?
          \`, [taskId, process.pid, type]);

          console.log(\`\${emoji} [\${type}] ✅ 좀비 락 강제 해제 후 재획득 성공\`);
        } else {
          console.error(\`\${emoji} [\${type}] ❌ 락 획득 실패: 다른 작업 처리 중 (task=\${currentLock.lock_task_id}, 경과 시간: \${currentLock.minutes_elapsed?.toFixed(1) || 0}분)\`);
          throw new Error(\`락 획득 실패: 다른 작업(\${currentLock.lock_task_id})이 처리 중입니다\`);
        }
      }

      console.log(\`\${emoji} [\${type}] ✅ task_lock 락 획득 성공: \${taskId}\`);
    }
`;

// Insert after targetLine + 1 (empty line)
lines.splice(targetLine + 2, 0, newCode);

fs.writeFileSync(path, lines.join('\n'));
console.log('✅ Part 1 patched: script/image task_lock acquire (line ' + (targetLine + 1) + ')');
