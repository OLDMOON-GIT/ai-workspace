-- ============================================================
-- Automation 관련 SQL 쿼리
-- ============================================================

-- @sqlId: getPendingSchedules
SELECT
  t.task_id,
  t.user_id,
  t.scheduled_time,
  c.title,
  c.prompt_format,
  c.ai_model,
  c.category,
  c.product_info,
  cs.script_mode,
  cs.tags,
  cs.settings
FROM task t
INNER JOIN content c ON t.task_id = c.content_id
LEFT JOIN content_setting cs ON t.task_id = cs.content_id
WHERE t.scheduled_time IS NOT NULL
  AND t.scheduled_time <= ?
ORDER BY t.scheduled_time ASC

-- @sqlId: getTaskQueue
SELECT
  task_id,
  type,
  status,
  created_at,
  user_id,
  error
FROM task_queue
WHERE task_id = ?
  AND type = ?
LIMIT 1

-- @sqlId: insertTaskQueue
INSERT INTO task_queue (
  task_id,
  type,
  status,
  created_at,
  user_id
) VALUES (?, ?, ?, CURRENT_TIMESTAMP, ?)

-- @sqlId: updateTaskQueueStatus
UPDATE task_queue
SET status = ?,
    error = ?
WHERE task_id = ?
  AND type = ?

-- @sqlId: getWaitingTasks
SELECT
  tq.task_id,
  tq.type,
  tq.status,
  c.title,
  c.user_id
FROM task_queue tq
INNER JOIN content c ON tq.task_id = c.content_id
WHERE tq.type = ?
  AND tq.status = 'waiting'
ORDER BY tq.created_at ASC
LIMIT ?

-- @sqlId: updateTaskScheduledTime
UPDATE task
SET scheduled_time = NULL,
    updated_at = CURRENT_TIMESTAMP
WHERE task_id = ?

-- @sqlId: getContentById
SELECT
  content_id,
  user_id,
  title,
  original_title,
  prompt_format,
  ai_model,
  category,
  product_info,
  title_score,
  status,
  error,
  youtube_url,
  youtube_channel,
  youtube_publish_time,
  input_tokens,
  output_tokens,
  created_at,
  updated_at
FROM content
WHERE content_id = ?

-- @sqlId: updateContentStatus
UPDATE content
SET status = ?,
    error = ?,
    updated_at = CURRENT_TIMESTAMP
WHERE content_id = ?

-- @sqlId: updateContentYoutubeUrl
UPDATE content
SET youtube_url = ?,
    updated_at = CURRENT_TIMESTAMP
WHERE content_id = ?

-- @sqlId: getContentSettings
SELECT
  content_id,
  script_mode,
  media_mode,
  tts_voice,
  tts_speed,
  auto_create_shortform,
  tags,
  settings,
  youtube_privacy,
  created_at,
  updated_at
FROM content_setting
WHERE content_id = ?

-- @sqlId: checkExistingYoutubeUpload
SELECT
  content_id,
  youtube_url
FROM content
WHERE content_id = ?
  AND youtube_url IS NOT NULL
  AND youtube_url != ''
LIMIT 1

-- @sqlId: getAllScheduleCount
SELECT
  CASE
    WHEN q.status = 'failed' THEN 'failed'
    WHEN q.status = 'completed' THEN 'completed'
    WHEN q.status = 'cancelled' THEN 'cancelled'
    ELSE q.type
  END as tabType,
  COUNT(*) as count
FROM task_queue q
GROUP BY tabType

-- @sqlId: getAllSchedule
SELECT
  q.task_id as taskId,
  q.task_id as scriptId,
  q.task_id as videoId,
  q.task_id as task_id,
  q.type as type,
  q.type as queueType,
  q.status as status,
  q.error as error,
  CASE
    WHEN q.status = 'failed' THEN 'failed'
    WHEN q.status = 'completed' THEN 'completed'
    WHEN q.status = 'cancelled' THEN 'cancelled'
    ELSE q.type
  END as tabType,
  q.created_at as createdAt,
  q.updated_at as updatedAt,
  -- task 정보
  t.user_id as userId,
  t.scheduled_time as scheduledTime,
  -- content 정보
  c.title,
  c.title_score as titleScore,
  c.prompt_format as promptFormat,
  c.category,
  c.youtube_channel as youtubeChannel,
  c.ai_model as aiModel,
  c.product_info as productInfo,
  c.youtube_url as youtubeUrl,
  c.youtube_publish_time as youtubePublishTime,
  (SELECT COUNT(*) FROM youtube_uploads WHERE content_id = c.content_id AND status != 'deleted') as youtubeUploadCount,
  -- content_setting 정보
  cs.script_mode as scriptMode,
  cs.media_mode as mediaMode,
  cs.tts_voice as ttsVoice,
  cs.tts_speed as ttsSpeed,
  cs.auto_create_shortform as autoCreateShortform,
  cs.youtube_privacy as youtubePrivacy,
  -- 각 단계별 시간 기록 (task_time_log)
  log_script.start_time as scriptStartedAt,
  log_script.end_time as scriptCompletedAt,
  TIMESTAMPDIFF(SECOND, log_script.start_time, log_script.end_time) as scriptElapsedTime,
  log_image.start_time as imageStartedAt,
  log_image.end_time as imageCompletedAt,
  TIMESTAMPDIFF(SECOND, log_image.start_time, log_image.end_time) as imageElapsedTime,
  log_video.start_time as videoStartedAt,
  log_video.end_time as videoCompletedAt,
  TIMESTAMPDIFF(SECOND, log_video.start_time, log_video.end_time) as videoElapsedTime,
  log_youtube.start_time as youtubeStartedAt,
  log_youtube.end_time as youtubeCompletedAt,
  TIMESTAMPDIFF(SECOND, log_youtube.start_time, log_youtube.end_time) as youtubeElapsedTime,
  -- YouTube 업로드 정보
  yu.youtube_url as youtubeUploadUrl,
  yu.uploaded_at as youtubeUploadedAt
FROM task_queue q
LEFT JOIN task t ON q.task_id = t.task_id
LEFT JOIN content c ON q.task_id = c.content_id
LEFT JOIN content_setting cs ON q.task_id = cs.content_id
-- 각 단계별 시간 기록 (최신 retry만 선택)
LEFT JOIN (
  SELECT task_id, type, start_time, end_time,
         ROW_NUMBER() OVER (PARTITION BY task_id, type ORDER BY retry_cnt DESC) as rn
  FROM task_time_log
  WHERE type = 'script'
) log_script ON q.task_id = log_script.task_id AND log_script.rn = 1
LEFT JOIN (
  SELECT task_id, type, start_time, end_time,
         ROW_NUMBER() OVER (PARTITION BY task_id, type ORDER BY retry_cnt DESC) as rn
  FROM task_time_log
  WHERE type = 'image'
) log_image ON q.task_id = log_image.task_id AND log_image.rn = 1
LEFT JOIN (
  SELECT task_id, type, start_time, end_time,
         ROW_NUMBER() OVER (PARTITION BY task_id, type ORDER BY retry_cnt DESC) as rn
  FROM task_time_log
  WHERE type = 'video'
) log_video ON q.task_id = log_video.task_id AND log_video.rn = 1
LEFT JOIN (
  SELECT task_id, type, start_time, end_time,
         ROW_NUMBER() OVER (PARTITION BY task_id, type ORDER BY retry_cnt DESC) as rn
  FROM task_time_log
  WHERE type = 'youtube'
) log_youtube ON q.task_id = log_youtube.task_id AND log_youtube.rn = 1
LEFT JOIN (
  SELECT content_id, youtube_url, uploaded_at,
         ROW_NUMBER() OVER (PARTITION BY content_id ORDER BY uploaded_at DESC) as rn
  FROM youtube_uploads
  WHERE status != 'deleted'
) yu ON q.task_id = yu.content_id AND yu.rn = 1
ORDER BY q.updated_at DESC

-- ============================================================
-- Force Execute 관련 SQL
-- ============================================================

-- @sqlId: getTaskForForceExecute
SELECT t.task_id, t.user_id,
       c.title, c.prompt_format, c.category, c.ai_model, c.product_info,
       cs.tags, c.youtube_channel as youtubeChannel, cs.script_mode, cs.media_mode, cs.settings
FROM task t
LEFT JOIN content c ON t.task_id = c.content_id
LEFT JOIN content_setting cs ON t.task_id = cs.content_id
WHERE t.task_id = ?

-- @sqlId: getQueueStatusForForceExecute
SELECT status, type
FROM task_queue
WHERE task_id = ? AND type IN ('schedule', 'script')
ORDER BY created_at DESC
LIMIT 1

-- @sqlId: deleteOldQueue
DELETE FROM task_queue
WHERE task_id = ? AND type IN ('schedule', 'script')

-- @sqlId: updateTaskScheduledTimeForForceExecute
UPDATE task
SET scheduled_time = ?, updated_at = CURRENT_TIMESTAMP
WHERE task_id = ?

-- @sqlId: updateQueueForForceExecute
UPDATE task_queue
SET type = 'script', status = 'waiting'
WHERE task_id = ? AND type IN ('schedule', 'script')

-- @sqlId: replaceQueueForForceExecute
REPLACE INTO task_queue (task_id, type, status, created_at, user_id)
VALUES (?, 'script', 'waiting', CURRENT_TIMESTAMP, ?)
