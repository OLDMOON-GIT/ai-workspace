#!/usr/bin/env node
/**
 * Script Worker 시작 스크립트
 */

const { spawn } = require('child_process');
const path = require('path');

console.log('📝 Starting Script Worker...');

const workerPath = path.join(__dirname, 'src', 'workers', 'script-worker.ts');

const worker = spawn('ts-node', [workerPath], {
  cwd: __dirname,
  stdio: 'inherit',
  shell: true
});

worker.on('error', (err) => {
  console.error('❌ Failed to start Script Worker:', err);
  process.exit(1);
});

worker.on('exit', (code) => {
  console.log(`⚠️ Script Worker exited with code ${code}`);
  process.exit(code || 0);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n⏹️ Stopping Script Worker...');
  worker.kill('SIGTERM');
});

process.on('SIGTERM', () => {
  console.log('\n⏹️ Stopping Script Worker...');
  worker.kill('SIGTERM');
});
