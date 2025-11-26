/**
 * 22개 필수 테이블로 복구
 */

const fs = require('fs');
const path = require('path');

const FRONTEND_PATH = path.join(__dirname, '../../trend-video-frontend');
const Database = require(path.join(FRONTEND_PATH, 'node_modules/better-sqlite3'));
const DB_PATH = path.join(FRONTEND_PATH, 'data/database.sqlite');

// 사용자가 지정한 22개 필수 테이블 (단수형)
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

// 복수형 → 단수형 매핑
const TABLE_RENAME_MAP = {
  'users': 'user',
  'sessions': 'user_session',
  'user_sessions': 'user_session',
  'user_activity_logs': 'user_activity_log',
  'credit_history': 'user_credit_history',
  'charge_requests': 'user_charge_request',
  'user_charge_requests': 'user_charge_request',
  'contents': 'content',
  'contents_logs': 'content_log',
  'tasks': 'task',
  'task_schedules': 'task_schedule',
  'tasks_schedules': 'task_schedule',
  'tasks_queue': 'task_queue',
  'tasks_locks': 'task_lock',
  'task_locks': 'task_lock',
  'task_logs': 'task_log',
  'tasks_logs': 'task_log',
  'automation_settings': 'automation_setting',
  'automation_logs': 'automation_log',
  'youtube_channel_settings': 'youtube_channel_setting',
  'coupang_products': 'coupang_product'
};

function restore22Tables() {
  console.log('🔧 22개 필수 테이블로 복구 시작...\n');

  if (!fs.existsSync(DB_PATH)) {
    console.error('❌ 데이터베이스 파일을 찾을 수 없습니다:', DB_PATH);
    process.exit(1);
  }

  // 백업 생성
  const backupPath = DB_PATH.replace('.sqlite', `.backup-before-22.${Date.now()}.sqlite`);
  fs.copyFileSync(DB_PATH, backupPath);
  console.log(`✅ 백업 생성: ${backupPath}\n`);

  const db = new Database(DB_PATH);

  try {
    // 현재 테이블 목록
    const currentTables = db.prepare(`
      SELECT name FROM sqlite_master
      WHERE type='table' AND name NOT LIKE 'sqlite_%'
      ORDER BY name
    `).all().map(t => t.name);

    console.log(`📊 현재 테이블: ${currentTables.length}개\n`);

    // 1. 테이블 이름 변경
    console.log('📝 테이블 이름 변경 중...');
    for (const [oldName, newName] of Object.entries(TABLE_RENAME_MAP)) {
      if (currentTables.includes(oldName) && !currentTables.includes(newName)) {
        try {
          db.prepare(`ALTER TABLE ${oldName} RENAME TO ${newName}`).run();
          console.log(`  ✅ ${oldName} → ${newName}`);
        } catch (e) {
          console.log(`  ⚠️ ${oldName} → ${newName} 실패: ${e.message}`);
        }
      }
    }
    console.log();

    // 최신 테이블 목록 다시 가져오기
    const updatedTables = db.prepare(`
      SELECT name FROM sqlite_master
      WHERE type='table' AND name NOT LIKE 'sqlite_%'
      ORDER BY name
    `).all().map(t => t.name);

    // 2. 누락된 테이블 생성
    console.log('🆕 누락된 테이블 생성 중...');
    const missingTables = REQUIRED_TABLES.filter(t => !updatedTables.includes(t));

    if (missingTables.includes('content_log')) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS content_log (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          content_id TEXT NOT NULL,
          log_message TEXT,
          created_at TEXT DEFAULT (datetime('now'))
        )
      `);
      console.log('  ✅ content_log 생성');
    }

    if (missingTables.includes('user_content_category')) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS user_content_category (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          category TEXT NOT NULL,
          created_at TEXT DEFAULT (datetime('now'))
        )
      `);
      console.log('  ✅ user_content_category 생성');
    }

    if (missingTables.includes('product_crawl_link')) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS product_crawl_link (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          url TEXT NOT NULL,
          status TEXT DEFAULT 'pending',
          created_at TEXT DEFAULT (datetime('now'))
        )
      `);
      console.log('  ✅ product_crawl_link 생성');
    }

    if (missingTables.includes('product_crawl_link_history')) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS product_crawl_link_history (
          id TEXT PRIMARY KEY,
          link_id TEXT NOT NULL,
          action TEXT,
          created_at TEXT DEFAULT (datetime('now'))
        )
      `);
      console.log('  ✅ product_crawl_link_history 생성');
    }

    if (missingTables.includes('product_crawl_link_pending')) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS product_crawl_link_pending (
          id TEXT PRIMARY KEY,
          url TEXT NOT NULL,
          status TEXT DEFAULT 'pending',
          created_at TEXT DEFAULT (datetime('now'))
        )
      `);
      console.log('  ✅ product_crawl_link_pending 생성');
    }
    console.log();

    // 최신 테이블 목록
    const finalTables = db.prepare(`
      SELECT name FROM sqlite_master
      WHERE type='table' AND name NOT LIKE 'sqlite_%'
      ORDER BY name
    `).all().map(t => t.name);

    // 3. 불필요한 테이블 삭제
    console.log('🗑️ 불필요한 테이블 삭제 중...');
    const tablesToDelete = finalTables.filter(t => !REQUIRED_TABLES.includes(t));

    tablesToDelete.forEach(table => {
      try {
        db.prepare(`DROP TABLE IF EXISTS ${table}`).run();
        console.log(`  ✅ ${table} 삭제`);
      } catch (e) {
        console.log(`  ❌ ${table} 삭제 실패: ${e.message}`);
      }
    });
    console.log();

    // 최종 확인
    const remainingTables = db.prepare(`
      SELECT name FROM sqlite_master
      WHERE type='table' AND name NOT LIKE 'sqlite_%'
      ORDER BY name
    `).all().map(t => t.name);

    console.log('✅ 최종 테이블 목록:');
    remainingTables.forEach(t => console.log(`  - ${t}`));
    console.log();

    console.log(`🎯 복구 완료!`);
    console.log(`   최종 테이블 개수: ${remainingTables.length}개`);
    console.log(`   목표 테이블 개수: ${REQUIRED_TABLES.length}개`);
    console.log(`   백업: ${backupPath}`);

    if (remainingTables.length !== REQUIRED_TABLES.length) {
      console.log('\n⚠️ 주의: 테이블 개수가 일치하지 않습니다.');
      const missing = REQUIRED_TABLES.filter(t => !remainingTables.includes(t));
      if (missing.length > 0) {
        console.log('   누락된 테이블:', missing.join(', '));
      }
    }

  } catch (error) {
    console.error('\n❌ 오류 발생:', error);
    console.error('\n🔄 백업에서 복구하려면:');
    console.error(`   copy "${backupPath}" "${DB_PATH}"`);
    process.exit(1);
  } finally {
    db.close();
  }
}

// 실행
if (require.main === module) {
  restore22Tables();
}
