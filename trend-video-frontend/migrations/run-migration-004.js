#!/usr/bin/env node

/**
 * Queue Table Consolidation Migration Runner
 *
 * 이 스크립트는 중복된 큐/작업 테이블을 통합합니다.
 * 실행 전 데이터베이스 백업을 권장합니다.
 */

const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

// 데이터베이스 경로
const DB_PATH = path.join(__dirname, '..', 'data', 'database.sqlite');
const MIGRATION_PATH = path.join(__dirname, '004_queue_table_consolidation.sql');
const BACKUP_DIR = path.join(__dirname, '..', 'data', 'backups');

// 백업 디렉토리 생성
if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

// 현재 시간으로 백업 파일명 생성
const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
const BACKUP_PATH = path.join(BACKUP_DIR, `database_${timestamp}_before_queue_consolidation.sqlite`);

console.log('🚀 Queue Table Consolidation Migration');
console.log('=====================================');

// 1. 데이터베이스 백업
console.log('\n1️⃣ 데이터베이스 백업 중...');
try {
  fs.copyFileSync(DB_PATH, BACKUP_PATH);
  console.log(`✅ 백업 완료: ${BACKUP_PATH}`);
} catch (error) {
  console.error('❌ 백업 실패:', error.message);
  process.exit(1);
}

// 2. 마이그레이션 SQL 읽기
console.log('\n2️⃣ 마이그레이션 스크립트 로드 중...');
let migrationSQL;
try {
  migrationSQL = fs.readFileSync(MIGRATION_PATH, 'utf8');
  console.log('✅ 마이그레이션 스크립트 로드 완료');
} catch (error) {
  console.error('❌ 마이그레이션 스크립트 읽기 실패:', error.message);
  process.exit(1);
}

// 3. 데이터베이스 연결
const db = new Database(DB_PATH);
console.log('\n3️⃣ 데이터베이스 연결 성공');

try {
  console.log('\n4️⃣ 마이그레이션 실행 중...');

  // WAL 모드 설정 (성능 향상)
  db.pragma('journal_mode = WAL');

  // SQL 문을 개별적으로 실행 (세미콜론으로 분리)
  const statements = migrationSQL
    .split(';')
    .map(stmt => stmt.trim())
    .filter(stmt => {
      // 빈 문자열이나 주석만 있는 줄 제거
      if (!stmt || stmt.length === 0) return false;
      // 전체가 주석인 경우 제거
      const lines = stmt.split('\n').filter(line => !line.trim().startsWith('--'));
      return lines.some(line => line.trim().length > 0);
    });

  let completed = 0;
  const total = statements.length;

  // 트랜잭션으로 실행
  const migrate = db.transaction(() => {
    for (const stmt of statements) {
      try {
        // CREATE, ALTER, INSERT 등 주요 작업 로그
        if (stmt.match(/^(CREATE|ALTER|INSERT|UPDATE|DELETE|DROP)/i)) {
          const action = stmt.match(/^(\w+)/)[1].toUpperCase();
          const target = stmt.match(/(TABLE|VIEW|INDEX)\s+(?:IF\s+(?:NOT\s+)?EXISTS\s+)?(\w+)/i);
          if (target) {
            process.stdout.write(`   ${action} ${target[2]}...`);
          }
        }

        const result = db.prepare(stmt).run();
        completed++;

        if (result?.changes > 0) {
          process.stdout.write(` (${result.changes} rows)\n`);
        } else if (stmt.match(/^(CREATE|ALTER)/i)) {
          process.stdout.write(' ✓\n');
        }
      } catch (error) {
        // 이미 존재하는 테이블/인덱스 에러는 무시
        if (error.message.includes('already exists')) {
          process.stdout.write(' (already exists)\n');
          completed++;
        } else {
          console.error(`\n❌ SQL 실행 실패:`, error.message);
          console.error('실패한 SQL:', stmt.substring(0, 100) + '...');
          throw error;
        }
      }
    }
  });

  // 마이그레이션 실행
  migrate();

  console.log('\n✅ 마이그레이션 완료!');
  console.log(`   처리된 SQL 문: ${completed}/${total}`);

  // 5. 통계 출력
  console.log('\n5️⃣ 마이그레이션 통계');
  console.log('=====================================');

  // 통합 큐 테이블 통계
  try {
    const queueStats = db.prepare('SELECT COUNT(*) as total, COUNT(DISTINCT type) as types FROM unified_queue').get();
    if (queueStats) {
      console.log(`📊 unified_queue: ${queueStats.total} rows, ${queueStats.types} types`);
    }
  } catch (e) {
    console.log('📊 unified_queue: 테이블 생성됨');
  }

  // 통합 로그 테이블 통계
  try {
    const logStats = db.prepare('SELECT COUNT(*) as total FROM unified_logs').get();
    if (logStats) {
      console.log(`📊 unified_logs: ${logStats.total} rows`);
    }
  } catch (e) {
    console.log('📊 unified_logs: 테이블 생성됨');
  }

  // 콘텐츠 메타데이터 통계
  try {
    const contentStats = db.prepare('SELECT COUNT(*) as total FROM content_metadata').get();
    if (contentStats) {
      console.log(`📊 content_metadata: ${contentStats.total} rows`);
    }
  } catch (e) {
    console.log('📊 content_metadata: 테이블 생성됨');
  }

  // 백업된 테이블 목록
  const backupTables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '%_old'").all();
  if (backupTables.length > 0) {
    console.log('\n📁 백업된 테이블:');
    backupTables.forEach(row => {
      console.log(`   - ${row.name}`);
    });
  }

  console.log('\n✅ 마이그레이션이 성공적으로 완료되었습니다!');
  console.log('\n💡 다음 단계:');
  console.log('   1. 애플리케이션을 재시작하여 변경사항 확인');
  console.log('   2. 문제 발생 시 백업 파일로 복원 가능:');
  console.log(`      cp ${BACKUP_PATH} ${DB_PATH}`);
  console.log('   3. 정상 작동 확인 후 *_old 테이블 삭제 가능');

} catch (error) {
  console.error('\n❌ 마이그레이션 실패:', error.message);
  console.error('\n🔄 백업 파일로 복원하려면:');
  console.error(`   cp ${BACKUP_PATH} ${DB_PATH}`);
  process.exit(1);
} finally {
  db.close();
}

// 에러 핸들링
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});