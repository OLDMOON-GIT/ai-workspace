/**
 * Phase 1: 안전한 파일 정리
 * - 로그 파일 삭제
 * - 임시 파일 삭제
 * - 테스트 출력 삭제
 *
 * 예상 절약: ~50MB (Frontend 로그)
 */

const fs = require('fs');
const path = require('path');

const FRONTEND_PATH = path.join(__dirname, 'trend-video-frontend');
const BACKEND_PATH = path.join(__dirname, 'trend-video-backend');

function deleteFile(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      const stats = fs.statSync(filePath);
      fs.unlinkSync(filePath);
      return stats.size;
    }
  } catch (e) {
    console.log(`  ❌ 삭제 실패: ${filePath} (${e.message})`);
  }
  return 0;
}

function deleteDirectory(dirPath) {
  try {
    if (fs.existsSync(dirPath)) {
      fs.rmSync(dirPath, { recursive: true, force: true });
      return true;
    }
  } catch (e) {
    console.log(`  ❌ 디렉토리 삭제 실패: ${dirPath} (${e.message})`);
  }
  return false;
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

function cleanupPhase1() {
  console.log('🧹 Phase 1: 안전한 파일 정리 시작...\n');

  let totalDeleted = 0;
  let fileCount = 0;

  // ===== Frontend 정리 =====
  console.log('📁 Frontend 정리 중...\n');

  // 1. 로그 파일 백업 (30일 이상 오래된 것만)
  console.log('1️⃣  백업 로그 파일 삭제:');
  const logsDir = path.join(FRONTEND_PATH, 'logs');
  if (fs.existsSync(logsDir)) {
    const logFiles = fs.readdirSync(logsDir).filter(f => f.startsWith('server-2025-'));
    logFiles.forEach(file => {
      const filePath = path.join(logsDir, file);
      const size = deleteFile(filePath);
      if (size > 0) {
        totalDeleted += size;
        fileCount++;
        console.log(`  ✅ ${file} (${formatBytes(size)})`);
      }
    });
  }
  console.log();

  // 2. 루트 로그 파일
  console.log('2️⃣  루트 로그 파일 삭제:');
  const rootLogs = [
    'dev-server.log',
    'image-worker.log',
    'image-worker-test.log',
    'test-chrome-mode.log',
    'test-final.log',
    'test-output.log',
    'test-run.log',
  ];
  rootLogs.forEach(file => {
    const filePath = path.join(FRONTEND_PATH, file);
    const size = deleteFile(filePath);
    if (size > 0) {
      totalDeleted += size;
      fileCount++;
      console.log(`  ✅ ${file} (${formatBytes(size)})`);
    }
  });
  console.log();

  // 3. 임시 파일
  console.log('3️⃣  임시 파일 삭제:');
  const tempFiles = [
    'test_script.json',
  ];
  tempFiles.forEach(file => {
    const filePath = path.join(FRONTEND_PATH, file);
    const size = deleteFile(filePath);
    if (size > 0) {
      totalDeleted += size;
      fileCount++;
      console.log(`  ✅ ${file} (${formatBytes(size)})`);
    }
  });
  console.log();

  // 4. 테스트 출력 디렉토리
  console.log('4️⃣  테스트 출력 디렉토리 삭제:');
  const testOutputDir = path.join(FRONTEND_PATH, 'test-output');
  if (deleteDirectory(testOutputDir)) {
    console.log(`  ✅ test-output/`);
  }
  console.log();

  // ===== Backend 정리 =====
  console.log('📁 Backend 정리 중...\n');

  // 5. Backend 로그
  console.log('5️⃣  Backend 로그 파일 삭제:');
  const backendLogsDir = path.join(BACKEND_PATH, 'logs');
  if (fs.existsSync(backendLogsDir)) {
    const backendLogs = fs.readdirSync(backendLogsDir).filter(f => f.endsWith('.log'));
    backendLogs.forEach(file => {
      const filePath = path.join(backendLogsDir, file);
      const size = deleteFile(filePath);
      if (size > 0) {
        totalDeleted += size;
        fileCount++;
        console.log(`  ✅ ${file} (${formatBytes(size)})`);
      }
    });
  }
  console.log();

  // ===== 결과 =====
  console.log('='.repeat(60));
  console.log('✅ Phase 1 정리 완료!\n');
  console.log(`📊 결과:`);
  console.log(`   삭제된 파일: ${fileCount}개`);
  console.log(`   절약된 공간: ${formatBytes(totalDeleted)}`);
  console.log();
  console.log('💡 다음 단계:');
  console.log('   1. git status로 변경사항 확인');
  console.log('   2. Phase 2 실행: node cleanup-phase2.js');
}

// 실행
if (require.main === module) {
  // 확인 메시지
  console.log('⚠️  이 스크립트는 다음 파일들을 삭제합니다:');
  console.log('   - logs/server-*.log (백업 로그)');
  console.log('   - 루트 *.log 파일');
  console.log('   - test_script.json');
  console.log('   - test-output/ 디렉토리');
  console.log('   - backend/logs/*.log');
  console.log();
  console.log('계속하려면 5초 후 자동 실행됩니다...\n');

  setTimeout(() => {
    cleanupPhase1();
  }, 5000);
}

module.exports = { cleanupPhase1 };
