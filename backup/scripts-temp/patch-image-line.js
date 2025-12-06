const fs = require('fs');
const path = 'C:/Users/oldmoon/workspace/trend-video-frontend/src/workers/unified-worker.js';

let content = fs.readFileSync(path, 'utf-8');
let lines = content.split('\n');

// Find line with "이미지 생성 완료"
let targetLine = -1;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('이미지 생성 완료')) {
    targetLine = i;
    console.log(`Found "이미지 생성 완료" at line ${i + 1}`);
    break;
  }
}

if (targetLine === -1) {
  console.log('❌ Target line not found');
  process.exit(1);
}

// Already patched?
if (content.includes('BTS-0001202: image 완료')) {
  console.log('✅ Already patched');
  process.exit(0);
}

// Find resolve(); line after successMsg
let resolveLine = -1;
for (let i = targetLine; i < targetLine + 5; i++) {
  if (lines[i].includes('resolve();')) {
    resolveLine = i;
    console.log(`Found resolve() at line ${i + 1}: "${lines[i].trim()}"`);
    break;
  }
}

if (resolveLine === -1) {
  console.log('❌ resolve() not found');
  process.exit(1);
}

// Insert lock release BEFORE resolve();
const indent = '            ';
const lockReleaseSuccess = `${indent}// ✅ BTS-0001202: image 완료 후 task_lock 해제
${indent}await run(\`
${indent}  UPDATE task_lock
${indent}  SET lock_task_id = NULL, locked_at = NULL, worker_pid = NULL
${indent}  WHERE task_type = 'image' AND lock_task_id = ?
${indent}\`, [taskId]);
${indent}console.log(\`\${emoji} [\${type}] 🔓 task_lock 해제: \${taskId}\`);`;

lines.splice(resolveLine, 0, lockReleaseSuccess);
console.log('✅ Inserted lock release before resolve()');

// Find reject line (Python exit code error)
let rejectLine = -1;
for (let i = resolveLine + 10; i < resolveLine + 20; i++) {
  if (lines[i] && lines[i].includes('reject(new Error(`Python script exited')) {
    rejectLine = i;
    console.log(`Found reject() at line ${i + 1}`);
    break;
  }
}

if (rejectLine !== -1) {
  const lockReleaseFail = `${indent}// ✅ BTS-0001202: image 실패 시에도 task_lock 해제
${indent}await run(\`
${indent}  UPDATE task_lock
${indent}  SET lock_task_id = NULL, locked_at = NULL, worker_pid = NULL
${indent}  WHERE task_type = 'image' AND lock_task_id = ?
${indent}\`, [taskId]);
${indent}console.log(\`\${emoji} [\${type}] 🔓 task_lock 해제 (실패): \${taskId}\`);`;

  lines.splice(rejectLine, 0, lockReleaseFail);
  console.log('✅ Inserted lock release before reject()');
}

// Find pythonProcess.on('error' line
let errorLine = -1;
for (let i = rejectLine + 10; i < rejectLine + 20 && i < lines.length; i++) {
  if (lines[i] && lines[i].includes("pythonProcess.on('error'")) {
    errorLine = i;
    console.log(`Found error handler at line ${i + 1}`);
    break;
  }
}

// Make the error handler async and add lock release
if (errorLine !== -1) {
  // Change (error) => to async (error) =>
  lines[errorLine] = lines[errorLine].replace(
    "(error) => reject",
    "async (error) => {"
  );

  // Add lock release and reject inside the handler
  const errorHandler = `
          // ✅ BTS-0001202: image spawn 에러 시에도 task_lock 해제
          await run(\`
            UPDATE task_lock
            SET lock_task_id = NULL, locked_at = NULL, worker_pid = NULL
            WHERE task_type = 'image' AND lock_task_id = ?
          \`, [taskId]);
          console.log(\`\${emoji} [\${type}] 🔓 task_lock 해제 (에러): \${taskId}\`);
          reject(new Error(\`Failed to start: \${error.message}\`));
        }`;

  // Find the old error handler end and replace
  if (lines[errorLine].includes('Failed to start')) {
    lines[errorLine] = `        pythonProcess.on('error', async (error) => {${errorHandler});`;
    console.log('✅ Modified error handler');
  }
}

fs.writeFileSync(path, lines.join('\n'));
console.log('✅ All image lock patches applied');
