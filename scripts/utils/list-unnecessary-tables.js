/**
 * 불필요한 테이블 목록 조회
 */

const fs = require('fs');
const path = require('path');

const FRONTEND_PATH = path.join(__dirname, '../../trend-video-frontend');
const Database = require(path.join(FRONTEND_PATH, 'node_modules/better-sqlite3'));
const DB_PATH = path.join(FRONTEND_PATH, 'data/database.sqlite');

// 22개 필수 테이블 (단수형)
const REQUIRED_TABLES = [
  'user',
  'user_session',
  'user_activity_log',
  'user_credit_history',
  'user_charge_request',
  'content',
  'content_log',
  'task',
  'task_schedule',
  'task_queue',
  'task_lock',
  'task_log',
  'automation_setting',
  'automation_log',
  'youtube_channel_setting',
  'user_content_category',
  'title_pool',
  'coupang_product',
  'coupang_crawl_queue',
  'product_crawl_link',
  'product_crawl_link_history',
  'product_crawl_link_pending'
];

function listUnnecessaryTables() {
  console.log('🔍 불필요한 테이블 검사 중...\n');

  if (!fs.existsSync(DB_PATH)) {
    console.error('❌ 데이터베이스 파일을 찾을 수 없습니다:', DB_PATH);
    process.exit(1);
  }

  const db = new Database(DB_PATH);

  try {
    // 현재 테이블 목록
    const allTables = db.prepare(`
      SELECT name FROM sqlite_master
      WHERE type='table' AND name NOT LIKE 'sqlite_%'
      ORDER BY name
    `).all().map(t => t.name);

    console.log(`📊 전체 테이블 개수: ${allTables.length}개\n`);

    // 불필요한 테이블 찾기
    const unnecessaryTables = allTables.filter(t => !REQUIRED_TABLES.includes(t));

    if (unnecessaryTables.length === 0) {
      console.log('✅ 불필요한 테이블이 없습니다. 22개 필수 테이블만 존재합니다.');
      db.close();
      return;
    }

    console.log(`🗑️  불필요한 테이블 (${unnecessaryTables.length}개):\n`);

    // 각 테이블의 데이터 개수 확인
    unnecessaryTables.forEach((table, index) => {
      try {
        const count = db.prepare(`SELECT COUNT(*) as count FROM ${table}`).get();
        console.log(`${index + 1}. ${table} (${count.count}개 레코드)`);
      } catch (e) {
        console.log(`${index + 1}. ${table} (오류: ${e.message})`);
      }
    });

    console.log(`\n📋 요약:`);
    console.log(`   필수 테이블: ${REQUIRED_TABLES.length}개`);
    console.log(`   불필요한 테이블: ${unnecessaryTables.length}개`);
    console.log(`   전체 테이블: ${allTables.length}개`);

    // 삭제 명령어 생성
    console.log(`\n💡 삭제 스크립트:`);
    console.log(`   node scripts/utils/delete-unnecessary-tables.js`);

  } catch (error) {
    console.error('\n❌ 오류 발생:', error);
    process.exit(1);
  } finally {
    db.close();
  }
}

// 실행
if (require.main === module) {
  listUnnecessaryTables();
}

module.exports = { listUnnecessaryTables };
