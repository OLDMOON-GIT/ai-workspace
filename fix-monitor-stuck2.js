const fs = require('fs');
const monitorPath = 'C:/Users/oldmoon/workspace/mcp-debugger/src/monitor.ts';
let content = fs.readFileSync(monitorPath, 'utf8');

// Normalize line endings
content = content.replace(/\r\n/g, '\n');

// 1. Add resetStuckErrors to import
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

if (content.includes(oldImport)) {
  content = content.replace(oldImport, newImport);
  console.log('1. Import updated');
} else {
  console.log('1. Import pattern not found');
}

// 2. Add resetStuckErrors call at start of scaleWorkers
// Find the scaleWorkers function and add the call
const scaleWorkersPattern = /function scaleWorkers\(\) \{\n  const stats = getErrorStats\(\);/;
const scaleWorkersReplacement = `function scaleWorkers() {
  // Stuck 에러 복원 (30분 이상 processing 상태) - BTS-2341
  resetStuckErrors(30);

  const stats = getErrorStats();`;

if (scaleWorkersPattern.test(content)) {
  content = content.replace(scaleWorkersPattern, scaleWorkersReplacement);
  console.log('2. resetStuckErrors call added to scaleWorkers');
} else {
  console.log('2. scaleWorkers pattern not found');
}

// Convert back to CRLF
content = content.replace(/\n/g, '\r\n');
fs.writeFileSync(monitorPath, content, 'utf8');
console.log('Done!');
