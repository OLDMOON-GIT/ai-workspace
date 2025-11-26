/**
 * Phase 2: 유틸리티 스크립트 정리
 * - 루트의 유틸리티 스크립트를 scripts/utils/로 이동
 * - 카테고리별 정리
 *
 * 효과: 루트 디렉토리 정리, 파일 구조 개선
 */

const fs = require('fs');
const path = require('path');

const FRONTEND_PATH = path.join(__dirname, 'trend-video-frontend');

// 이동할 파일 매핑
const filesToMove = {
  // DB 관련 → scripts/utils/db/
  'check-db.js': 'scripts/utils/db/check-db.js',
  'check-db-structure.js': 'scripts/utils/db/check-db-structure.js',
  'check-queue-db.js': 'scripts/utils/db/check-queue-db.js',
  'check-queue-status.js': 'scripts/utils/db/check-queue-status.js',
  'check-status.js': 'scripts/utils/db/check-status.js',
  'check-task-table.js': 'scripts/utils/db/check-task-table.js',

  // 수정 스크립트 → scripts/utils/fix/
  'fix-current-status.js': 'scripts/utils/fix/fix-current-status.js',
  'fix-media-mode.js': 'scripts/utils/fix/fix-media-mode.js',

  // 마이그레이션 → scripts/utils/migration/
  'migrate-all-dbs.js': 'scripts/utils/migration/migrate-all-dbs.js',
  'migrate-product-format.js': 'scripts/utils/migration/migrate-product-format.js',
  'run-migration.js': 'scripts/utils/migration/run-migration.js',

  // 복구/리셋 → scripts/utils/restore/
  'restore-db.js': 'scripts/utils/restore/restore-db.js',
  'restore-products.js': 'scripts/utils/restore/restore-products.js',
  'reset-queue-locks.js': 'scripts/utils/restore/reset-queue-locks.js',
};

// 루트에 유지할 파일 (실행용 스크립트)
const keepInRoot = [
  'cleanup.js',
  'cleanup-aggressive.js',
  'auto-cleanup.js',
  'start-all-workers.js',
  'start-image-worker.js',
  'start-with-check.js',
  'image-worker.js',
  'trigger-scheduler.js',
  'monitor-image-worker.js',
  'jest.config.js',
  'jest.setup.js',
  'package.json',
  'package-lock.json',
  'tsconfig.json',
];

function moveFile(source, target) {
  try {
    const sourcePath = path.join(FRONTEND_PATH, source);
    const targetPath = path.join(FRONTEND_PATH, target);

    if (!fs.existsSync(sourcePath)) {
      return { success: false, reason: '파일 없음' };
    }

    // 타겟 디렉토리 생성
    const targetDir = path.dirname(targetPath);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    // 파일 이동
    fs.renameSync(sourcePath, targetPath);
    return { success: true };
  } catch (e) {
    return { success: false, reason: e.message };
  }
}

function cleanupPhase2() {
  console.log('📁 Phase 2: 유틸리티 스크립트 정리 시작...\n');

  let movedCount = 0;
  let skippedCount = 0;

  // 디렉토리별 분류
  const categories = {
    'DB 관리': [],
    '수정 스크립트': [],
    '마이그레이션': [],
    '복구/리셋': [],
  };

  // 카테고리 구분
  Object.entries(filesToMove).forEach(([source, target]) => {
    if (target.includes('/db/')) categories['DB 관리'].push([source, target]);
    else if (target.includes('/fix/')) categories['수정 스크립트'].push([source, target]);
    else if (target.includes('/migration/')) categories['마이그레이션'].push([source, target]);
    else if (target.includes('/restore/')) categories['복구/리셋'].push([source, target]);
  });

  // 카테고리별 이동
  Object.entries(categories).forEach(([category, files]) => {
    if (files.length === 0) return;

    console.log(`📂 ${category}:`);
    files.forEach(([source, target]) => {
      const result = moveFile(source, target);
      if (result.success) {
        console.log(`  ✅ ${source} → ${target}`);
        movedCount++;
      } else {
        console.log(`  ⚠️  ${source} (${result.reason})`);
        skippedCount++;
      }
    });
    console.log();
  });

  // 최종 루트 디렉토리 확인
  console.log('📋 루트 디렉토리 정리 후:');
  const rootFiles = fs.readdirSync(FRONTEND_PATH)
    .filter(f => f.endsWith('.js'))
    .sort();

  console.log(`\n유지된 실행 스크립트 (${rootFiles.length}개):`);
  rootFiles.forEach(f => {
    if (keepInRoot.includes(f)) {
      console.log(`  ✅ ${f}`);
    } else {
      console.log(`  ⚠️  ${f} (예상치 못한 파일)`);
    }
  });
  console.log();

  // 결과
  console.log('='.repeat(60));
  console.log('✅ Phase 2 정리 완료!\n');
  console.log(`📊 결과:`);
  console.log(`   이동: ${movedCount}개`);
  console.log(`   스킵: ${skippedCount}개`);
  console.log(`   루트 파일: ${rootFiles.length}개`);
  console.log();
  console.log('💡 다음 단계:');
  console.log('   1. git status로 변경사항 확인');
  console.log('   2. git add . && git commit');
  console.log('   3. Phase 3 실행: .gitignore 업데이트');
}

// 실행
if (require.main === module) {
  console.log('⚠️  이 스크립트는 루트의 유틸리티 파일들을 scripts/utils/로 이동합니다.\n');
  console.log('이동할 파일:');
  console.log(`  - DB 관리: 6개`);
  console.log(`  - 수정 스크립트: 2개`);
  console.log(`  - 마이그레이션: 3개`);
  console.log(`  - 복구/리셋: 3개`);
  console.log();
  console.log('계속하려면 5초 후 자동 실행됩니다...\n');

  setTimeout(() => {
    cleanupPhase2();
  }, 5000);
}

module.exports = { cleanupPhase2 };
