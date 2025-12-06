-- =============================================
-- Compatibility Views for Legacy Code
-- Date: 2025-11-24
-- Description: 기존 코드와의 하위 호환성을 위한 뷰 생성
-- =============================================

-- video_titles 뷰 (content_metadata 기반)
CREATE VIEW IF NOT EXISTS video_titles AS
SELECT
  cm.id,
  cm.title,
  json_extract(cm.metadata, '$.type') as type,
  cm.category,
  cm.tags,
  json_extract(cm.metadata, '$.product_url') as product_url,
  json_extract(cm.metadata, '$.status') as status,
  json_extract(cm.metadata, '$.priority') as priority,
  uq.user_id,
  json_extract(cm.metadata, '$.channel') as channel,
  json_extract(cm.metadata, '$.script_mode') as script_mode,
  json_extract(cm.metadata, '$.media_mode') as media_mode,
  json_extract(cm.metadata, '$.youtube_schedule') as youtube_schedule,
  json_extract(cm.metadata, '$.model') as model,
  json_extract(cm.metadata, '$.product_data') as product_data,
  cm.created_at,
  cm.updated_at
FROM content_metadata cm
LEFT JOIN unified_queue uq ON cm.queue_id = uq.id;

-- task_schedules 뷰 (unified_queue 기반)
CREATE VIEW IF NOT EXISTS task_schedules AS
SELECT
  uq.id,
  uq.id as task_id,
  json_extract(uq.metadata, '$.title_id') as title_id,
  uq.user_id,
  uq.scheduled_at as scheduled_time,
  json_extract(uq.metadata, '$.youtube_publish_time') as youtube_publish_time,
  json_extract(uq.metadata, '$.youtube_privacy') as youtube_privacy,
  json_extract(uq.result, '$.youtube_url') as youtube_url,
  json_extract(uq.metadata, '$.channel_setting_id') as channel_setting_id,
  json_extract(uq.metadata, '$.media_mode') as media_mode,
  uq.status,
  json_extract(uq.metadata, '$.script_id') as script_id,
  json_extract(uq.metadata, '$.video_id') as video_id,
  json_extract(uq.metadata, '$.youtube_upload_id') as youtube_upload_id,
  json_extract(uq.metadata, '$.shortform_task_id') as shortform_task_id,
  json_extract(uq.metadata, '$.parent_youtube_url') as parent_youtube_url,
  json_extract(uq.metadata, '$.shortform_uploaded') as shortform_uploaded,
  uq.error,
  uq.created_at,
  uq.updated_at
FROM unified_queue uq
WHERE uq.scheduled_at IS NOT NULL
   OR json_extract(uq.metadata, '$.title_id') IS NOT NULL;