-- =============================================
-- Coupang Related Compatibility Views
-- Date: 2025-11-24
-- Description: 쿠팡 관련 호환성 뷰 추가
-- =============================================

-- coupang_crawl_queue 뷰 (unified_queue 기반)
CREATE VIEW IF NOT EXISTS coupang_crawl_queue AS
SELECT
  uq.id,
  uq.user_id,
  json_extract(uq.metadata, '$.product_url') as product_url,
  uq.status,
  uq.retry_count,
  uq.max_retries,
  json_extract(uq.metadata, '$.timeout_seconds') as timeout_seconds,
  uq.error as error_message,
  json_extract(uq.metadata, '$.product_info') as product_info,
  json_extract(uq.metadata, '$.custom_category') as custom_category,
  uq.created_at,
  uq.updated_at,
  uq.completed_at as processed_at
FROM unified_queue uq
WHERE uq.type = 'coupang_crawl';

-- chinese_converter_jobs 뷰 (unified_queue 기반)
CREATE VIEW IF NOT EXISTS chinese_converter_jobs AS
SELECT
  uq.id,
  uq.user_id,
  json_extract(uq.metadata, '$.title') as title,
  uq.status,
  uq.progress,
  json_extract(uq.metadata, '$.video_path') as video_path,
  json_extract(uq.metadata, '$.output_path') as output_path,
  uq.error,
  uq.created_at,
  uq.updated_at
FROM unified_queue uq
WHERE uq.type = 'chinese_converter';

-- jobs 뷰 (unified_queue 기반)
CREATE VIEW IF NOT EXISTS jobs AS
SELECT
  uq.id,
  uq.user_id,
  uq.status,
  uq.progress,
  json_extract(uq.metadata, '$.step') as step,
  json_extract(uq.metadata, '$.title') as title,
  json_extract(uq.metadata, '$.format') as type,
  json_extract(uq.metadata, '$.video_url') as video_url,
  json_extract(uq.metadata, '$.video_path') as video_path,
  json_extract(uq.metadata, '$.thumbnail_path') as thumbnail_path,
  uq.error,
  json_extract(uq.metadata, '$.source_content_id') as source_content_id,
  json_extract(uq.metadata, '$.converted_from_job_id') as converted_from_job_id,
  json_extract(uq.metadata, '$.prompt') as prompt,
  json_extract(uq.metadata, '$.tts_voice') as tts_voice,
  json_extract(uq.metadata, '$.category') as category,
  uq.created_at,
  uq.updated_at
FROM unified_queue uq
WHERE uq.type IN ('video', 'shortform', 'longform', 'product', 'sora2');

-- tasks 뷰 (관리자용)
CREATE VIEW IF NOT EXISTS tasks AS
SELECT
  uq.id,
  json_extract(uq.metadata, '$.content') as content,
  CASE
    WHEN uq.status = 'pending' THEN 'todo'
    WHEN uq.status = 'processing' THEN 'ing'
    WHEN uq.status IN ('completed', 'failed') THEN 'done'
    ELSE 'todo'
  END as status,
  uq.priority,
  json_extract(uq.metadata, '$.logs') as logs,
  uq.created_at,
  uq.updated_at,
  uq.completed_at
FROM unified_queue uq
WHERE json_extract(uq.metadata, '$.is_admin_task') = 1;