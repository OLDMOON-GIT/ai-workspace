/**
 * ⛔⛔⛔ DEPRECATED - DO NOT USE ⛔⛔⛔
 *
 * 이 스크립트는 SQLite 시절의 마이그레이션입니다.
 * MySQL로 전환 후 더 이상 사용하지 않습니다.
 *
 * task_schedule은 최소화 상태 유지:
 * - schedule_id, task_id, scheduled_time, status, created_at, updated_at만 존재
 * - 다른 컬럼 추가 금지!
 */

throw new Error('⛔ DEPRECATED: This SQLite migration script is no longer used. Use schema-mysql.sql instead.');

const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'data', 'database.sqlite');
const db = new Database(dbPath);

console.log('=== task_schedule 스키마 확인 ===\n');

// 현재 스키마
const schema = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='task_schedule'").get();
console.log('현재 스키마:');
console.log(schema.sql);

console.log('\n=== title_id NULL 허용으로 변경 ===\n');

// SQLite는 컬럼 수정이 안 되므로 테이블 재생성 필요
try {
  db.exec(`
    BEGIN TRANSACTION;

    -- 임시 테이블 생성 (title_id NULL 허용)
    CREATE TABLE task_schedule_new (
      id TEXT PRIMARY KEY,
      task_id TEXT,
      title_id TEXT,  -- NOT NULL 제거
      user_id TEXT,
      scheduled_time DATETIME NOT NULL,
      youtube_publish_time DATETIME,
      youtube_privacy TEXT DEFAULT 'public',
      youtube_url TEXT,
      channel_setting_id TEXT,
      media_mode TEXT DEFAULT 'upload',
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'processing', 'completed', 'failed', 'cancelled', 'waiting_for_upload')),
      script_id TEXT,
      video_id TEXT,
      youtube_upload_id TEXT,
      error TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      shortform_task_id TEXT,
      parent_youtube_url TEXT,
      shortform_uploaded INTEGER DEFAULT 0,
      error_message TEXT,
      failed_stage TEXT,
      retry_count INTEGER DEFAULT 0,
      content_id TEXT
    );

    -- 데이터 복사
    INSERT INTO task_schedule_new
    SELECT * FROM task_schedule;

    -- 기존 테이블 삭제
    DROP TABLE task_schedule;

    -- 새 테이블을 원래 이름으로 변경
    ALTER TABLE task_schedule_new RENAME TO task_schedule;

    COMMIT;
  `);

  console.log('✅ title_id를 NULL 허용으로 변경 완료');
} catch (e) {
  console.error('❌ 변경 실패:', e.message);
  db.exec('ROLLBACK');
}

// 변경 후 스키마 확인
const newSchema = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='task_schedule'").get();
console.log('\n변경 후 스키마:');
console.log(newSchema.sql);

db.close();
