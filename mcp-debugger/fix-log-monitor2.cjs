const fs = require('fs');

const filePath = 'C:/Users/oldmoon/workspace/automation/log-monitor.js';
let content = fs.readFileSync(filePath, 'utf-8');

// checkFailedTasksWithoutBugs 함수의 버그 등록 부분 수정
const oldCode = `      // 버그 등록
      const bugId = \`BUG-\${Date.now()}\`;
      const title = \`[\${task.type}] \${task.title || taskId} 실패\`;
      const summary = \`Task: \${taskId}
Type: \${task.type}
Format: \${task.prompt_format || 'N/A'}
Error: \${errorMsg}
Time: \${task.updated_at}

--- Log Content (최근 2000자) ---
\${logContent.slice(-2000)}\`;

      await conn.execute(\`
        INSERT INTO bugs (
          id, title, summary, status, log_path,
          created_at, updated_at, assigned_to, metadata
        ) VALUES (?, ?, ?, ?, ?, NOW(), NOW(), ?, ?)
      \`, [
        bugId,
        title,
        summary.substring(0, 4000),
        'open',
        logPath || null,
        'auto',
        JSON.stringify({
          type: 'task-failed',
          source: 'log-monitor',
          task_id: taskId,
          task_type: task.type,
          error: errorMsg
        })
      ]);

      console.log(\`✅ 버그 등록: \${bugId} - \${title}\`);`;

const newCode = `      // 버그 등록 (AUTO_INCREMENT 사용)
      const title = \`[\${task.type}] \${task.title || taskId} 실패\`;
      const summary = \`Task: \${taskId}
Type: \${task.type}
Format: \${task.prompt_format || 'N/A'}
Error: \${errorMsg}
Time: \${task.updated_at}

--- Log Content (최근 2000자) ---
\${logContent.slice(-2000)}\`;

      const [result] = await conn.execute(\`
        INSERT INTO bugs (
          title, summary, status, log_path,
          created_at, updated_at, assigned_to, metadata
        ) VALUES (?, ?, ?, ?, NOW(), NOW(), ?, ?)
      \`, [
        title,
        summary.substring(0, 4000),
        'open',
        logPath || null,
        'auto',
        JSON.stringify({
          type: 'task-failed',
          source: 'log-monitor',
          task_id: taskId,
          task_type: task.type,
          error: errorMsg
        })
      ]);

      const bugId = formatBugId(result.insertId);
      console.log(\`✅ 버그 등록: \${bugId} - \${title}\`);`;

if (content.includes(oldCode)) {
  content = content.replace(oldCode, newCode);
  fs.writeFileSync(filePath, content);
  console.log('checkFailedTasksWithoutBugs 함수 수정 완료');
} else {
  console.log('수정할 코드를 찾지 못했습니다.');
  console.log('BUG-Date.now 검색 결과:', content.includes('BUG-${Date.now()}'));
}
