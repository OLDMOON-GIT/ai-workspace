#!/usr/bin/env node
/**
 * 적극적인 정리 스크립트
 * 백업 파일을 최근 3개만 남기고 삭제
 */

const fs = require('fs');
const path = require('path');

function formatSize(bytes) {
  const sizes = ['B', 'KB', 'MB', 'GB'];
  if (bytes === 0) return '0 B';
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(2) + ' ' + sizes[i];
}

console.log('🚨 적극적인 정리 시작...\n');

// 1. 백업 파일 정리 (최근 3개만 유지)
const backupsDir = path.join(__dirname, 'data', 'backups');
if (fs.existsSync(backupsDir)) {
  console.log('📁 데이터베이스 백업 정리 (최근 3개만 유지)');

  // 백업 파일 목록 가져오기
  const backupFiles = fs.readdirSync(backupsDir)
    .filter(f => f.endsWith('.sqlite'))
    .map(f => {
      const filePath = path.join(backupsDir, f);
      const stat = fs.statSync(filePath);
      return {
        name: f,
        path: filePath,
        size: stat.size,
        mtime: stat.mtime
      };
    })
    .sort((a, b) => b.mtime - a.mtime); // 최신 순 정렬

  console.log(`  총 ${backupFiles.length}개 백업 파일 발견`);

  let freedSpace = 0;
  let deletedCount = 0;

  // 최근 3개를 제외한 나머지 삭제
  for (let i = 3; i < backupFiles.length; i++) {
    const file = backupFiles[i];
    freedSpace += file.size;
    fs.unlinkSync(file.path);
    deletedCount++;
    console.log(`  삭제: ${file.name} (${formatSize(file.size)})`);
  }

  // 유지되는 파일 표시
  console.log('\n  유지되는 백업:');
  for (let i = 0; i < Math.min(3, backupFiles.length); i++) {
    const file = backupFiles[i];
    console.log(`  ✅ ${file.name} (${formatSize(file.size)})`);
  }

  console.log(`\n  → ${deletedCount}개 백업 삭제, ${formatSize(freedSpace)} 확보`);
}

// 2. 오래된 로그 모두 삭제 (현재 로그만 유지)
const logsDir = path.join(__dirname, 'logs');
if (fs.existsSync(logsDir)) {
  console.log('\n📁 로그 파일 정리 (현재 로그만 유지)');

  const logFiles = fs.readdirSync(logsDir);
  let freedSpace = 0;
  let deletedCount = 0;

  for (const file of logFiles) {
    // server.log와 image-worker 관련 로그는 유지
    if (file === 'server.log' ||
        file === 'image-worker.log' ||
        file === 'image-worker-auto.log' ||
        file === 'monitor.log') {
      console.log(`  ✅ 유지: ${file}`);
      continue;
    }

    const filePath = path.join(logsDir, file);
    const stat = fs.statSync(filePath);
    freedSpace += stat.size;
    fs.unlinkSync(filePath);
    deletedCount++;
    console.log(`  삭제: ${file} (${formatSize(stat.size)})`);
  }

  console.log(`  → ${deletedCount}개 로그 삭제, ${formatSize(freedSpace)} 확보`);
}

// 3. dump.sql 파일 삭제
const dumpFile = path.join(__dirname, 'data', 'dump.sql');
if (fs.existsSync(dumpFile)) {
  console.log('\n📁 덤프 파일 정리');
  const stat = fs.statSync(dumpFile);
  fs.unlinkSync(dumpFile);
  console.log(`  삭제: dump.sql (${formatSize(stat.size)})`);
}

// 4. WAL 파일 정리 (SQLite Write-Ahead Log)
const walFile = path.join(__dirname, 'data', 'database.sqlite-wal');
const shmFile = path.join(__dirname, 'data', 'database.sqlite-shm');
let walFreed = 0;

if (fs.existsSync(walFile)) {
  const stat = fs.statSync(walFile);
  walFreed += stat.size;
  console.log(`\n⚠️ WAL 파일 발견: ${formatSize(stat.size)}`);
  console.log('  (서버 재시작 후 자동으로 정리됩니다)');
}

console.log('\n✨ 정리 완료!');
console.log('💡 팁: 서버를 재시작하면 WAL 파일이 데이터베이스에 병합되어 추가 공간을 확보할 수 있습니다.');