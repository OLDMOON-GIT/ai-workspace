const fs = require('fs');
const path = 'C:/Users/oldmoon/workspace/trend-video-frontend/src/workers/unified-worker.js';

let content = fs.readFileSync(path, 'utf-8');

// Part 2: Add lock release after script API call completed
const scriptOld = `      console.log(\`\${emoji} [\${type}] ✅ API call completed\`);

    } else if (type === 'image') {`;

const scriptNew = `      console.log(\`\${emoji} [\${type}] ✅ API call completed\`);

      // ✅ BTS-0001202: script 완료 후 task_lock 해제
      await run(\`
        UPDATE task_lock
        SET lock_task_id = NULL, locked_at = NULL, worker_pid = NULL
        WHERE task_type = 'script' AND lock_task_id = ?
      \`, [taskId]);
      console.log(\`\${emoji} [\${type}] 🔓 task_lock 해제: \${taskId}\`);

    } else if (type === 'image') {`;

if (content.includes(scriptOld)) {
  content = content.replace(scriptOld, scriptNew);
  console.log('✅ Part 2 patched: script lock release after completion');
} else if (content.includes('BTS-0001202: script 완료')) {
  console.log('✅ Part 2 already patched');
} else {
  console.log('❌ Part 2 pattern not found');
}

// Part 3: Add lock release for image inside the Promise resolve/reject
// Find the image promise resolve section
const imageOldResolve = `          if (code === 0) {
            const successMsg = '✅ 이미지 생성 완료';
            console.log(\`\${emoji} [\${type}] \${successMsg}\`);
            await this.appendLog(taskId, type, successMsg).catch(() => {});
            resolve();`;

const imageNewResolve = `          if (code === 0) {
            const successMsg = '✅ 이미지 생성 완료';
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

if (content.includes(imageOldResolve)) {
  content = content.replace(imageOldResolve, imageNewResolve);
  console.log('✅ Part 3 patched: image lock release on success');
} else if (content.includes('BTS-0001202: image 완료')) {
  console.log('✅ Part 3 already patched');
} else {
  console.log('❌ Part 3 pattern not found');
}

// Part 4: Add lock release for image on error (reject)
const imageOldReject = `          } else {
            reject(new Error(\`Python script exited with code \${code}\\n\${errorOutput}\`));
          }
        });

        pythonProcess.on('error', (error) => reject(new Error(\`Failed to start: \${error.message}\`)));
      });

    } else if (type === 'video') {`;

const imageNewReject = `          } else {
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
        });
      });

    } else if (type === 'video') {`;

if (content.includes(imageOldReject)) {
  content = content.replace(imageOldReject, imageNewReject);
  console.log('✅ Part 4 patched: image lock release on error');
} else if (content.includes('BTS-0001202: image 실패')) {
  console.log('✅ Part 4 already patched');
} else {
  console.log('❌ Part 4 pattern not found');
}

fs.writeFileSync(path, content);
console.log('✅ All patches applied');
