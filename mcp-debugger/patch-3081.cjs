const fs = require('fs');
const path = require('path');

const filePath = 'src/spawning-pool.ts';
let content = fs.readFileSync(filePath, 'utf8');

// 1. Add cleanupOrphanedBugs function before spawningPool function
const newFunction = `
// BTS-3081: 시작 시 및 매 루프마다 죽은 워커의 in_progress 버그를 open으로 롤백
async function cleanupOrphanedBugs(): Promise<number> {
  let connection;
  let cleaned = 0;
  try {
    connection = await mysql.createConnection(dbConfig);

    // in_progress 상태이고 worker_pid가 있는 버그 조회
    const [rows] = await connection.execute(\`
      SELECT id, worker_pid, assigned_to, title
      FROM bugs
      WHERE status = 'in_progress' AND worker_pid IS NOT NULL
    \`);
    const bugs = rows as any[];

    for (const bug of bugs) {
      // 해당 PID가 죽었으면 롤백
      if (!isProcessRunning(bug.worker_pid)) {
        console.log(\`  [BTS-3081] Orphaned bug #\${bug.id} (PID \${bug.worker_pid} dead) -> open\`);
        await connection.execute(\`
          UPDATE bugs
          SET status = 'open', worker_pid = NULL, assigned_to = NULL, updated_at = NOW()
          WHERE id = ? AND status = 'in_progress'
        \`, [bug.id]);
        cleaned++;
      }
    }

    return cleaned;
  } finally {
    if (connection) await connection.end();
  }
}

`;

// Insert before spawningPool function
content = content.replace(
  'async function spawningPool()',
  newFunction + 'async function spawningPool()'
);

// 2. Update spawningPool banner to include BTS-3081
content = content.replace(
  "console.log('           BTS-3044: Fixed rollback for completed tasks');",
  "console.log('           BTS-3044: Fixed rollback for completed tasks');\n  console.log('           BTS-3081: Startup orphan cleanup');"
);

// 3. Add startup orphan cleanup call after banner
content = content.replace(
  "console.log('  Press Ctrl+C to exit');",
  `console.log('');

  // BTS-3081: 시작 시 orphaned 버그 정리
  const orphanCount = await cleanupOrphanedBugs();
  if (orphanCount > 0) {
    console.log(\`  [BTS-3081] Cleaned up \${orphanCount} orphaned bug(s) at startup\`);
  }
  console.log('');

  console.log('  Press Ctrl+C to exit');`
);

// 4. Add loop orphan cleanup call (find the cleanupDeadWorkers call in the loop)
// This is tricky due to encoding issues, let's find a safer marker
const loopMarker = 'await cleanupDeadWorkers();';
if (content.includes(loopMarker)) {
  content = content.replace(
    loopMarker,
    '// BTS-3081: 매 루프마다 orphaned 버그 정리\n      await cleanupOrphanedBugs();\n      ' + loopMarker
  );
}

fs.writeFileSync(filePath, content, 'utf8');
console.log('Patch applied successfully');

// Verify
const newContent = fs.readFileSync(filePath, 'utf8');
console.log('cleanupOrphanedBugs found:', newContent.includes('cleanupOrphanedBugs'));
