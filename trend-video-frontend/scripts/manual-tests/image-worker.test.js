#!/usr/bin/env node
/**
 * 이미지 워커 테스트 - 직접 실행하여 로그 확인
 */

const path = require('path');
const { spawn } = require('child_process');

console.log('📸 이미지 워커 테스트 시작...\n');

const imageWorkerPath = path.join(__dirname, 'start-image-worker.js');

// 이미지 워커를 포그라운드로 실행 (콘솔에 로그 출력)
const imageWorker = spawn('node', [imageWorkerPath], {
  cwd: __dirname,
  stdio: 'inherit',  // 콘솔에 직접 출력
  shell: true
});

imageWorker.on('error', (err) => {
  console.error('❌ 이미지 워커 실행 오류:', err);
});

imageWorker.on('close', (code) => {
  console.log(`이미지 워커가 종료되었습니다. (코드: ${code})`);
});

// Ctrl+C 처리
process.on('SIGINT', () => {
  console.log('\n종료 중...');
  imageWorker.kill('SIGINT');
  process.exit(0);
});