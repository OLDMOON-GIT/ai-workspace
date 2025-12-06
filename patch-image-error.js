const fs = require('fs');
const path = 'C:/Users/oldmoon/workspace/trend-video-frontend/src/workers/unified-worker.js';

let content = fs.readFileSync(path, 'utf-8');

// Already has fail/error patches?
if (content.includes('BTS-0001202: image 실패')) {
  console.log('✅ Already patched');
  process.exit(0);
}

// Patch reject part
const rejectOld = `          } else {
            reject(new Error(\`Python script exited with code \${code}\\n\${errorOutput}\`));
          }
        });

        pythonProcess.on('error', (error) => reject(new Error(\`Failed to start: \${error.message}\`)));
      });

    } else if (type === 'video') {`;

const rejectNew = `          } else {
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

if (content.includes(rejectOld)) {
  content = content.replace(rejectOld, rejectNew);
  fs.writeFileSync(path, content);
  console.log('✅ Image error/fail lock release patched');
} else {
  console.log('❌ Pattern not found');
  // Debug
  const idx = content.indexOf('Python script exited with code');
  if (idx !== -1) {
    console.log('Found at:', idx);
    console.log(content.substring(idx - 100, idx + 300));
  }
}
