-- =============================================
-- Remove Foreign Keys from Old Tables
-- Date: 2025-11-24
-- Description: old 테이블들의 모든 외래키 제약 제거
-- =============================================

-- SQLite는 ALTER TABLE로 FOREIGN KEY를 직접 제거할 수 없으므로
-- 외래키가 있는 테이블들을 재생성해야 합니다

-- ========== 1. scripts_old 테이블 ==========
-- 기존 데이터 백업
CREATE TABLE IF NOT EXISTS scripts_old_temp AS SELECT * FROM scripts_old;

-- 기존 테이블 삭제
DROP TABLE IF EXISTS scripts_old;

-- 외래키 없이 재생성
CREATE TABLE IF NOT EXISTS scripts_old (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT,
  status TEXT DEFAULT 'pending',
  progress INTEGER DEFAULT 0,
  error TEXT,
  input_tokens INTEGER,
  output_tokens INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  published INTEGER DEFAULT 0,
  published_at DATETIME,
  use_claude_local INTEGER DEFAULT 0,
  model TEXT,
  category TEXT
  -- FOREIGN KEY 제거됨
);

-- 데이터 복원
INSERT OR IGNORE INTO scripts_old SELECT * FROM scripts_old_temp;
DROP TABLE scripts_old_temp;

-- ========== 2. jobs_old 테이블 ==========
CREATE TABLE IF NOT EXISTS jobs_old_temp AS SELECT * FROM jobs_old;
DROP TABLE IF EXISTS jobs_old;

CREATE TABLE IF NOT EXISTS jobs_old (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  progress INTEGER DEFAULT 0,
  step TEXT,
  title TEXT,
  type TEXT,
  video_url TEXT,
  video_path TEXT,
  thumbnail_path TEXT,
  error TEXT,
  pid INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  source_content_id TEXT,
  converted_from_job_id TEXT,
  prompt TEXT,
  tts_voice TEXT,
  category TEXT
  -- FOREIGN KEY 제거됨
);

INSERT OR IGNORE INTO jobs_old SELECT * FROM jobs_old_temp;
DROP TABLE jobs_old_temp;

-- ========== 3. image_queue_old 테이블 ==========
CREATE TABLE IF NOT EXISTS image_queue_old_temp AS SELECT * FROM image_queue_old;
DROP TABLE IF EXISTS image_queue_old;

CREATE TABLE IF NOT EXISTS image_queue_old (
  id TEXT PRIMARY KEY,
  content_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  prompt TEXT NOT NULL,
  scene_index INTEGER NOT NULL,
  total_scenes INTEGER NOT NULL,
  status TEXT DEFAULT 'pending',
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  error TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  processed_at DATETIME,
  priority INTEGER DEFAULT 0
  -- FOREIGN KEY 제거됨
);

INSERT OR IGNORE INTO image_queue_old SELECT * FROM image_queue_old_temp;
DROP TABLE image_queue_old_temp;

-- ========== 4. youtube_upload_queue_old 테이블 ==========
CREATE TABLE IF NOT EXISTS youtube_upload_queue_old_temp AS SELECT * FROM youtube_upload_queue_old;
DROP TABLE IF EXISTS youtube_upload_queue_old;

CREATE TABLE IF NOT EXISTS youtube_upload_queue_old (
  id TEXT PRIMARY KEY,
  content_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  video_path TEXT NOT NULL,
  thumbnail_path TEXT,
  title TEXT NOT NULL,
  description TEXT,
  tags TEXT,
  status TEXT DEFAULT 'pending',
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  youtube_url TEXT,
  youtube_video_id TEXT,
  error TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  uploaded_at DATETIME,
  priority INTEGER DEFAULT 0,
  category TEXT
  -- FOREIGN KEY 제거됨
);

INSERT OR IGNORE INTO youtube_upload_queue_old SELECT * FROM youtube_upload_queue_old_temp;
DROP TABLE youtube_upload_queue_old_temp;

-- ========== 5. coupang_crawl_queue_old 테이블 ==========
CREATE TABLE IF NOT EXISTS coupang_crawl_queue_old_temp AS SELECT * FROM coupang_crawl_queue_old;
DROP TABLE IF EXISTS coupang_crawl_queue_old;

CREATE TABLE IF NOT EXISTS coupang_crawl_queue_old (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  product_url TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  timeout_seconds INTEGER DEFAULT 30,
  error_message TEXT,
  product_info TEXT,
  custom_category TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  processed_at DATETIME
  -- FOREIGN KEY 제거됨
);

INSERT OR IGNORE INTO coupang_crawl_queue_old SELECT * FROM coupang_crawl_queue_old_temp;
DROP TABLE coupang_crawl_queue_old_temp;

-- ========== 6. chinese_converter_jobs_old 테이블 ==========
CREATE TABLE IF NOT EXISTS chinese_converter_jobs_old_temp AS SELECT * FROM chinese_converter_jobs_old;
DROP TABLE IF EXISTS chinese_converter_jobs_old;

CREATE TABLE IF NOT EXISTS chinese_converter_jobs_old (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  progress INTEGER DEFAULT 0,
  video_path TEXT,
  output_path TEXT,
  error TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  -- FOREIGN KEY 제거됨
);

INSERT OR IGNORE INTO chinese_converter_jobs_old SELECT * FROM chinese_converter_jobs_old_temp;
DROP TABLE chinese_converter_jobs_old_temp;

-- ========== 7. video_titles_old 테이블 ==========
CREATE TABLE IF NOT EXISTS video_titles_old_temp AS SELECT * FROM video_titles_old;
DROP TABLE IF EXISTS video_titles_old;

CREATE TABLE IF NOT EXISTS video_titles_old (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  type TEXT DEFAULT 'longform',
  category TEXT,
  tags TEXT,
  product_url TEXT,
  status TEXT DEFAULT 'pending',
  priority INTEGER DEFAULT 0,
  user_id TEXT NOT NULL,
  channel TEXT,
  script_mode TEXT DEFAULT 'auto',
  media_mode TEXT DEFAULT 'auto',
  youtube_schedule TEXT,
  model TEXT,
  product_data TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  -- FOREIGN KEY 제거됨
);

INSERT OR IGNORE INTO video_titles_old SELECT * FROM video_titles_old_temp;
DROP TABLE video_titles_old_temp;

-- ========== 8. task_schedules_old 테이블 (있는 경우) ==========
-- task_schedules_old가 존재하는 경우 처리
CREATE TABLE IF NOT EXISTS task_schedules_old_temp AS
SELECT * FROM task_schedules_old
WHERE EXISTS (SELECT 1 FROM sqlite_master WHERE type='table' AND name='task_schedules_old');

DROP TABLE IF EXISTS task_schedules_old;

-- task_schedules_old가 있었다면 재생성
CREATE TABLE IF NOT EXISTS task_schedules_old (
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
  status TEXT DEFAULT 'pending',
  script_id TEXT,
  video_id TEXT,
  youtube_upload_id TEXT,
  shortform_task_id TEXT,
  parent_youtube_url TEXT,
  shortform_uploaded INTEGER DEFAULT 0,
  error TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  -- FOREIGN KEY 제거됨
);

-- 데이터가 있었다면 복원
INSERT OR IGNORE INTO task_schedules_old
SELECT * FROM task_schedules_old_temp
WHERE EXISTS (SELECT 1 FROM task_schedules_old_temp);

DROP TABLE IF EXISTS task_schedules_old_temp;

-- ========== 9. content_logs_old 테이블 ==========
CREATE TABLE IF NOT EXISTS content_logs_old_temp AS SELECT * FROM content_logs_old;
DROP TABLE IF EXISTS content_logs_old;

CREATE TABLE IF NOT EXISTS content_logs_old (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  content_id TEXT NOT NULL,
  log_message TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  -- FOREIGN KEY 제거됨
);

INSERT OR IGNORE INTO content_logs_old SELECT * FROM content_logs_old_temp;
DROP TABLE content_logs_old_temp;

-- ========== 10. tasks_old 테이블 ==========
-- tasks_old가 존재하는 경우 처리
CREATE TABLE IF NOT EXISTS tasks_old_temp AS
SELECT * FROM tasks_old
WHERE EXISTS (SELECT 1 FROM sqlite_master WHERE type='table' AND name='tasks_old');

DROP TABLE IF EXISTS tasks_old;

CREATE TABLE IF NOT EXISTS tasks_old (
  id TEXT PRIMARY KEY,
  content TEXT NOT NULL,
  status TEXT DEFAULT 'todo',
  priority INTEGER DEFAULT 0,
  logs TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME
  -- FOREIGN KEY 제거됨
);

INSERT OR IGNORE INTO tasks_old
SELECT * FROM tasks_old_temp
WHERE EXISTS (SELECT 1 FROM tasks_old_temp);

DROP TABLE IF EXISTS tasks_old_temp;

-- ========== 인덱스 재생성 ==========
-- 외래키는 제거했지만 성능을 위해 인덱스는 유지

CREATE INDEX IF NOT EXISTS idx_scripts_old_user_id ON scripts_old(user_id);
CREATE INDEX IF NOT EXISTS idx_scripts_old_status ON scripts_old(status);

CREATE INDEX IF NOT EXISTS idx_jobs_old_user_id ON jobs_old(user_id);
CREATE INDEX IF NOT EXISTS idx_jobs_old_status ON jobs_old(status);

CREATE INDEX IF NOT EXISTS idx_image_queue_old_content_id ON image_queue_old(content_id);
CREATE INDEX IF NOT EXISTS idx_image_queue_old_status ON image_queue_old(status);

CREATE INDEX IF NOT EXISTS idx_youtube_upload_queue_old_content_id ON youtube_upload_queue_old(content_id);
CREATE INDEX IF NOT EXISTS idx_youtube_upload_queue_old_status ON youtube_upload_queue_old(status);

CREATE INDEX IF NOT EXISTS idx_coupang_crawl_queue_old_user_id ON coupang_crawl_queue_old(user_id);
CREATE INDEX IF NOT EXISTS idx_coupang_crawl_queue_old_status ON coupang_crawl_queue_old(status);

CREATE INDEX IF NOT EXISTS idx_chinese_converter_jobs_old_user_id ON chinese_converter_jobs_old(user_id);
CREATE INDEX IF NOT EXISTS idx_chinese_converter_jobs_old_status ON chinese_converter_jobs_old(status);

CREATE INDEX IF NOT EXISTS idx_video_titles_old_user_id ON video_titles_old(user_id);
CREATE INDEX IF NOT EXISTS idx_video_titles_old_status ON video_titles_old(status);

-- ========== 완료 메시지 ==========
-- 모든 old 테이블의 외래키가 제거되었습니다.
-- 이제 old 테이블들은 독립적으로 작동하며,
-- 참조 무결성 검사로 인한 오류가 발생하지 않습니다.