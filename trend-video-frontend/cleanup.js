#!/usr/bin/env node
/**
 * 프로젝트 정리 스크립트
 * - 로그 파일: 7일치만 유지
 * - 데이터베이스 백업: 7일치만 유지
 * - 손상된 파일 및 임시 파일 정리
 */

const fs = require('fs');
const path = require('path');

// 색상 코드
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

function formatSize(bytes) {
  const sizes = ['B', 'KB', 'MB', 'GB'];
  if (bytes === 0) return '0 B';
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(2) + ' ' + sizes[i];
}

function getDirectorySize(dirPath) {
  let totalSize = 0;

  try {
    const files = fs.readdirSync(dirPath);
    for (const file of files) {
      const filePath = path.join(dirPath, file);
      const stat = fs.statSync(filePath);

      if (stat.isFile()) {
        totalSize += stat.size;
      } else if (stat.isDirectory()) {
        totalSize += getDirectorySize(filePath);
      }
    }
  } catch (err) {
    // 접근 불가능한 디렉토리는 무시
  }

  return totalSize;
}

function deleteOldFiles(dirPath, daysOld, pattern = null) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysOld);

  let deletedCount = 0;
  let freedSpace = 0;

  try {
    const files = fs.readdirSync(dirPath);

    for (const file of files) {
      const filePath = path.join(dirPath, file);

      try {
        const stat = fs.statSync(filePath);

        // 패턴이 있으면 매칭 확인
        if (pattern && !file.match(pattern)) continue;

        // 파일이고 오래된 경우 삭제
        if (stat.isFile() && stat.mtime < cutoffDate) {
          freedSpace += stat.size;
          fs.unlinkSync(filePath);
          deletedCount++;
          console.log(`  ${colors.red}삭제${colors.reset}: ${file} (${formatSize(stat.size)}, ${Math.floor((Date.now() - stat.mtime) / (1000 * 60 * 60 * 24))}일 경과)`);
        }
      } catch (err) {
        // 파일 접근 오류는 무시
      }
    }
  } catch (err) {
    console.error(`  ${colors.red}오류${colors.reset}: ${dirPath} 접근 실패`);
  }

  return { deletedCount, freedSpace };
}

async function main() {
  console.log(`${colors.cyan}${colors.bright}🧹 프로젝트 정리 시작${colors.reset}\n`);

  let totalFreedSpace = 0;

  // 1. 오래된 로그 파일 정리 (7일 이상)
  console.log(`${colors.yellow}📁 로그 파일 정리 (7일 이상)${colors.reset}`);
  const logsDir = path.join(__dirname, 'logs');
  if (fs.existsSync(logsDir)) {
    const logResult = deleteOldFiles(logsDir, 7, /\.(log|txt)$/);
    totalFreedSpace += logResult.freedSpace;
    console.log(`  → ${logResult.deletedCount}개 파일 삭제, ${formatSize(logResult.freedSpace)} 확보\n`);
  }

  // 2. 데이터베이스 백업 정리 (7일 이상)
  console.log(`${colors.yellow}💾 데이터베이스 백업 정리 (7일 이상)${colors.reset}`);
  const backupsDir = path.join(__dirname, 'data', 'backups');
  if (fs.existsSync(backupsDir)) {
    const backupResult = deleteOldFiles(backupsDir, 7);
    totalFreedSpace += backupResult.freedSpace;
    console.log(`  → ${backupResult.deletedCount}개 파일 삭제, ${formatSize(backupResult.freedSpace)} 확보\n`);
  }

  // 3. 손상된 jobs.json 파일 정리
  console.log(`${colors.yellow}🗑️ 손상된 파일 정리${colors.reset}`);
  const dataDir = path.join(__dirname, 'data');
  if (fs.existsSync(dataDir)) {
    const corruptedFiles = fs.readdirSync(dataDir).filter(f =>
      f.includes('.corrupted') || f.includes('.broken')
    );

    for (const file of corruptedFiles) {
      const filePath = path.join(dataDir, file);
      const stat = fs.statSync(filePath);
      totalFreedSpace += stat.size;
      fs.unlinkSync(filePath);
      console.log(`  ${colors.red}삭제${colors.reset}: ${file} (${formatSize(stat.size)})`);
    }
    console.log(`  → ${corruptedFiles.length}개 파일 삭제\n`);
  }

  // 4. 테스트 출력 정리 (모든 테스트 파일)
  console.log(`${colors.yellow}🧪 테스트 출력 정리${colors.reset}`);
  const testOutputDir = path.join(__dirname, 'test-output');
  if (fs.existsSync(testOutputDir)) {
    const beforeSize = getDirectorySize(testOutputDir);

    // 테스트 출력 디렉토리 전체 삭제
    fs.rmSync(testOutputDir, { recursive: true, force: true });
    fs.mkdirSync(testOutputDir, { recursive: true });

    totalFreedSpace += beforeSize;
    console.log(`  → 테스트 출력 디렉토리 초기화, ${formatSize(beforeSize)} 확보\n`);
  }

  // 5. node_modules/.cache 정리
  console.log(`${colors.yellow}📦 node_modules 캐시 정리${colors.reset}`);
  const cacheDir = path.join(__dirname, 'node_modules', '.cache');
  if (fs.existsSync(cacheDir)) {
    const beforeSize = getDirectorySize(cacheDir);
    fs.rmSync(cacheDir, { recursive: true, force: true });
    totalFreedSpace += beforeSize;
    console.log(`  → 캐시 삭제, ${formatSize(beforeSize)} 확보\n`);
  }

  // 6. .next 빌드 캐시 정리
  console.log(`${colors.yellow}🔨 Next.js 빌드 캐시 정리${colors.reset}`);
  const nextDir = path.join(__dirname, '.next');
  if (fs.existsSync(nextDir)) {
    const beforeSize = getDirectorySize(nextDir);
    fs.rmSync(nextDir, { recursive: true, force: true });
    totalFreedSpace += beforeSize;
    console.log(`  → 빌드 캐시 삭제, ${formatSize(beforeSize)} 확보\n`);
  }

  // 7. 임시 파일 정리
  console.log(`${colors.yellow}🗂️ 임시 파일 정리${colors.reset}`);
  const tempDir = path.join(__dirname, 'temp');
  if (fs.existsSync(tempDir)) {
    const tempResult = deleteOldFiles(tempDir, 1);
    totalFreedSpace += tempResult.freedSpace;
    console.log(`  → ${tempResult.deletedCount}개 파일 삭제, ${formatSize(tempResult.freedSpace)} 확보\n`);
  }

  // 8. 현재 디스크 사용량 보고
  console.log(`${colors.cyan}${colors.bright}📊 정리 결과${colors.reset}`);
  console.log(`${colors.green}✅ 총 ${formatSize(totalFreedSpace)} 공간 확보${colors.reset}\n`);

  // 주요 디렉토리 크기 표시
  console.log(`${colors.cyan}📈 현재 디렉토리 크기:${colors.reset}`);
  const directories = [
    { name: 'data', path: path.join(__dirname, 'data') },
    { name: 'logs', path: path.join(__dirname, 'logs') },
    { name: 'node_modules', path: path.join(__dirname, 'node_modules') },
    { name: 'src', path: path.join(__dirname, 'src') },
    { name: 'scripts', path: path.join(__dirname, 'scripts') },
  ];

  for (const dir of directories) {
    if (fs.existsSync(dir.path)) {
      const size = getDirectorySize(dir.path);
      const sizeStr = formatSize(size);
      let color = colors.green;
      if (size > 500 * 1024 * 1024) color = colors.red; // 500MB 이상
      else if (size > 100 * 1024 * 1024) color = colors.yellow; // 100MB 이상

      console.log(`  ${dir.name}: ${color}${sizeStr}${colors.reset}`);
    }
  }

  console.log(`\n${colors.green}✨ 정리 완료!${colors.reset}`);
}

// 실행
main().catch(console.error);