-- Ensure task_queue has timestamps and progress columns used by automation APIs
USE trend_video;

-- priority
SET @stmt = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'task_queue' AND COLUMN_NAME = 'priority') = 0,
  'ALTER TABLE task_queue ADD COLUMN priority INT DEFAULT 0 AFTER status;',
  'SELECT "priority exists"'
);
PREPARE stmt FROM @stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- started_at
SET @stmt = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'task_queue' AND COLUMN_NAME = 'started_at') = 0,
  'ALTER TABLE task_queue ADD COLUMN started_at DATETIME AFTER created_at;',
  'SELECT "started_at exists"'
);
PREPARE stmt FROM @stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- completed_at
SET @stmt = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'task_queue' AND COLUMN_NAME = 'completed_at') = 0,
  'ALTER TABLE task_queue ADD COLUMN completed_at DATETIME AFTER started_at;',
  'SELECT "completed_at exists"'
);
PREPARE stmt FROM @stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- elapsed_time
SET @stmt = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'task_queue' AND COLUMN_NAME = 'elapsed_time') = 0,
  'ALTER TABLE task_queue ADD COLUMN elapsed_time INT AFTER completed_at;',
  'SELECT "elapsed_time exists"'
);
PREPARE stmt FROM @stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- stage completion timestamps
SET @stmt = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'task_queue' AND COLUMN_NAME = 'script_completed_at') = 0,
  'ALTER TABLE task_queue ADD COLUMN script_completed_at DATETIME AFTER elapsed_time;',
  'SELECT "script_completed_at exists"'
);
PREPARE stmt FROM @stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @stmt = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'task_queue' AND COLUMN_NAME = 'image_completed_at') = 0,
  'ALTER TABLE task_queue ADD COLUMN image_completed_at DATETIME AFTER script_completed_at;',
  'SELECT "image_completed_at exists"'
);
PREPARE stmt FROM @stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @stmt = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'task_queue' AND COLUMN_NAME = 'video_completed_at') = 0,
  'ALTER TABLE task_queue ADD COLUMN video_completed_at DATETIME AFTER image_completed_at;',
  'SELECT "video_completed_at exists"'
);
PREPARE stmt FROM @stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @stmt = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'task_queue' AND COLUMN_NAME = 'youtube_completed_at') = 0,
  'ALTER TABLE task_queue ADD COLUMN youtube_completed_at DATETIME AFTER video_completed_at;',
  'SELECT "youtube_completed_at exists"'
);
PREPARE stmt FROM @stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- metadata / logs
SET @stmt = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'task_queue' AND COLUMN_NAME = 'metadata') = 0,
  'ALTER TABLE task_queue ADD COLUMN metadata TEXT AFTER user_id;',
  'SELECT "metadata exists"'
);
PREPARE stmt FROM @stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @stmt = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'task_queue' AND COLUMN_NAME = 'logs') = 0,
  'ALTER TABLE task_queue ADD COLUMN logs TEXT AFTER metadata;',
  'SELECT "logs exists"'
);
PREPARE stmt FROM @stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- completed_at index
SET @stmt = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'task_queue' AND INDEX_NAME = 'idx_task_queue_completed_at') = 0,
  'CREATE INDEX idx_task_queue_completed_at ON task_queue(completed_at);',
  'SELECT "idx_task_queue_completed_at exists"'
);
PREPARE stmt FROM @stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SELECT 'task_queue columns synchronized' AS message;
