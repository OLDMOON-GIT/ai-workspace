#!/usr/bin/env node
/**
 * 이미지 워커 모니터링 및 자동 재시작
 * 이미지 워커가 실행 중이 아니면 자동으로 시작합니다.
 */

const { spawn, exec } = require('child_process');
const path = require('path');
const fs = require('fs');

const IMAGE_WORKER_PATH = path.join(__dirname, 'start-image-worker.js');
const CHECK_INTERVAL = 30000; // 30초마다 체크
const LOGS_DIR = path.join(__dirname, 'logs');

// 로그 디렉토리 생성
if (!fs.existsSync(LOGS_DIR)) {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
}

let imageWorkerProcess = null;

function log(message) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${message}`);

  // 로그 파일에도 기록
  const logFile = path.join(LOGS_DIR, 'monitor.log');
  fs.appendFileSync(logFile, `[${timestamp}] ${message}\n`);
}

function startImageWorker() {
  if (imageWorkerProcess) {
    log('⚠️ 이미지 워커가 이미 실행 중입니다.');
    return;
  }

  log('🚀 이미지 워커를 시작합니다...');

  const logPath = path.join(LOGS_DIR, 'image-worker.log');
  const logStream = fs.createWriteStream(logPath, { flags: 'a' });

  imageWorkerProcess = spawn('node', [IMAGE_WORKER_PATH], {
    cwd: __dirname,
    stdio: ['ignore', logStream, logStream]
  });

  imageWorkerProcess.on('error', (err) => {
    log(`❌ 이미지 워커 실행 오류: ${err.message}`);
    imageWorkerProcess = null;
  });

  imageWorkerProcess.on('exit', (code, signal) => {
    log(`⚠️ 이미지 워커가 종료되었습니다. (코드: ${code}, 시그널: ${signal})`);
    imageWorkerProcess = null;

    // 비정상 종료시 자동 재시작
    if (code !== 0) {
      setTimeout(() => {
        log('♻️ 이미지 워커를 재시작합니다...');
        startImageWorker();
      }, 5000);
    }
  });

  log(`✅ 이미지 워커가 시작되었습니다. (PID: ${imageWorkerProcess.pid})`);
  log(`📄 로그 파일: ${logPath}`);
}

function checkQueueStatus() {
  // 큐 상태 확인
  const dbPath = path.join(__dirname, 'data', 'queue.sqlite');
  if (!fs.existsSync(dbPath)) {
    return;
  }

  try {
    const Database = require('better-sqlite3');
    const db = new Database(dbPath);

    const waitingTasks = db.prepare(`
      SELECT COUNT(*) as count
      FROM tasks_queue
      WHERE type = 'image' AND status = 'waiting'
    `).get();

    const processingTasks = db.prepare(`
      SELECT COUNT(*) as count
      FROM tasks_queue
      WHERE type = 'image' AND status = 'processing'
    `).get();

    db.close();

    if (waitingTasks.count > 0) {
      log(`📊 대기 중인 이미지 작업: ${waitingTasks.count}개`);

      // 대기 중인 작업이 있는데 워커가 없으면 시작
      if (!imageWorkerProcess) {
        log('⚠️ 대기 중인 작업이 있지만 워커가 실행되지 않았습니다.');
        startImageWorker();
      }
    }

    if (processingTasks.count > 0) {
      log(`⚙️ 처리 중인 이미지 작업: ${processingTasks.count}개`);
    }
  } catch (err) {
    log(`❌ 큐 상태 확인 오류: ${err.message}`);
  }
}

function checkWorkerHealth() {
  if (!imageWorkerProcess) {
    log('⚠️ 이미지 워커가 실행되지 않았습니다.');
    checkQueueStatus(); // 큐에 작업이 있는지 확인
    return;
  }

  // 프로세스가 살아있는지 확인
  try {
    process.kill(imageWorkerProcess.pid, 0);
    log('✅ 이미지 워커가 정상 실행 중입니다.');
    checkQueueStatus();
  } catch (err) {
    log('❌ 이미지 워커가 응답하지 않습니다.');
    imageWorkerProcess = null;
    startImageWorker();
  }
}

// 메인 실행
log('🔍 이미지 워커 모니터 시작...');
log(`⏰ 체크 간격: ${CHECK_INTERVAL / 1000}초`);

// 처음 시작시 워커 실행
startImageWorker();

// 주기적으로 상태 체크
setInterval(checkWorkerHealth, CHECK_INTERVAL);

// 종료 시그널 처리
process.on('SIGINT', () => {
  log('\n⏹️ 모니터 종료 중...');
  if (imageWorkerProcess) {
    imageWorkerProcess.kill('SIGTERM');
  }
  process.exit(0);
});

process.on('SIGTERM', () => {
  log('\n⏹️ 모니터 종료 중...');
  if (imageWorkerProcess) {
    imageWorkerProcess.kill('SIGTERM');
  }
  process.exit(0);
});