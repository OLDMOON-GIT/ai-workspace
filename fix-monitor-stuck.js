const fs = require('fs');

// 1. Add resetStuckErrors function to db.ts
const dbPath = 'C:/Users/oldmoon/workspace/mcp-debugger/src/db.ts';
let dbContent = fs.readFileSync(dbPath, 'utf8');

const resetFn = `
// Stuck processing 에러 복원 (BTS-2341)
// 30분 이상 processing 상태면 pending으로 되돌림
export function resetStuckErrors(timeoutMinutes: number = 30): number {
  const cutoff = new Date(Date.now() - timeoutMinutes * 60 * 1000).toISOString();
  const stmt = db.prepare(\`
    UPDATE error_queue
    SET status = 'pending', claimed_by = NULL, claimed_at = NULL, updated_at = datetime('now')
    WHERE status IN ('processing', 'claimed') AND updated_at < ?
  \`);
  const result = stmt.run(cutoff);
  if (result.changes > 0) {
    console.log(\`[DB] \${result.changes}개 stuck 에러 복원 (>\${timeoutMinutes}분)\`);
  }
  return result.changes;
}
`;

// Insert before export default db;
if (!dbContent.includes('resetStuckErrors')) {
  dbContent = dbContent.replace(
    'export default db;',
    resetFn + '\nexport default db;'
  );
  fs.writeFileSync(dbPath, dbContent, 'utf8');
  console.log('1. db.ts: resetStuckErrors function added');
} else {
  console.log('1. db.ts: resetStuckErrors already exists');
}

// 2. Update monitor.ts to import and call resetStuckErrors
const monitorPath = 'C:/Users/oldmoon/workspace/mcp-debugger/src/monitor.ts';
let monitorContent = fs.readFileSync(monitorPath, 'utf8');

// Add import
const oldImport = `import {
  addError,
  addLogSource,
  getLogSources,
  updateLogPosition,
  getActiveWorkers,
  getErrorStats,
  getPendingErrors,
  claimError,
  updateErrorStatus
} from './db.js';`;

const newImport = `import {
  addError,
  addLogSource,
  getLogSources,
  updateLogPosition,
  getActiveWorkers,
  getErrorStats,
  getPendingErrors,
  claimError,
  updateErrorStatus,
  resetStuckErrors
} from './db.js';`;

if (monitorContent.includes(oldImport)) {
  monitorContent = monitorContent.replace(oldImport, newImport);
  console.log('2. monitor.ts: import updated');
} else {
  console.log('2. monitor.ts: import pattern not found');
}

// Add resetStuckErrors call in scaleWorkers
const oldScale = `function scaleWorkers() {
  const stats = getErrorStats();`;

const newScale = `function scaleWorkers() {
  // Stuck 에러 복원 (30분 이상 processing 상태) - BTS-2341
  resetStuckErrors(30);

  const stats = getErrorStats();`;

if (monitorContent.includes(oldScale)) {
  monitorContent = monitorContent.replace(oldScale, newScale);
  console.log('3. monitor.ts: resetStuckErrors call added');
} else {
  console.log('3. monitor.ts: scaleWorkers pattern not found');
}

fs.writeFileSync(monitorPath, monitorContent, 'utf8');
console.log('Done!');
