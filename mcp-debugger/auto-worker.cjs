#!/usr/bin/env node
/**
 * 자동 에러 처리 워커
 * 5초마다 새로운 에러를 확인하고 자동으로 처리
 */

const { execSync } = require('child_process');
const Database = require('better-sqlite3');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

// DB 경로
const homeDir = os.homedir();
const dataDir = path.join(homeDir, '.mcp-debugger');
const dbPath = path.join(dataDir, 'error-queue.db');

// 워커 ID 생성
function getWorkerId() {
  const hostname = os.hostname();
  const username = os.userInfo().username;
  const pid = process.pid;
  return crypto.createHash('md5').update(`${hostname}-${username}-${pid}`).digest('hex').substring(0, 8);
}

// Heartbeat 업데이트
function updateHeartbeat(workerId) {
  try {
    const db = new Database(dbPath);
    db.prepare(`
      UPDATE worker_status
      SET last_heartbeat = datetime('now')
      WHERE id = ?
    `).run(workerId);
    db.close();
  } catch (error) {
    // DB 에러 무시
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function autoResolve() {
  let totalResolved = 0;
  const workerId = getWorkerId();

  console.log(`🤖 자동 에러 처리 워커 시작... (ID: worker-${workerId})`);
  console.log('   (5초마다 새 에러 체크, Ctrl+C로 종료)\n');

  while (true) {
    // Heartbeat 업데이트
    updateHeartbeat(workerId);

    try {
      // 에러 가져오기
      const output = execSync('npm run worker -- 에러탐지해', {
        encoding: 'utf8',
        stdio: 'pipe'
      });

      // 에러 ID 추출
      const match = output.match(/에러 #(\d+)/);
      if (!match) {
        console.log(`[${new Date().toLocaleTimeString()}] ✅ 대기 중인 에러 없음 (총 ${totalResolved}개 처리)`);
        await sleep(5000);
        continue;
      }

      const errorId = match[1];
      const errorMsg = output.match(/📝 메시지: (.+)/)?.[1] || '';

      console.log(`[${new Date().toLocaleTimeString()}] 📝 처리 중: #${errorId} - ${errorMsg.substring(0, 50)}...`);

      // 에러 해결 처리
      execSync(`npm run worker -- 해결 ${errorId} "자동 해결: ${errorMsg.substring(0, 30)}"`, {
        encoding: 'utf8',
        stdio: 'pipe'
      });

      totalResolved++;
      console.log(`[${new Date().toLocaleTimeString()}] ✅ #${errorId} 해결 완료 (총 ${totalResolved}개)\n`);

    } catch (error) {
      if (error.message.includes('처리할 에러가 없습니다')) {
        console.log(`[${new Date().toLocaleTimeString()}] ✅ 대기 중인 에러 없음 (총 ${totalResolved}개 처리)`);
      } else {
        console.error(`[${new Date().toLocaleTimeString()}] ❌ 처리 실패:`, error.message.substring(0, 100));
      }
    }

    // 5초 대기
    await sleep(5000);
  }
}

autoResolve().catch(console.error);
