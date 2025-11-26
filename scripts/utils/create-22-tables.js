/**
 * 22개 필수 테이블 생성 (schema-sqlite.sql 실행)
 */

const fs = require('fs');
const path = require('path');

const FRONTEND_PATH = path.join(__dirname, '../../trend-video-frontend');
const Database = require(path.join(FRONTEND_PATH, 'node_modules/better-sqlite3'));
const DB_PATH = path.join(FRONTEND_PATH, 'data/database.sqlite');
const SCHEMA_PATH = path.join(FRONTEND_PATH, 'schema-sqlite.sql');

function create22Tables() {
  console.log('🔧 22개 필수 테이블 생성 시작...\n');

  if (!fs.existsSync(DB_PATH)) {
    console.error('❌ 데이터베이스 파일을 찾을 수 없습니다:', DB_PATH);
    process.exit(1);
  }

  if (!fs.existsSync(SCHEMA_PATH)) {
    console.error('❌ schema-sqlite.sql 파일을 찾을 수 없습니다:', SCHEMA_PATH);
    process.exit(1);
  }

  const db = new Database(DB_PATH);

  try {
    // 스키마 파일 읽기
    const schema = fs.readFileSync(SCHEMA_PATH, 'utf-8');
    console.log('📄 schema-sqlite.sql 읽기 완료\n');

    // 스키마 실행
    console.log('🔄 스키마 실행 중...');
    db.exec(schema);
    console.log('✅ 스키마 실행 완료\n');

    // 생성된 테이블 확인
    const tables = db.prepare(`
      SELECT name FROM sqlite_master
      WHERE type='table' AND name NOT LIKE 'sqlite_%'
      ORDER BY name
    `).all().map(t => t.name);

    console.log(`📊 현재 테이블 개수: ${tables.length}개\n`);
    console.log('✅ 생성된 테이블:');
    tables.forEach(t => console.log(`  - ${t}`));

  } catch (error) {
    console.error('\n❌ 오류 발생:', error);
    process.exit(1);
  } finally {
    db.close();
  }
}

// 실행
if (require.main === module) {
  create22Tables();
}

module.exports = { create22Tables };
