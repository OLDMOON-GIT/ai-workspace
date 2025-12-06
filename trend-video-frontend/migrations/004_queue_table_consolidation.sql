-- =============================================
-- Queue Table Consolidation Migration
-- Date: 2025-11-24
-- Description: 중복된 큐/작업 테이블들을 통합하여 단순화
-- =============================================

-- 1. 통합 큐 테이블 (모든 작업 타입 통합)
CREATE TABLE IF NOT EXISTS unified_queue (
  -- 기본 정보
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK(type IN (
    'script', 'image', 'video', 'youtube',
    'coupang_crawl', 'chinese_converter',
    'shortform', 'longform', 'product', 'sora2'
  )),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN (
    'pending', 'waiting', 'processing',
    'completed', 'failed', 'cancelled',
    'scheduled', 'waiting_for_upload'
  )),

  -- 관계 정보
  user_id TEXT NOT NULL,
  parent_id TEXT, -- 상위 작업 참조 (예: script -> video -> youtube)
  pipeline_id TEXT, -- 파이프라인 그룹 ID

  -- 우선순위 및 스케줄링
  priority INTEGER DEFAULT 0,
  scheduled_at DATETIME,

  -- 타임스탬프
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  started_at DATETIME,
  completed_at DATETIME,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,

  -- 메타데이터 (JSON으로 타입별 특수 정보 저장)
  metadata TEXT, -- JSON: title, format, model, settings 등
  payload TEXT,  -- JSON: 작업 실행에 필요한 데이터
  result TEXT,   -- JSON: 작업 결과 데이터

  -- 에러 및 재시도
  error TEXT,
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,

  -- 실행 정보
  worker_pid INTEGER,
  progress INTEGER DEFAULT 0,

  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (parent_id) REFERENCES unified_queue(id)
);

-- 2. 통합 로그 테이블
CREATE TABLE IF NOT EXISTS unified_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  -- 참조 정보
  entity_id TEXT NOT NULL, -- queue_id, user_id 등
  entity_type TEXT NOT NULL CHECK(entity_type IN (
    'queue', 'pipeline', 'user', 'system', 'automation'
  )),

  -- 로그 정보
  level TEXT NOT NULL CHECK(level IN (
    'debug', 'info', 'warn', 'error', 'fatal'
  )),
  message TEXT NOT NULL,
  details TEXT, -- JSON: 추가 컨텍스트 정보

  -- 타임스탬프
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

  -- 출처 정보
  source TEXT -- 'queue-manager', 'automation', 'api' 등
);

-- 3. 작업 잠금 테이블 (동시성 제어)
CREATE TABLE IF NOT EXISTS queue_locks (
  lock_key TEXT PRIMARY KEY, -- 'type:script', 'pipeline:xxx' 등
  locked_by TEXT, -- queue_id
  locked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME,
  worker_pid INTEGER
);

-- 4. 콘텐츠 메타데이터 테이블 (비디오 제목 등 콘텐츠 정보)
CREATE TABLE IF NOT EXISTS content_metadata (
  id TEXT PRIMARY KEY,
  queue_id TEXT, -- 연결된 큐 작업

  -- 콘텐츠 정보
  title TEXT NOT NULL,
  type TEXT NOT NULL, -- 'shortform', 'longform', 'product' 등
  category TEXT,
  tags TEXT, -- JSON array

  -- 파일 정보
  script_path TEXT,
  video_path TEXT,
  thumbnail_path TEXT,

  -- 외부 참조
  youtube_url TEXT,
  product_url TEXT,

  -- 상태
  published BOOLEAN DEFAULT 0,
  published_at DATETIME,

  -- 메타데이터
  metadata TEXT, -- JSON: 추가 정보

  -- 타임스탬프
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (queue_id) REFERENCES unified_queue(id)
);

-- 5. 자동화 설정 (기존 automation_settings 대체)
CREATE TABLE IF NOT EXISTS automation_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  description TEXT,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 기본 설정 삽입
INSERT OR IGNORE INTO automation_config (key, value, description) VALUES
  ('enabled', 'false', '자동화 활성화 여부'),
  ('check_interval', '60', '체크 간격(초)'),
  ('max_retry', '3', '최대 재시도 횟수'),
  ('default_priority', '0', '기본 우선순위');

-- =============================================
-- 인덱스 생성 (테이블 생성 후)
-- =============================================

-- unified_queue 인덱스
CREATE INDEX IF NOT EXISTS idx_unified_queue_type_status
  ON unified_queue(type, status);
CREATE INDEX IF NOT EXISTS idx_unified_queue_user_status
  ON unified_queue(user_id, status);
CREATE INDEX IF NOT EXISTS idx_unified_queue_pipeline
  ON unified_queue(pipeline_id);
CREATE INDEX IF NOT EXISTS idx_unified_queue_scheduled
  ON unified_queue(scheduled_at)
  WHERE scheduled_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_unified_queue_parent
  ON unified_queue(parent_id)
  WHERE parent_id IS NOT NULL;

-- unified_logs 인덱스
CREATE INDEX IF NOT EXISTS idx_unified_logs_entity
  ON unified_logs(entity_id, entity_type);
CREATE INDEX IF NOT EXISTS idx_unified_logs_level
  ON unified_logs(level);
CREATE INDEX IF NOT EXISTS idx_unified_logs_created
  ON unified_logs(created_at DESC);

-- content_metadata 인덱스
CREATE INDEX IF NOT EXISTS idx_content_metadata_queue
  ON content_metadata(queue_id);
CREATE INDEX IF NOT EXISTS idx_content_metadata_published
  ON content_metadata(published);

-- =============================================
-- 데이터 마이그레이션
-- =============================================

-- tasks_queue 데이터 마이그레이션
INSERT INTO unified_queue (
  id, type, status, user_id, priority,
  created_at, started_at, completed_at,
  metadata, error, retry_count, max_retries
)
SELECT
  task_id, type, status, user_id, priority,
  created_at, started_at, completed_at,
  json_object(
    'metadata', metadata,
    'logs', logs
  ),
  error, retry_count, max_retries
FROM tasks_queue
WHERE NOT EXISTS (
  SELECT 1 FROM unified_queue WHERE id = tasks_queue.task_id
);

-- jobs/contents 테이블 데이터 마이그레이션
INSERT INTO unified_queue (
  id, type, status, user_id, priority,
  created_at, started_at, completed_at,
  metadata, error, worker_pid, progress
)
SELECT
  id,
  CASE
    WHEN type = 'script' THEN 'script'
    WHEN type = 'video' AND format IS NOT NULL THEN format
    WHEN type = 'video' THEN 'video'
    ELSE COALESCE(format, type, 'script')
  END,
  status, user_id, 0,
  created_at,
  CASE WHEN status IN ('processing', 'completed', 'failed')
    THEN updated_at
    ELSE NULL
  END,
  CASE WHEN status IN ('completed', 'failed')
    THEN updated_at
    ELSE NULL
  END,
  json_object(
    'title', title,
    'original_title', original_title,
    'content', content,
    'video_path', video_path,
    'thumbnail_path', thumbnail_path,
    'model', model,
    'category', category,
    'input_tokens', input_tokens,
    'output_tokens', output_tokens
  ),
  error, pid, progress
FROM contents
WHERE NOT EXISTS (
  SELECT 1 FROM unified_queue WHERE id = contents.id
);

-- coupang_crawl_queue 데이터 마이그레이션
INSERT INTO unified_queue (
  id, type, status, user_id, priority,
  created_at, completed_at,
  metadata, error, retry_count, max_retries
)
SELECT
  id, 'coupang_crawl', status, user_id, 0,
  created_at, processed_at,
  json_object(
    'product_url', product_url,
    'product_info', product_info,
    'custom_category', custom_category,
    'timeout_seconds', timeout_seconds
  ),
  error_message, retry_count, max_retries
FROM coupang_crawl_queue
WHERE NOT EXISTS (
  SELECT 1 FROM unified_queue WHERE id = coupang_crawl_queue.id
);

-- chinese_converter_jobs 데이터 마이그레이션
INSERT INTO unified_queue (
  id, type, status, user_id, progress,
  created_at, updated_at,
  metadata, error
)
SELECT
  id, 'chinese_converter',
  COALESCE(status, 'pending'),
  user_id, progress,
  created_at, updated_at,
  json_object(
    'title', title,
    'video_path', video_path,
    'output_path', output_path
  ),
  error
FROM chinese_converter_jobs
WHERE NOT EXISTS (
  SELECT 1 FROM unified_queue WHERE id = chinese_converter_jobs.id
);

-- video_titles 데이터를 content_metadata로 마이그레이션
INSERT INTO content_metadata (
  id, title, type, category, tags,
  metadata, created_at, updated_at
)
SELECT
  id, title, type, category, tags,
  json_object(
    'product_url', product_url,
    'status', status,
    'priority', priority,
    'channel', channel,
    'script_mode', script_mode,
    'media_mode', media_mode,
    'youtube_schedule', youtube_schedule,
    'model', model,
    'product_data', product_data
  ),
  created_at, updated_at
FROM video_titles
WHERE NOT EXISTS (
  SELECT 1 FROM content_metadata WHERE id = video_titles.id
);

-- 로그 데이터 마이그레이션
-- job_logs -> unified_logs
INSERT INTO unified_logs (entity_id, entity_type, level, message, created_at, source)
SELECT job_id, 'queue', 'info', log_message, created_at, 'job'
FROM job_logs;

-- content_logs -> unified_logs
INSERT INTO unified_logs (entity_id, entity_type, level, message, created_at, source)
SELECT content_id, 'queue', 'info', log_message, created_at, 'content'
FROM content_logs;

-- automation_logs -> unified_logs
INSERT INTO unified_logs (entity_id, entity_type, level, message, details, created_at, source)
SELECT
  pipeline_id, 'pipeline',
  COALESCE(log_level, level, 'info'),
  COALESCE(message, 'No message'), details, created_at, 'automation'
FROM automation_logs
WHERE message IS NOT NULL OR details IS NOT NULL;

-- title_logs -> unified_logs
INSERT INTO unified_logs (entity_id, entity_type, level, message, created_at, source)
SELECT title_id, 'queue', level, message, created_at, 'title'
FROM title_logs;

-- =============================================
-- 기존 테이블 이름 변경 (백업용)
-- =============================================

ALTER TABLE tasks_queue RENAME TO tasks_queue_old;
ALTER TABLE jobs RENAME TO jobs_old;
ALTER TABLE contents RENAME TO contents_old;
ALTER TABLE coupang_crawl_queue RENAME TO coupang_crawl_queue_old;
ALTER TABLE chinese_converter_jobs RENAME TO chinese_converter_jobs_old;
ALTER TABLE video_titles RENAME TO video_titles_old;

ALTER TABLE job_logs RENAME TO job_logs_old;
ALTER TABLE content_logs RENAME TO content_logs_old;
ALTER TABLE automation_logs RENAME TO automation_logs_old;
ALTER TABLE title_logs RENAME TO title_logs_old;
ALTER TABLE chinese_converter_job_logs RENAME TO chinese_converter_job_logs_old;

-- 작업 관리용 tasks 테이블도 이름 변경
ALTER TABLE tasks RENAME TO tasks_admin_old;
ALTER TABLE task_logs RENAME TO task_logs_admin_old;

-- =============================================
-- 뷰 생성 (하위 호환성)
-- =============================================

-- tasks_queue 호환 뷰
CREATE VIEW tasks_queue AS
SELECT
  id as task_id,
  type,
  status,
  priority,
  created_at,
  started_at,
  completed_at,
  user_id,
  json_extract(metadata, '$.metadata') as metadata,
  json_extract(metadata, '$.logs') as logs,
  error,
  retry_count,
  max_retries
FROM unified_queue
WHERE type IN ('script', 'image', 'video', 'youtube');

-- contents 호환 뷰
CREATE VIEW contents AS
SELECT
  q.id,
  q.user_id,
  q.type,
  json_extract(q.metadata, '$.format') as format,
  json_extract(q.metadata, '$.title') as title,
  json_extract(q.metadata, '$.original_title') as original_title,
  json_extract(q.metadata, '$.content') as content,
  q.status,
  q.progress,
  q.error,
  q.worker_pid as pid,
  json_extract(q.metadata, '$.video_path') as video_path,
  json_extract(q.metadata, '$.thumbnail_path') as thumbnail_path,
  CASE WHEN c.published THEN 1 ELSE 0 END as published,
  c.published_at,
  json_extract(q.metadata, '$.input_tokens') as input_tokens,
  json_extract(q.metadata, '$.output_tokens') as output_tokens,
  0 as use_claude_local,
  json_extract(q.metadata, '$.model') as model,
  json_extract(q.metadata, '$.category') as category,
  q.created_at,
  q.updated_at
FROM unified_queue q
LEFT JOIN content_metadata c ON q.id = c.queue_id
WHERE q.type IN ('script', 'shortform', 'longform', 'product', 'sora2');