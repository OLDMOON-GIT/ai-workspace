-- task.status 제거 (task_queue.status만 사용)
USE trend_video;

-- status 컬럼 삭제
SET @query = (SELECT IF(COUNT(*) > 0,
  'ALTER TABLE task DROP COLUMN status;',
  'SELECT "status 컬럼 없음";'
) FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = 'trend_video' AND TABLE_NAME = 'task' AND COLUMN_NAME = 'status');
PREPARE stmt FROM @query; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- status 인덱스도 삭제 (있으면)
SET @query = (SELECT IF(COUNT(*) > 0,
  'ALTER TABLE task DROP INDEX idx_task_status;',
  'SELECT "idx_task_status 인덱스 없음";'
) FROM INFORMATION_SCHEMA.STATISTICS
WHERE TABLE_SCHEMA = 'trend_video' AND TABLE_NAME = 'task' AND INDEX_NAME = 'idx_task_status');
PREPARE stmt FROM @query; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SELECT '✅ task.status 제거 완료! task_queue.status만 사용' as message;
