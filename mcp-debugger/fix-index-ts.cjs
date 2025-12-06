const fs = require('fs');

const filePath = 'C:/Users/oldmoon/workspace/mcp-debugger/src/index.ts';
let content = fs.readFileSync(filePath, 'utf-8');

// bug_sequence 사용하는 부분을 AUTO_INCREMENT로 변경
const oldCode = `            for (const task of unregisteredBugs) {
              // bug_sequence에서 시퀀스 ID 생성 (BTS-0000XXX 형식)
              await conn.execute(\`UPDATE bug_sequence SET next_number = next_number + 1 WHERE id = 1\`);
              const [seqRows] = await conn.execute(\`SELECT next_number FROM bug_sequence WHERE id = 1\`) as any;
              const nextNum = seqRows?.[0]?.next_number;
              if (!nextNum) {
                output += \`❌ bug_sequence에서 ID 생성 실패\\n\`;
                continue;
              }
              const bugId = \`BTS-\${String(nextNum).padStart(7, '0')}\`;

              const title = \`[\${task.type}] \${task.title || task.task_id} 실패\`;
              const summary = \`Task: \${task.task_id}\\nType: \${task.type}\\nError: \${task.error || 'Unknown'}\\nTime: \${task.updated_at}\`;

              await conn.execute(\`
                INSERT INTO bugs (id, title, summary, status, created_at, updated_at, assigned_to, metadata)
                VALUES (?, ?, ?, 'open', NOW(), NOW(), 'auto', ?)
              \`, [
                bugId,
                title,
                summary.substring(0, 4000),
                JSON.stringify({ type: 'task-failed', task_id: task.task_id, task_type: task.type })
              ]);

              output += \`✅ \${bugId}: \${title}\\n\`;
            }`;

const newCode = `            for (const task of unregisteredBugs) {
              const title = \`[\${task.type}] \${task.title || task.task_id} 실패\`;
              const summary = \`Task: \${task.task_id}\\nType: \${task.type}\\nError: \${task.error || 'Unknown'}\\nTime: \${task.updated_at}\`;

              // AUTO_INCREMENT 사용 (id 컬럼 생략)
              const [result] = await conn.execute(\`
                INSERT INTO bugs (title, summary, status, created_at, updated_at, assigned_to, metadata)
                VALUES (?, ?, 'open', NOW(), NOW(), 'auto', ?)
              \`, [
                title,
                summary.substring(0, 4000),
                JSON.stringify({ type: 'task-failed', task_id: task.task_id, task_type: task.type })
              ]) as any;

              const bugId = \`BTS-\${String(result.insertId).padStart(7, '0')}\`;
              output += \`✅ \${bugId}: \${title}\\n\`;
            }`;

if (content.includes(oldCode)) {
  content = content.replace(oldCode, newCode);
  fs.writeFileSync(filePath, content);
  console.log('index.ts 수정 완료');
} else {
  console.log('수정할 코드를 찾지 못했습니다.');
  console.log('bug_sequence 검색:', content.includes('bug_sequence'));
}
