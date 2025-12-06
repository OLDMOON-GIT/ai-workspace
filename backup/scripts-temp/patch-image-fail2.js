const fs = require('fs');
const path = 'C:/Users/oldmoon/workspace/trend-video-frontend/src/workers/unified-worker.js';

let content = fs.readFileSync(path, 'utf-8');
let lines = content.split('\n');

// Already patched?
if (content.includes('BTS-0001202: image 실패')) {
  console.log('✅ Already patched (image fail)');
  process.exit(0);
}

// Find the reject line after image success
let rejectLine = -1;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('reject(new Error(`Python script exited with code ${code}') &&
      lines[i-1] && lines[i-1].includes('} else {')) {
    // Check if this is in the image section (before "video" section)
    const before = lines.slice(Math.max(0, i-30), i).join('\n');
    if (before.includes('이미지 생성 완료') && before.includes('task_lock 해제')) {
      rejectLine = i;
      console.log(`Found image reject at line ${i + 1}`);
      break;
    }
  }
}

if (rejectLine === -1) {
  console.log('❌ reject line not found');
  process.exit(1);
}

// Insert lock release BEFORE reject()
const indent = '            ';
const lockReleaseFail = `${indent}// ✅ BTS-0001202: image 실패 시에도 task_lock 해제
${indent}await run(\`
${indent}  UPDATE task_lock
${indent}  SET lock_task_id = NULL, locked_at = NULL, worker_pid = NULL
${indent}  WHERE task_type = 'image' AND lock_task_id = ?
${indent}\`, [taskId]);
${indent}console.log(\`\${emoji} [\${type}] 🔓 task_lock 해제 (실패): \${taskId}\`);`;

lines.splice(rejectLine, 0, lockReleaseFail);
console.log('✅ Inserted fail lock release before reject');

// Find error handler
let errorLine = -1;
for (let i = rejectLine + 8; i < rejectLine + 20 && i < lines.length; i++) {
  if (lines[i].includes("pythonProcess.on('error'")) {
    errorLine = i;
    console.log(`Found error handler at line ${i + 1}`);
    break;
  }
}

if (errorLine !== -1) {
  // Replace the error handler line with async version and lock release
  const oldErrorHandler = lines[errorLine];
  const newErrorHandler = `        pythonProcess.on('error', async (error) => {
          // ✅ BTS-0001202: image spawn 에러 시에도 task_lock 해제
          await run(\`
            UPDATE task_lock
            SET lock_task_id = NULL, locked_at = NULL, worker_pid = NULL
            WHERE task_type = 'image' AND lock_task_id = ?
          \`, [taskId]);
          console.log(\`\${emoji} [\${type}] 🔓 task_lock 해제 (에러): \${taskId}\`);
          reject(new Error(\`Failed to start: \${error.message}\`));
        });`;

  lines[errorLine] = newErrorHandler;
  console.log('✅ Modified error handler to async with lock release');
}

fs.writeFileSync(path, lines.join('\n'));
console.log('✅ All image fail/error patches applied');
