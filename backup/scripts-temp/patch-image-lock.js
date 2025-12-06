const fs = require('fs');
const path = 'C:/Users/oldmoon/workspace/trend-video-frontend/src/workers/unified-worker.js';

let content = fs.readFileSync(path, 'utf-8');
let patched = 0;

// Part 3: image 성공 시 lock 해제
if (!content.includes('BTS-0001202: image 완료')) {
  const imageSuccessOld = `          if (code === 0) {
            const successMsg = '✅ 이미지 생성 완료';
            console.log(\`\${emoji} [\${type}] \${successMsg}\`);
            await this.appendLog(taskId, type, successMsg).catch(() => {});
            resolve();
          } else {
            reject(new Error(\`Python script exited with code \${code}\\n\${errorOutput}\`));
          }
        });

        pythonProcess.on('error', (error) => reject(new Error(\`Failed to start: \${error.message}\`)));
      });

    } else if (type === 'video') {`;

  const imageSuccessNew = `          if (code === 0) {
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
            resolve();
          } else {
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

  if (content.includes(imageSuccessOld)) {
    content = content.replace(imageSuccessOld, imageSuccessNew);
    console.log('✅ image lock release patched (success/fail/error)');
    patched++;
    fs.writeFileSync(path, content);
  } else {
    console.log('❌ image pattern not found');
    // Debug: 해당 부분 찾아보기
    if (content.includes('이미지 생성 완료')) {
      const idx = content.indexOf('이미지 생성 완료');
      console.log('Found at index:', idx);
      console.log('Surrounding text:', content.substring(idx - 200, idx + 200));
    }
  }
} else {
  console.log('✅ Already patched');
}

console.log(`Total: ${patched} patches applied`);
