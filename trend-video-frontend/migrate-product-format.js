// content 테이블에 'product' prompt_format 추가 마이그레이션
// 참고: 구형 'contents' 테이블은 'content' 테이블로 통합됨 (Queue Spec v3)
const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, 'data', 'database.sqlite');
const db = new Database(DB_PATH);

console.log('🔄 content 테이블 마이그레이션 시작...');

try {
  // 현재 테이블 구조 확인 (content 테이블 - 신규 스키마)
  const tableInfo = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='content'").get();

  if (!tableInfo) {
    console.log('❌ content 테이블을 찾을 수 없습니다. automation.ts의 initAutomate()를 실행하세요.');
    process.exit(1);
  }

  console.log('📋 현재 테이블 구조:');
  console.log(tableInfo.sql);

  if (tableInfo.sql.includes('prompt_format')) {
    console.log('✅ 이미 prompt_format 컬럼이 있습니다 (최신 스키마).');
    process.exit(0);
  }

  // 트랜잭션 시작
  db.exec('BEGIN TRANSACTION');

  console.log('📦 1. 기존 데이터 백업 중...');
  db.exec('CREATE TABLE content_backup AS SELECT * FROM content');

  console.log('🗑️ 2. 기존 테이블 삭제 중...');
  db.exec('DROP TABLE content');

  console.log('🔨 3. 새 스키마로 테이블 재생성 중...');
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

  console.log('📥 4. 데이터 복원 중...');
  try {
    db.exec('INSERT INTO content (content_id, user_id, title, original_title, status, error, input_tokens, output_tokens, source_content_id, created_at, updated_at) SELECT content_id, user_id, title, original_title, status, error, input_tokens, output_tokens, source_content_id, created_at, updated_at FROM content_backup');
  } catch (e) {
    console.log('⚠️ 기존 데이터 복원 실패, 빈 테이블 유지:', e.message);
  }

  console.log('🗑️ 5. 백업 테이블 삭제 중...');
  db.exec('DROP TABLE content_backup');

  console.log('🔍 6. 인덱스 재생성 중...');
  db.exec('CREATE INDEX IF NOT EXISTS idx_content_user_id ON content(user_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_content_status ON content(status)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_content_prompt_format ON content(prompt_format)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_content_created_at ON content(created_at)');

  // 트랜잭션 커밋
  db.exec('COMMIT');

  console.log('✅ 마이그레이션 완료!');

  // 결과 확인
  const newTableInfo = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='content'").get();
  console.log('\n📋 새 테이블 구조:');
  console.log(newTableInfo.sql);

} catch (error) {
  console.error('❌ 마이그레이션 실패:', error.message);
  try {
    db.exec('ROLLBACK');
    console.log('🔄 롤백 완료');
  } catch (e) {
    console.error('❌ 롤백 실패:', e.message);
  }
  process.exit(1);
} finally {
  db.close();
}
