const fs = require('fs');
const path = 'C:/Users/oldmoon/workspace/trend-video-frontend/src/workers/unified-worker.js';

let content = fs.readFileSync(path, 'utf-8');
let patched = 0;

// === Part 2: script 완료 후 lock 해제 ===
// 첫 번째 "✅ API call completed" 이후 (script 섹션)
const lines = content.split('\n');
let scriptAPILine = -1;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('✅ API call completed') &&
      !lines[i].includes('✅ 영상 생성 완료')) {
    // 첫 번째 발견 (script 섹션)
    scriptAPILine = i;
    break;
  }
}

if (scriptAPILine !== -1 && !content.includes('BTS-0001202: script 완료')) {
  // script API completed 다음 줄 확인
  const nextLines = lines.slice(scriptAPILine + 1, scriptAPILine + 4).join('\n');
  if (nextLines.includes("} else if (type === 'image')")) {
    // 삽입 위치 계산
    const insertCode = `
      // ✅ BTS-0001202: script 완료 후 task_lock 해제
      await run(\`
        UPDATE task_lock
        SET lock_task_id = NULL, locked_at = NULL, worker_pid = NULL
        WHERE task_type = 'script' AND lock_task_id = ?
      \`, [taskId]);
      console.log(\`\${emoji} [\${type}] 🔓 task_lock 해제: \${taskId}\`);
`;
    lines.splice(scriptAPILine + 1, 0, insertCode);
    console.log('✅ Part 2: script lock release patched at line', scriptAPILine + 1);
    patched++;
  }
}

content = lines.join('\n');

// === Part 3: image 성공 시 lock 해제 ===
if (!content.includes('BTS-0001202: image 완료')) {
  const imageSuccessOld = `            const successMsg = '✅ 이미지 생성 완료';
            console.log(\`\${emoji} [\${type}] \${successMsg}\`);
            await this.appendLog(taskId, type, successMsg).catch(() => {});
            resolve();`;

  const imageSuccessNew = `            const successMsg = '✅ 이미지 생성 완료';
            console.log(\`\${emoji} [\${type}] \${successMsg}\`);
            await this.appendLog(taskId, type, successMsg).catch(() => {});
            // ✅ BTS-0001202: image 완료 후 task_lock 해제
            await run(\`
              UPDATE task_lock
              SET lock_task_id = NULL, locked_at = NULL, worker_pid = NULL
              WHERE task_type = 'image' AND lock_task_id = ?
            \`, [taskId]);
            console.log(\`\${emoji} [\${type}] 🔓 task_lock 해제: \${taskId}\`);
            resolve();`;

  if (content.includes(imageSuccessOld)) {
    content = content.replace(imageSuccessOld, imageSuccessNew);
    console.log('✅ Part 3: image success lock release patched');
    patched++;
  } else {
    console.log('⚠️ Part 3: image success pattern not found');
  }
}

// === Part 4: image 실패 시 lock 해제 ===
if (!content.includes('BTS-0001202: image 실패')) {
  const imageFailOld = `          } else {
            reject(new Error(\`Python script exited with code \${code}\\n\${errorOutput}\`));
          }
        });

        pythonProcess.on('error', (error) => reject(new Error(\`Failed to start: \${error.message}\`)));`;

  const imageFailNew = `          } else {
            // ✅ BTS-0001202: image 실패 시에도 task_lock 해제
            await run(\`
              UPDATE task_lock
              SET lock_task_id = NULL, locked_at = NULL, worker_pid = NULL
              WHERE task_type = 'image' AND lock_task_id = ?
            \`, [taskId]);
            console.log(\`\${emoji} [\${type}] 🔓 task_lock 해제 (실패): \${taskId}\`);
            reject(new Error(\`Python script exited with code \${code}\\n\${errorOutput}\`));
          }
        });

        pythonProcess.on('error', async (error) => {
          // ✅ BTS-0001202: image spawn 에러 시에도 task_lock 해제
          await run(\`
            UPDATE task_lock
            SET lock_task_id = NULL, locked_at = NULL, worker_pid = NULL
            WHERE task_type = 'image' AND lock_task_id = ?
          \`, [taskId]);
          console.log(\`\${emoji} [\${type}] 🔓 task_lock 해제 (에러): \${taskId}\`);
          reject(new Error(\`Failed to start: \${error.message}\`));
        });`;

  if (content.includes(imageFailOld)) {
    content = content.replace(imageFailOld, imageFailNew);
    console.log('✅ Part 4: image error lock release patched');
    patched++;
  } else {
    console.log('⚠️ Part 4: image error pattern not found');
  }
}

fs.writeFileSync(path, content);
console.log(`\n총 ${patched}개 패치 적용 완료`);
