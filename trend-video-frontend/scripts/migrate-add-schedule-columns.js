/**
 * ⛔⛔⛔ DEPRECATED - DO NOT USE ⛔⛔⛔
 *
 * 이 스크립트는 SQLite 시절의 마이그레이션입니다.
 * MySQL로 전환 후 더 이상 사용하지 않습니다.
 *
 * task_schedule은 최소화 상태 유지:
 * - schedule_id, task_id, scheduled_time, status, created_at, updated_at만 존재
 * - 다른 컬럼 추가 금지!
 *
 * Original description:
 * task_schedule 테이블에 누락된 컬럼 추가
 *
 * 추가할 컬럼:
 * - channel_setting_id: 채널 설정 ID
 * - youtube_url: 업로드된 YouTube URL
 */

throw new Error('⛔ DEPRECATED: This SQLite migration script is no longer used. Use schema-mysql.sql instead.');

const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(process.cwd(), 'data', 'database.sqlite');

function migrateScheduleColumns() {
  const db = new Database(dbPath);

  try {
    console.log('🚀 task_schedule 컬럼 추가 마이그레이션 시작');

    // 현재 스키마 확인
    const columns = db.prepare('PRAGMA table_info(task_schedule)').all();
    const columnNames = columns.map(c => c.name);

    console.log('📋 현재 컬럼:', columnNames.join(', '));

    // channel_setting_id 추가
    if (!columnNames.includes('channel_setting_id')) {
      console.log('➕ channel_setting_id 컬럼 추가 중...');
      db.exec(`
        ALTER TABLE task_schedule ADD COLUMN channel_setting_id TEXT;
      `);
      console.log('✅ channel_setting_id 추가 완료');
    } else {
      console.log('✓ channel_setting_id 이미 존재');
    }

    // youtube_url 추가
    if (!columnNames.includes('youtube_url')) {
      console.log('➕ youtube_url 컬럼 추가 중...');
      db.exec(`
        ALTER TABLE task_schedule ADD COLUMN youtube_url TEXT;
      `);
      console.log('✅ youtube_url 추가 완료');
    } else {
      console.log('✓ youtube_url 이미 존재');
    }

    // 최종 스키마 확인
    const finalColumns = db.prepare('PRAGMA table_info(task_schedule)').all();
    console.log('\n📊 최종 스키마:');
    finalColumns.forEach(c => {
      console.log(`   - ${c.name} ${c.type}`);
    });

    console.log('\n✅ 마이그레이션 완료!');

  } catch (error) {
    console.error('❌ 마이그레이션 실패:', error);
    throw error;
  } finally {
    db.close();
  }
}

// 실행
if (require.main === module) {
  migrateScheduleColumns();
}

module.exports = { migrateScheduleColumns };
