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

throw new Error('⛔ DEPRECATED: This SQLite migration script is no longer used. Use migrate-cleanup-task-schedule.sql instead.');

const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'data', 'database.sqlite');
const db = new Database(dbPath);

console.log('=== task_schedule 테이블 정리 ===\n');
console.log('스케줄 테이블은 스케줄 정보만 가져야 함\n');

// 현재 스키마
const schema = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='task_schedule'").get();
console.log('현재 스키마:');
console.log(schema.sql);
console.log('\n');

try {
  db.exec(`
    BEGIN TRANSACTION;

    -- 새로운 task_schedule 테이블 (스케줄 정보만)
    CREATE TABLE task_schedule_new (
      id TEXT PRIMARY KEY,
      task_id TEXT,  -- task 테이블 참조 (어떤 task를 실행할지)
      content_id TEXT,  -- content 테이블 참조 (실행 후 생성된 컨텐츠, 실행 전에는 NULL)
      scheduled_time DATETIME NOT NULL,
      youtube_publish_time DATETIME,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'processing', 'completed', 'failed', 'cancelled', 'waiting_for_upload')),
      error_message TEXT,
      failed_stage TEXT,
      retry_count INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- 데이터 복사 (필요한 컬럼만)
    INSERT INTO task_schedule_new (
      id,
      task_id,
      content_id,
      scheduled_time,
      youtube_publish_time,
      status,
      error_message,
      failed_stage,
      retry_count,
      created_at,
      updated_at
    )
    SELECT
      id,
      task_id,
      content_id,
      scheduled_time,
      youtube_publish_time,
      status,
      COALESCE(error_message, error) as error_message,  -- error_message가 없으면 error 사용
      failed_stage,
      retry_count,
      created_at,
      updated_at
    FROM task_schedule;

    -- 기존 테이블 삭제
    DROP TABLE task_schedule;

    -- 새 테이블을 원래 이름으로 변경
    ALTER TABLE task_schedule_new RENAME TO task_schedule;

    COMMIT;
  `);

  console.log('✅ task_schedule 정리 완료\n');
  console.log('유지된 스케줄 정보:');
  console.log('  - id, task_id, content_id');
  console.log('  - scheduled_time, youtube_publish_time');
  console.log('  - status, error_message, failed_stage, retry_count');
  console.log('  - created_at, updated_at\n');
  console.log('제거된 메타정보 컬럼:');
  console.log('  - title_id');
  console.log('  - user_id');
  console.log('  - youtube_privacy');
  console.log('  - youtube_url');
  console.log('  - channel_setting_id');
  console.log('  - media_mode');
  console.log('  - script_id');
  console.log('  - video_id');
  console.log('  - youtube_upload_id');
  console.log('  - error (error_message로 통합)');
  console.log('  - shortform_task_id');
  console.log('  - parent_youtube_url');
  console.log('  - shortform_uploaded');

} catch (e) {
  console.error('❌ 정리 실패:', e.message);
  db.exec('ROLLBACK');
}

// 변경 후 스키마 확인
const newSchema = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='task_schedule'").get();
console.log('\n변경 후 스키마:');
console.log(newSchema.sql);

// 데이터 확인
const count = db.prepare('SELECT COUNT(*) as cnt FROM task_schedule').get();
console.log(`\n총 ${count.cnt}개 스케줄 유지됨`);

db.close();
