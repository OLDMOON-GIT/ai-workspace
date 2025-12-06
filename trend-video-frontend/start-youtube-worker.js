#!/usr/bin/env node
/**
 * YouTube Worker 시작 스크립트
 */

const { spawn } = require('child_process');
const path = require('path');

console.log('📺 Starting YouTube Worker...');

const workerPath = path.join(__dirname, 'src', 'workers', 'youtube-worker.ts');

const worker = spawn('ts-node', [workerPath], {
  cwd: __dirname,
  stdio: 'inherit',
  shell: true
});

worker.on('error', (err) => {
  console.error('❌ Failed to start YouTube Worker:', err);
  process.exit(1);
});

worker.on('exit', (code) => {
  console.log(`⚠️ YouTube Worker exited with code ${code}`);
  process.exit(code || 0);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n⏹️ Stopping YouTube Worker...');
  worker.kill('SIGTERM');
});

process.on('SIGTERM', () => {
  console.log('\n⏹️ Stopping YouTube Worker...');
  worker.kill('SIGTERM');
});
