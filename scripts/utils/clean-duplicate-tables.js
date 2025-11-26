/**
 * 중복 테이블 정리 스크립트
 * 단수형/복수형 중복, 오타 테이블 제거
 */

const fs = require('fs');
const path = require('path');

const FRONTEND_PATH = path.join(__dirname, '../../trend-video-frontend');
const Database = require(path.join(FRONTEND_PATH, 'node_modules/better-sqlite3'));
const DB_PATH = path.join(FRONTEND_PATH, 'data/database.sqlite');

// 삭제할 중복 테이블 목록 (올바른 테이블은 남김)
const TABLES_TO_DELETE = [
  // 단수형 (복수형이 정석)
  'task',              // tasks 있음
  'task_log',          // task_logs 있음
  'task_schedule',     // task_schedules 있음
  'task_queue',        // tasks_queue 있음
  'automation_log',    // automation_logs 있음
  'automation_setting',// automation_settings 있음
  'content',           // contents 있음
  'content_log',       // content_logs 있음
  'coupang_product',   // coupang_products 있음
  'user',              // users 있음
  'user_session',      // sessions 있음
  'user_charge_request', // charge_requests 있음
  'youtube_channel_setting', // youtube_channel_settings 있음

  // 잘못된 복수형/오타
  'tasks_logs',        // task_logs가 정석
  'tasks_schedules',   // task_schedules가 정석
  'contents_logs',     // content_logs가 정석
  'user_activity_log', // user_activity_logs가 정석
  'user_content_category', // 사용 안 함
  'user_credit_history',   // credit_history가 정석
  'user_charge_requests',  // charge_requests가 정석
  'user_sessions',         // sessions가 정석

  // 중복/폐기된 테이블
  'product_crawl_link',
  'product_crawl_link_history',
  'product_crawl_link_pending'
];

// 보존할 정석 테이블 목록
const KEEP_TABLES = [
  'users',
  'sessions',
  'jobs',
  'job_logs',
  'scripts',
  'script_logs',
  'scripts_temp',
  'tasks',
  'task_logs',
  'task_schedules',
  'tasks_queue',
  'tasks_locks',
  'contents',
  'content_logs',
  'folders',
  'credit_history',
  'charge_requests',
  'user_activity_logs',
  'settings',
  'automation_logs',
  'automation_settings',
  'automation_config',
  'automation_tasks',
  'automation_pipelines',
  'auto_generation_logs',
  'coupang_products',
  'coupang_crawl_queue',
  'crawl_link_history',
  'crawled_product_links',
  'pending_products',
  'youtube_uploads',
  'youtube_channel_settings',
  'wordpress_settings',
  'wordpress_oauth_tokens',
  'social_media_accounts',
  'social_media_uploads',
  'video_titles',
  'video_categories',
  'title_pool',
  'title_logs',
  'unified_queue',
  'unified_logs',
  'content_metadata',
  'queue_locks',
  'queue_tasks',
  'api_costs',
  'chinese_converter_jobs',
  'chinese_converter_job_logs',
  'shop_versions'
];

function cleanDuplicateTables() {
  console.log('🧹 중복 테이블 정리 시작...\n');

  if (!fs.existsSync(DB_PATH)) {
    console.error('❌ 데이터베이스 파일을 찾을 수 없습니다:', DB_PATH);
    process.exit(1);
  }

  // 백업 생성
  const backupPath = DB_PATH.replace('.sqlite', `.backup.${Date.now()}.sqlite`);
  fs.copyFileSync(DB_PATH, backupPath);
  console.log(`✅ 백업 생성: ${backupPath}\n`);

  const db = new Database(DB_PATH);

  try {
    // 현재 테이블 목록
    const tables = db.prepare(`
      SELECT name FROM sqlite_master
      WHERE type='table' AND name NOT LIKE 'sqlite_%'
      ORDER BY name
    `).all().map(t => t.name);

    console.log(`📊 현재 테이블 개수: ${tables.length}개\n`);

    // 삭제할 테이블 확인
    const toDelete = tables.filter(t => TABLES_TO_DELETE.includes(t));

    if (toDelete.length === 0) {
      console.log('✅ 삭제할 중복 테이블이 없습니다.');
      db.close();
      return;
    }

    console.log(`🗑️ 삭제할 테이블 (${toDelete.length}개):`);
    toDelete.forEach(t => console.log(`  - ${t}`));
    console.log();

    // 각 테이블의 데이터 개수 확인
    console.log('📋 삭제 전 데이터 확인:');
    toDelete.forEach(table => {
      try {
        const count = db.prepare(`SELECT COUNT(*) as count FROM ${table}`).get();
        console.log(`  - ${table}: ${count.count}개 레코드`);
      } catch (e) {
        console.log(`  - ${table}: 오류 (${e.message})`);
      }
    });
    console.log();

    // 테이블 삭제
    console.log('🗑️ 테이블 삭제 중...');
    let deletedCount = 0;
    toDelete.forEach(table => {
      try {
        db.prepare(`DROP TABLE IF EXISTS ${table}`).run();
        console.log(`  ✅ ${table} 삭제 완료`);
        deletedCount++;
      } catch (e) {
        console.log(`  ❌ ${table} 삭제 실패: ${e.message}`);
      }
    });

    console.log(`\n✅ ${deletedCount}개 테이블 삭제 완료\n`);

    // 삭제 후 테이블 목록
    const remainingTables = db.prepare(`
      SELECT name FROM sqlite_master
      WHERE type='table' AND name NOT LIKE 'sqlite_%'
      ORDER BY name
    `).all().map(t => t.name);

    console.log(`📊 정리 후 테이블 개수: ${remainingTables.length}개\n`);

    // 보존된 테이블 목록
    console.log('✅ 보존된 테이블:');
    remainingTables.forEach(t => console.log(`  - ${t}`));

    console.log('\n🎯 정리 완료!');
    console.log(`   삭제: ${deletedCount}개`);
    console.log(`   보존: ${remainingTables.length}개`);
    console.log(`   백업: ${backupPath}`);

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
  cleanDuplicateTables();
}
