-- =============================================
-- Remove Remaining Foreign Keys from Old Tables
-- Date: 2025-11-24
-- Description: 아직 외래키가 남아있는 old 테이블들의 외래키 제거
-- =============================================

-- ========== 1. job_logs_old 테이블 ==========
CREATE TABLE IF NOT EXISTS job_logs_old_temp AS SELECT * FROM job_logs_old;
DROP TABLE IF EXISTS job_logs_old;

CREATE TABLE IF NOT EXISTS job_logs_old (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id TEXT NOT NULL,
  log_message TEXT,
  created_at TEXT DEFAULT (datetime('now'))
  -- FOREIGN KEY 제거됨
);

INSERT OR IGNORE INTO job_logs_old SELECT * FROM job_logs_old_temp;
DROP TABLE job_logs_old_temp;

-- ========== 2. task_logs_admin_old 테이블 ==========
CREATE TABLE IF NOT EXISTS task_logs_admin_old_temp AS SELECT * FROM task_logs_admin_old;
DROP TABLE IF EXISTS task_logs_admin_old;

CREATE TABLE IF NOT EXISTS task_logs_admin_old (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id TEXT NOT NULL,
  log_message TEXT,
  created_at TEXT DEFAULT (datetime('now'))
  -- FOREIGN KEY 제거됨
);

INSERT OR IGNORE INTO task_logs_admin_old SELECT * FROM task_logs_admin_old_temp;
DROP TABLE task_logs_admin_old_temp;

-- ========== 3. chinese_converter_job_logs_old 테이블 ==========
CREATE TABLE IF NOT EXISTS chinese_converter_job_logs_old_temp AS SELECT * FROM chinese_converter_job_logs_old;
DROP TABLE IF EXISTS chinese_converter_job_logs_old;

CREATE TABLE IF NOT EXISTS chinese_converter_job_logs_old (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id TEXT NOT NULL,
  log_message TEXT,
  created_at TEXT DEFAULT (datetime('now'))
  -- FOREIGN KEY 제거됨
);

INSERT OR IGNORE INTO chinese_converter_job_logs_old SELECT * FROM chinese_converter_job_logs_old_temp;
DROP TABLE chinese_converter_job_logs_old_temp;

-- ========== 4. contents_old 테이블 ==========
CREATE TABLE IF NOT EXISTS contents_old_temp AS SELECT * FROM contents_old;
DROP TABLE IF EXISTS contents_old;

CREATE TABLE IF NOT EXISTS contents_old (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('script', 'video')),
  format TEXT CHECK(format IN ('longform', 'shortform', 'sora2', 'product', 'product-info')),
  title TEXT NOT NULL,
  original_title TEXT,
  content TEXT,
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'processing', 'completed', 'failed')),
  progress INTEGER DEFAULT 0,
  error TEXT,
  pid INTEGER,
  video_path TEXT,
  thumbnail_path TEXT,
  published INTEGER DEFAULT 0,
  published_at TEXT,
  input_tokens INTEGER,
  output_tokens INTEGER,
  use_claude_local INTEGER DEFAULT 0,
  source_content_id TEXT,
  conversion_type TEXT,
  is_regenerated INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  model TEXT,
  product_info TEXT,
  category TEXT
  -- FOREIGN KEY to users 제거됨
);

INSERT OR IGNORE INTO contents_old SELECT * FROM contents_old_temp;
DROP TABLE contents_old_temp;

-- ========== 5. title_logs_old 테이블 ==========
CREATE TABLE IF NOT EXISTS title_logs_old_temp AS SELECT * FROM title_logs_old;
DROP TABLE IF EXISTS title_logs_old;

CREATE TABLE IF NOT EXISTS title_logs_old (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title_id TEXT NOT NULL,
  level TEXT NOT NULL CHECK(level IN ('info', 'warn', 'error', 'debug')),
  message TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  -- FOREIGN KEY 제거됨
);

INSERT OR IGNORE INTO title_logs_old SELECT * FROM title_logs_old_temp;
DROP TABLE title_logs_old_temp;

-- ========== 인덱스 재생성 ==========
CREATE INDEX IF NOT EXISTS idx_job_logs_old_job_id ON job_logs_old(job_id);
CREATE INDEX IF NOT EXISTS idx_task_logs_admin_old_task_id ON task_logs_admin_old(task_id);
CREATE INDEX IF NOT EXISTS idx_chinese_converter_job_logs_old_job_id ON chinese_converter_job_logs_old(job_id);
CREATE INDEX IF NOT EXISTS idx_contents_old_user_id ON contents_old(user_id);
CREATE INDEX IF NOT EXISTS idx_contents_old_status ON contents_old(status);
CREATE INDEX IF NOT EXISTS idx_title_logs_old_title_id ON title_logs_old(title_id);

-- ========== 완료 메시지 ==========
-- 모든 old 테이블의 외래키가 완전히 제거되었습니다.