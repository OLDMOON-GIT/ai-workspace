-- ============================================================
-- Automation Scheduler SQL (실제 사용 쿼리만 정리)
-- ============================================================

-- ============================================================
-- 1. Queue 상태 조회
-- ============================================================

-- @sqlId: checkQueueStatus
SELECT q.status
FROM task_queue q
WHERE q.task_id = ?
ORDER BY q.created_at DESC
LIMIT 1

-- @sqlId: getCurrentQueueType
SELECT type, status
FROM task_queue
WHERE task_id = ?
LIMIT 1

-- @sqlId: getProcessingCount
SELECT COUNT(*) as count
FROM task_queue
WHERE type = ? AND status = 'processing'

-- @sqlId: getCompletedTasks
SELECT task_id as taskId, type
FROM task_queue
WHERE status = 'completed' AND type != 'youtube'

-- @sqlId: getFirstWaitingTask
SELECT q.task_id as taskId
FROM task_queue q
WHERE q.type = ? AND q.status = 'waiting'
LIMIT 1

-- @sqlId: getStaleTasks
SELECT q.task_id as taskId, q.type, q.status, log.start_time as startedAt
FROM task_queue q
LEFT JOIN task_time_log log ON q.task_id = log.task_id AND q.type = log.type AND log.end_time IS NULL
WHERE q.status = 'processing'
  AND log.start_time IS NOT NULL
  AND log.start_time < DATE_SUB(NOW(), INTERVAL ? MINUTE)

-- @sqlId: getQueueWithDetails
SELECT t.task_id as taskId,
       t.user_id as userId,
       c.title,
       c.prompt_format as promptFormat,
       c.ai_model as aiModel,
       c.category,
       c.product_info as productInfo,
       c.youtube_publish_time as youtubePublishTime,
       cs.script_mode as scriptMode,
       cs.media_mode as mediaMode,
       c.youtube_channel as youtubeChannel,
       cs.tts_voice as ttsVoice,
       cs.tts_speed as ttsSpeed,
       q.status as queueStatus,
       q.type as queueType,
       t.task_id as scheduleId
FROM task t
JOIN content c ON t.task_id = c.content_id
LEFT JOIN content_setting cs ON t.task_id = cs.content_id
JOIN task_queue q ON t.task_id = q.task_id
WHERE t.task_id = ?

-- ============================================================
-- 2. Queue 상태 업데이트
-- ============================================================

-- @sqlId: updateQueueStatus
UPDATE task_queue
SET status = ?, error = ?
WHERE task_id = ? AND type = ?

-- @sqlId: completeTaskQueue
UPDATE task_queue
SET status = 'completed'
WHERE task_id = ?

-- @sqlId: failTaskQueue
UPDATE task_queue
SET status = 'failed',
    error = ?
WHERE task_id = ?

-- @sqlId: completeContent
UPDATE content
SET status = 'completed',
    updated_at = CURRENT_TIMESTAMP
WHERE content_id = ?

-- @sqlId: failContent
UPDATE content
SET status = 'failed',
    error = ?,
    updated_at = CURRENT_TIMESTAMP
WHERE content_id = ?

-- @sqlId: markTaskProcessing
UPDATE task_queue
SET status = 'processing'
WHERE task_id = ? AND type = ? AND status = 'waiting'

-- @sqlId: markTaskFailed
UPDATE task_queue
SET status = 'failed', error = ?
WHERE task_id = ?

-- @sqlId: markTaskCancelled
UPDATE task_queue
SET status = 'cancelled'
WHERE task_id = ?

-- @sqlId: rollbackTaskStatus
UPDATE task_queue
SET status = 'waiting'
WHERE task_id = ? AND type = ?

-- @sqlId: updateTaskToNextPhase
UPDATE task_queue
SET type = ?, status = 'waiting', error = NULL
WHERE task_id = ?

-- @sqlId: updateTaskToNextPhaseWithTime
UPDATE task_queue
SET type = ?,
    status = 'waiting',
    error = NULL
WHERE task_id = ? AND type = ?

-- @sqlId: retryTask
UPDATE task_queue
SET type = ?, status = 'waiting', error = NULL
WHERE task_id = ?

-- @sqlId: deleteCompletedTask
DELETE FROM task_queue
WHERE task_id = ? AND type = ?

-- @sqlId: getAverageTime
SELECT
  AVG(elapsed_time) as avg_time,
  MIN(elapsed_time) as min_time,
  MAX(elapsed_time) as max_time,
  COUNT(*) as count
FROM task_queue
WHERE type = ?
  AND status = 'completed'
  AND elapsed_time IS NOT NULL
  AND completed_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)

-- ============================================================
-- 3. Task Lock 관리
-- ============================================================

-- @sqlId: checkTaskLock
SELECT lock_task_id as lockedBy, locked_at as lockedAt, worker_pid as workerPid
FROM task_lock
WHERE task_type = ?

-- @sqlId: acquireTaskLock
INSERT INTO task_lock (task_type, lock_task_id, locked_at, worker_pid)
VALUES (?, ?, NOW(), ?)
ON DUPLICATE KEY UPDATE
  lock_task_id = VALUES(lock_task_id),
  locked_at = VALUES(locked_at),
  worker_pid = VALUES(worker_pid)

-- @sqlId: releaseTaskLock
UPDATE task_lock
SET lock_task_id = NULL, locked_at = NULL, worker_pid = NULL
WHERE task_type = ?

-- ============================================================
-- 4. Content & User 조회
-- ============================================================

-- @sqlId: getContentById
SELECT content_id as contentId,
       user_id as userId,
       title,
       prompt_format as promptFormat,
       ai_model as aiModel,
       product_info as productInfo,
       category,
       status
FROM content
WHERE content_id = ?

-- @sqlId: getContentAllById
SELECT *, content_id as contentId FROM content WHERE content_id = ?

-- @sqlId: getUserSettings
SELECT google_sites_home_url as googleSitesHomeUrl,
       nickname
FROM user
WHERE user_id = ?

-- @sqlId: updateContentYoutubeUrl
UPDATE content
SET youtube_url = ?, updated_at = CURRENT_TIMESTAMP
WHERE content_id = ?

-- @sqlId: checkExistingYoutubeUpload
SELECT content_id as contentId, youtube_url as youtubeUrl
FROM content
WHERE content_id = ?
  AND youtube_url IS NOT NULL
  AND youtube_url != ''
LIMIT 1

-- ============================================================
-- 5. Schedule 조회
-- ============================================================

-- @sqlId: getPendingSchedules
SELECT
  t.task_id as taskId,
  t.user_id as userId,
  t.scheduled_time as scheduledTime,
  c.title,
  c.prompt_format as promptFormat,
  c.ai_model as aiModel,
  c.category,
  c.product_info as productInfo,
  cs.script_mode as scriptMode,
  cs.tags,
  cs.settings
FROM task t
INNER JOIN content c ON t.task_id = c.content_id
LEFT JOIN content_setting cs ON t.task_id = cs.content_id
WHERE t.scheduled_time IS NOT NULL
  AND t.scheduled_time <= ?
ORDER BY t.scheduled_time ASC

-- ============================================================
-- 6. Additional Content Queries
-- ============================================================

-- @sqlId: getContentBasicById
SELECT content_id as contentId, title, user_id as userId
FROM content
WHERE content_id = ?

-- @sqlId: getExistingJobBySourceId
SELECT content_id as contentId, status, title
FROM content
WHERE source_content_id = ?
  AND status IN ('pending', 'processing')
ORDER BY created_at DESC
LIMIT 1

-- ============================================================
-- 7. Schedule Status Queries
-- ============================================================

-- @sqlId: getScheduleStatus
SELECT status
FROM task_queue
WHERE task_id = ?
ORDER BY updated_at DESC
LIMIT 1

-- @sqlId: getLastScheduleForChannel
SELECT t.*, c.youtube_channel as youtubeChannel
FROM task t
JOIN content c ON t.task_id = c.content_id
WHERE c.youtube_channel = ? AND t.user_id = ?
  AND t.scheduled_time IS NOT NULL
ORDER BY t.created_at DESC
LIMIT 1

-- @sqlId: getLastScheduleTimeForChannel
SELECT t.scheduled_time
FROM task t
JOIN content c ON t.task_id = c.content_id
WHERE t.user_id = ? AND c.youtube_channel = ?
  AND t.scheduled_time IS NOT NULL
ORDER BY t.scheduled_time DESC
LIMIT 1

-- @sqlId: getExistingScheduleByDate
SELECT t.task_id as schedule_id, t.scheduled_time
FROM task t
JOIN content c ON t.task_id = c.content_id
WHERE c.youtube_channel = ? AND t.user_id = ?
  AND t.scheduled_time = ?
LIMIT 1

-- @sqlId: updateShortformUploaded
UPDATE task
SET updated_at = CURRENT_TIMESTAMP
WHERE task_id = ?

-- ============================================================
-- 8. YouTube Channel Settings
-- ============================================================

-- @sqlId: getAllActiveChannels
SELECT * FROM youtube_channel_setting
WHERE is_active = 1

-- @sqlId: getActiveProductChannels
SELECT user_id, channel_id, channel_name, categories
FROM youtube_channel_setting
WHERE is_active = 1 AND categories LIKE '%상품%'

-- ============================================================
-- 9. Coupang Product Queries
-- ============================================================

-- @sqlId: getExistingProductTitles
SELECT title FROM coupang_product WHERE user_id = ?

-- @sqlId: getExistingProductUrls
SELECT product_url FROM coupang_product WHERE user_id = ?

-- @sqlId: insertCoupangProduct
INSERT INTO coupang_product
  (coupang_id, user_id, product_url, deep_link, title, description, category, original_price, discount_price, thumbnail_url, status)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')

-- @sqlId: insertCoupangProductSimple
INSERT INTO coupang_product
  (coupang_id, user_id, product_url, deep_link, title, description, category, original_price, discount_price, thumbnail_url)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)

-- ============================================================
-- 10. Task Creation (Auto-scheduling)
-- ============================================================

-- @sqlId: insertTask
INSERT INTO task (task_id, user_id, scheduled_time, created_at, updated_at)
VALUES (?, ?, ?, NOW(), NOW())

-- @sqlId: insertContent
INSERT INTO content (content_id, user_id, title, prompt_format, category, ai_model, product_info, youtube_channel, title_score, created_at, updated_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())

-- @sqlId: insertContentWithStatus
INSERT INTO content (content_id, user_id, title, original_title, status, ai_model, prompt_format, product_info, category, title_score, youtube_channel, created_at, updated_at)
VALUES (?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, NOW(), NOW())

-- @sqlId: insertContentForProduct
INSERT INTO content (content_id, user_id, title, prompt_format, product_info, category, ai_model, youtube_channel, created_at, updated_at)
VALUES (?, ?, ?, 'product', ?, '상품', 'gemini', ?, NOW(), NOW())

-- @sqlId: insertContentSetting
INSERT INTO content_setting (content_id, script_mode, media_mode, created_at, updated_at)
VALUES (?, 'chrome', 'crawl', NOW(), NOW())

-- @sqlId: insertContentSettingFull
INSERT INTO content_setting (content_id, script_mode, media_mode, tts_voice, tts_speed, auto_create_shortform, tags, created_at, updated_at)
VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())

-- @sqlId: insertTaskQueue
INSERT INTO task_queue (task_id, type, status, created_at, user_id)
VALUES (?, 'script', 'waiting', NOW(), ?)

-- @sqlId: insertTaskQueueVideo
INSERT INTO task_queue (task_id, type, status, user_id, created_at)
VALUES (?, 'video', 'waiting', ?, NOW())

-- ============================================================
-- 11. Shortform Queries
-- ============================================================

-- @sqlId: getSchedulesWithShortform
SELECT *
FROM task
WHERE 1 = 0
