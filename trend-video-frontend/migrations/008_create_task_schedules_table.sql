-- =============================================
-- Create task_schedules Table
-- Date: 2025-11-24
-- Description: task_schedules를 실제 테이블로 생성 (뷰 대신)
-- =============================================

-- 기존 뷰 삭제
DROP VIEW IF EXISTS task_schedules;

-- task_schedules 테이블 생성
CREATE TABLE IF NOT EXISTS task_schedules (
  id TEXT PRIMARY KEY,
  task_id TEXT,
  title_id TEXT,
  user_id TEXT,
  scheduled_time DATETIME NOT NULL,
  youtube_publish_time DATETIME,
  youtube_privacy TEXT DEFAULT 'public',
  youtube_url TEXT,
  channel_setting_id TEXT,
  media_mode TEXT DEFAULT 'upload',
  status TEXT DEFAULT 'pending' CHECK(status IN (
    'pending', 'processing', 'completed', 'failed',
    'cancelled', 'waiting_for_upload'
  )),
  script_id TEXT,
  video_id TEXT,
  youtube_upload_id TEXT,
  shortform_task_id TEXT,
  parent_youtube_url TEXT,
  shortform_uploaded INTEGER DEFAULT 0,
  error TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_task_schedules_task_id ON task_schedules(task_id);
CREATE INDEX IF NOT EXISTS idx_task_schedules_title_id ON task_schedules(title_id);
CREATE INDEX IF NOT EXISTS idx_task_schedules_status ON task_schedules(status);
CREATE INDEX IF NOT EXISTS idx_task_schedules_scheduled ON task_schedules(scheduled_time);

-- 기존 task_schedules_old 데이터가 있다면 마이그레이션
INSERT OR IGNORE INTO task_schedules
SELECT * FROM task_schedules_old
WHERE EXISTS (SELECT 1 FROM sqlite_master WHERE type='table' AND name='task_schedules_old');