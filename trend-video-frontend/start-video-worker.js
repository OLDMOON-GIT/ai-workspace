#!/usr/bin/env node
/**
 * Video Worker 시작 스크립트
 */

const { spawn } = require('child_process');
const path = require('path');

console.log('🎬 Starting Video Worker...');

const workerPath = path.join(__dirname, 'src', 'workers', 'video-worker.ts');

const worker = spawn('ts-node', [workerPath], {
  cwd: __dirname,
  stdio: 'inherit',
  shell: true
});

worker.on('error', (err) => {
  console.error('❌ Failed to start Video Worker:', err);
  process.exit(1);
});

worker.on('exit', (code) => {
  console.log(`⚠️ Video Worker exited with code ${code}`);
  process.exit(code || 0);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n⏹️ Stopping Video Worker...');
  worker.kill('SIGTERM');
});

process.on('SIGTERM', () => {
  console.log('\n⏹️ Stopping Video Worker...');
  worker.kill('SIGTERM');
});
