-- task_schedule 테이블 최소화 migration
-- 불필요한 컬럼 제거 (MySQL 8.0 호환)

USE trend_video;

-- Drop columns one by one (ignore errors if column doesn't exist)
SET @query = (SELECT IF(
  COUNT(*) > 0,
  'ALTER TABLE task_schedule DROP COLUMN content_id;',
  'SELECT "Column content_id does not exist";'
) FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = 'trend_video' AND TABLE_NAME = 'task_schedule' AND COLUMN_NAME = 'content_id');
PREPARE stmt FROM @query;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @query = (SELECT IF(
  COUNT(*) > 0,
  'ALTER TABLE task_schedule DROP COLUMN youtube_publish_time;',
  'SELECT "Column youtube_publish_time does not exist";'
) FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = 'trend_video' AND TABLE_NAME = 'task_schedule' AND COLUMN_NAME = 'youtube_publish_time');
PREPARE stmt FROM @query;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @query = (SELECT IF(
  COUNT(*) > 0,
  'ALTER TABLE task_schedule DROP COLUMN error_message;',
  'SELECT "Column error_message does not exist";'
) FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = 'trend_video' AND TABLE_NAME = 'task_schedule' AND COLUMN_NAME = 'error_message');
PREPARE stmt FROM @query;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @query = (SELECT IF(
  COUNT(*) > 0,
  'ALTER TABLE task_schedule DROP COLUMN failed_stage;',
  'SELECT "Column failed_stage does not exist";'
) FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = 'trend_video' AND TABLE_NAME = 'task_schedule' AND COLUMN_NAME = 'failed_stage');
PREPARE stmt FROM @query;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @query = (SELECT IF(
  COUNT(*) > 0,
  'ALTER TABLE task_schedule DROP COLUMN retry_count;',
  'SELECT "Column retry_count does not exist";'
) FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = 'trend_video' AND TABLE_NAME = 'task_schedule' AND COLUMN_NAME = 'retry_count');
PREPARE stmt FROM @query;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @query = (SELECT IF(
  COUNT(*) > 0,
  'ALTER TABLE task_schedule DROP COLUMN shortform_task_id;',
  'SELECT "Column shortform_task_id does not exist";'
) FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = 'trend_video' AND TABLE_NAME = 'task_schedule' AND COLUMN_NAME = 'shortform_task_id');
PREPARE stmt FROM @query;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @query = (SELECT IF(
  COUNT(*) > 0,
  'ALTER TABLE task_schedule DROP COLUMN parent_youtube_url;',
  'SELECT "Column parent_youtube_url does not exist";'
) FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = 'trend_video' AND TABLE_NAME = 'task_schedule' AND COLUMN_NAME = 'parent_youtube_url');
PREPARE stmt FROM @query;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @query = (SELECT IF(
  COUNT(*) > 0,
  'ALTER TABLE task_schedule DROP COLUMN shortform_uploaded;',
  'SELECT "Column shortform_uploaded does not exist";'
) FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = 'trend_video' AND TABLE_NAME = 'task_schedule' AND COLUMN_NAME = 'shortform_uploaded');
PREPARE stmt FROM @query;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 완료 메시지
SELECT '✅ task_schedule 테이블 최소화 완료!' as message;
SELECT COUNT(*) as total_schedules FROM task_schedule;
