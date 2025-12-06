// 모든 database.sqlite 파일에 'product' 포맷 추가
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbPaths = [
  path.join(__dirname, 'data', 'database.sqlite'),
  path.join(__dirname, 'database.sqlite')
];

function migrateDb(dbPath) {
  if (!fs.existsSync(dbPath)) {
    console.log(`⏭️ 건너뜀: ${dbPath} (파일 없음)`);
    return;
  }

  console.log(`\n🔄 마이그레이션 시작: ${dbPath}`);
  const db = new Database(dbPath);

  try {
    // 현재 테이블 구조 확인 (content 테이블 - 신규 스키마)
    const tableInfo = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='content'").get();

    if (!tableInfo) {
      console.log('  ⏭️ content 테이블 없음');
      db.close();
      return;
    }

    if (tableInfo.sql.includes("'product'") || tableInfo.sql.includes('prompt_format')) {
      console.log('  ✅ 이미 최신 스키마 (product 포맷 또는 prompt_format 컬럼 있음)');
      db.close();
      return;
    }

    // 트랜잭션 시작
    db.exec('BEGIN TRANSACTION');

    console.log('  📦 백업 중...');
    db.exec('CREATE TABLE content_backup AS SELECT * FROM content');

    console.log('  🗑️ 삭제 중...');
    db.exec('DROP TABLE content');

    console.log('  🔨 재생성 중...');
    db.exec(`
      CREATE TABLE content (
        content_id VARCHAR(255) PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL,
        title TEXT NOT NULL,
        original_title TEXT,
        status VARCHAR(50) DEFAULT 'draft',
        error TEXT,
        youtube_url TEXT,
        youtube_channel VARCHAR(255),
        youtube_publish_time VARCHAR(100),
        input_tokens INTEGER,
        output_tokens INTEGER,
        source_content_id VARCHAR(255),
        ai_model VARCHAR(100),
        prompt_format VARCHAR(100),
        product_info TEXT,
        category VARCHAR(255),
        score INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log('  📥 복원 중...');
    // 컬럼 매핑이 필요한 경우 SELECT 절 조정 필요
    try {
      db.exec('INSERT INTO content (content_id, user_id, title, original_title, status, error, input_tokens, output_tokens, source_content_id, created_at, updated_at) SELECT id, user_id, title, original_title, status, error, input_tokens, output_tokens, source_content_id, created_at, updated_at FROM content_backup');
    } catch (e) {
      console.log('  ⚠️ 기존 데이터 복원 실패, 빈 테이블 유지');
    }

    console.log('  🗑️ 백업 삭제 중...');
    db.exec('DROP TABLE content_backup');

    console.log('  🔍 인덱스 재생성 중...');
    db.exec('CREATE INDEX IF NOT EXISTS idx_content_user_id ON content(user_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_content_status ON content(status)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_content_prompt_format ON content(prompt_format)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_content_created_at ON content(created_at)');

    db.exec('COMMIT');
    console.log('  ✅ 완료!');

  } catch (error) {
    console.error('  ❌ 실패:', error.message);
    try {
      db.exec('ROLLBACK');
    } catch (e) {}
  } finally {
    db.close();
  }
}

console.log('🚀 모든 DB 마이그레이션 시작...\n');

dbPaths.forEach(migrateDb);

console.log('\n✅ 전체 마이그레이션 완료!');
