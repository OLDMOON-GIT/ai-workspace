-- =============================================
-- Restore contents as a Real Table
-- Date: 2025-11-24
-- Description: contents를 뷰에서 실제 테이블로 복원
-- =============================================

-- 1. 현재 뷰에서 데이터 백업
CREATE TABLE contents_new AS
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
  COALESCE(json_extract(q.metadata, '$.use_claude_local'), 0) as use_claude_local,
  json_extract(q.metadata, '$.model') as model,
  json_extract(q.metadata, '$.product_info') as product_info,
  json_extract(q.metadata, '$.category') as category,
  json_extract(q.metadata, '$.source_content_id') as source_content_id,
  json_extract(q.metadata, '$.conversion_type') as conversion_type,
  json_extract(q.metadata, '$.is_regenerated') as is_regenerated,
  q.created_at,
  q.updated_at
FROM unified_queue q
LEFT JOIN content_metadata c ON q.id = c.queue_id
WHERE q.type IN ('script', 'shortform', 'longform', 'product', 'sora2', 'video');

-- 2. 기존 뷰 삭제
DROP VIEW IF EXISTS contents;

-- 3. 실제 contents 테이블 생성
CREATE TABLE contents (
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
  model TEXT,
  product_info TEXT,
  category TEXT,
  source_content_id TEXT,
  conversion_type TEXT,
  is_regenerated INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- 4. 데이터 복원
INSERT INTO contents
SELECT
  id,
  user_id,
  CASE
    WHEN type IN ('shortform', 'longform', 'product', 'sora2') THEN 'video'
    ELSE type
  END as type,
  format,
  title,
  original_title,
  content,
  status,
  progress,
  error,
  pid,
  video_path,
  thumbnail_path,
  published,
  published_at,
  input_tokens,
  output_tokens,
  use_claude_local,
  model,
  product_info,
  category,
  source_content_id,
  conversion_type,
  is_regenerated,
  created_at,
  updated_at
FROM contents_new;

-- 5. 임시 테이블 삭제
DROP TABLE contents_new;

-- 6. 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_contents_user_id ON contents(user_id);
CREATE INDEX IF NOT EXISTS idx_contents_status ON contents(status);
CREATE INDEX IF NOT EXISTS idx_contents_type ON contents(type);
CREATE INDEX IF NOT EXISTS idx_contents_created_at ON contents(created_at);

-- 7. content.ts가 contents 테이블을 직접 사용하도록 하되,
--    unified_queue와 동기화하는 트리거 생성

-- INSERT 트리거: contents에 삽입 시 unified_queue에도 삽입
CREATE TRIGGER IF NOT EXISTS sync_contents_insert
AFTER INSERT ON contents
BEGIN
  -- unified_queue에 삽입
  INSERT OR REPLACE INTO unified_queue (
    id, type, user_id, status, progress, error, worker_pid,
    metadata, created_at, updated_at
  ) VALUES (
    NEW.id,
    NEW.type,
    NEW.user_id,
    NEW.status,
    NEW.progress,
    NEW.error,
    NEW.pid,
    json_object(
      'format', NEW.format,
      'title', NEW.title,
      'original_title', NEW.original_title,
      'content', NEW.content,
      'video_path', NEW.video_path,
      'thumbnail_path', NEW.thumbnail_path,
      'input_tokens', NEW.input_tokens,
      'output_tokens', NEW.output_tokens,
      'use_claude_local', NEW.use_claude_local,
      'model', NEW.model,
      'product_info', NEW.product_info,
      'category', NEW.category,
      'source_content_id', NEW.source_content_id,
      'conversion_type', NEW.conversion_type,
      'is_regenerated', NEW.is_regenerated
    ),
    NEW.created_at,
    NEW.updated_at
  );

  -- content_metadata에도 삽입/업데이트
  INSERT OR REPLACE INTO content_metadata (
    id, queue_id, title, type, category, published, published_at,
    metadata, created_at, updated_at
  ) VALUES (
    NEW.id,
    NEW.id,
    NEW.title,
    NEW.format,
    NEW.category,
    NEW.published,
    NEW.published_at,
    json_object('format', NEW.format),
    NEW.created_at,
    NEW.updated_at
  );
END;

-- UPDATE 트리거: contents 업데이트 시 unified_queue도 업데이트
CREATE TRIGGER IF NOT EXISTS sync_contents_update
AFTER UPDATE ON contents
BEGIN
  -- unified_queue 업데이트
  UPDATE unified_queue SET
    type = NEW.type,
    user_id = NEW.user_id,
    status = NEW.status,
    progress = NEW.progress,
    error = NEW.error,
    worker_pid = NEW.pid,
    metadata = json_object(
      'format', NEW.format,
      'title', NEW.title,
      'original_title', NEW.original_title,
      'content', NEW.content,
      'video_path', NEW.video_path,
      'thumbnail_path', NEW.thumbnail_path,
      'input_tokens', NEW.input_tokens,
      'output_tokens', NEW.output_tokens,
      'use_claude_local', NEW.use_claude_local,
      'model', NEW.model,
      'product_info', NEW.product_info,
      'category', NEW.category,
      'source_content_id', NEW.source_content_id,
      'conversion_type', NEW.conversion_type,
      'is_regenerated', NEW.is_regenerated
    ),
    updated_at = NEW.updated_at
  WHERE id = NEW.id;

  -- content_metadata 업데이트
  UPDATE content_metadata SET
    title = NEW.title,
    type = NEW.format,
    category = NEW.category,
    published = NEW.published,
    published_at = NEW.published_at,
    updated_at = NEW.updated_at
  WHERE queue_id = NEW.id;
END;

-- DELETE 트리거: contents에서 삭제 시 unified_queue에서도 삭제
CREATE TRIGGER IF NOT EXISTS sync_contents_delete
AFTER DELETE ON contents
BEGIN
  DELETE FROM unified_queue WHERE id = OLD.id;
  DELETE FROM content_metadata WHERE queue_id = OLD.id;
END;

-- ========== 완료 메시지 ==========
-- contents가 실제 테이블로 복원되었습니다.
-- 기존 코드들이 정상 작동하며, unified_queue와 자동 동기화됩니다.