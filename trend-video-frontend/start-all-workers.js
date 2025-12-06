#!/usr/bin/env node
/**
 * 모든 워커 프로세스 시작
 * Script, Image, Video, YouTube 워커를 자동으로 시작합니다.
 */

const { spawn } = require('child_process');
const path = require('path');

console.log('🚀 Starting all workers...');

const workers = [];

// Script 워커 시작
const scriptWorkerPath = path.join(__dirname, 'start-script-worker.js');
console.log('📝 Starting Script Worker...');
const scriptWorker = spawn('node', [scriptWorkerPath], {
  cwd: __dirname,
  stdio: 'inherit',
  shell: true
});

scriptWorker.on('error', (err) => {
  console.error('❌ Failed to start Script Worker:', err);
});

scriptWorker.on('exit', (code) => {
  console.log(`⚠️ Script Worker exited with code ${code}`);
});

workers.push(scriptWorker);

// 이미지 워커 시작
const imageWorkerPath = path.join(__dirname, 'start-image-worker.js');
console.log('📸 Starting Image Worker...');
const imageWorker = spawn('node', [imageWorkerPath], {
  cwd: __dirname,
  stdio: 'inherit',
  shell: true
});

imageWorker.on('error', (err) => {
  console.error('❌ Failed to start Image Worker:', err);
});

imageWorker.on('exit', (code) => {
  console.log(`⚠️ Image Worker exited with code ${code}`);
});

workers.push(imageWorker);

// 비디오 워커 시작
const videoWorkerPath = path.join(__dirname, 'start-video-worker.js');
console.log('🎬 Starting Video Worker...');
const videoWorker = spawn('node', [videoWorkerPath], {
  cwd: __dirname,
  stdio: 'inherit',
  shell: true
});

videoWorker.on('error', (err) => {
  console.error('❌ Failed to start Video Worker:', err);
});

videoWorker.on('exit', (code) => {
  console.log(`⚠️ Video Worker exited with code ${code}`);
});

workers.push(videoWorker);

// YouTube 워커 시작
const youtubeWorkerPath = path.join(__dirname, 'start-youtube-worker.js');
console.log('📺 Starting YouTube Worker...');
const youtubeWorker = spawn('node', [youtubeWorkerPath], {
  cwd: __dirname,
  stdio: 'inherit',
  shell: true
});

youtubeWorker.on('error', (err) => {
  console.error('❌ Failed to start YouTube Worker:', err);
});

youtubeWorker.on('exit', (code) => {
  console.log(`⚠️ YouTube Worker exited with code ${code}`);
});

workers.push(youtubeWorker);

// 종료 시그널 처리
process.on('SIGINT', () => {
  console.log('\n⏹️ Stopping all workers...');
  workers.forEach(worker => worker.kill('SIGTERM'));
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n⏹️ Stopping all workers...');
  workers.forEach(worker => worker.kill('SIGTERM'));
  process.exit(0);
});

console.log('✅ All 4 workers started successfully');
console.log('   📝 Script → 📸 Image → 🎬 Video → 📺 YouTube');
console.log('Press Ctrl+C to stop all workers');