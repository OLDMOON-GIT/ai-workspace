-- task_schedule.status 컬럼 제거
-- 상태는 task_queue에서만 관리!

USE trend_video;

SET @query = (SELECT IF(
  COUNT(*) > 0,
  'ALTER TABLE task_schedule DROP COLUMN status;',
  'SELECT "Column status does not exist";'
) FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = 'trend_video' AND TABLE_NAME = 'task_schedule' AND COLUMN_NAME = 'status');
PREPARE stmt FROM @query;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SELECT '✅ task_schedule.status 컬럼 제거 완료!' as message;
SELECT COUNT(*) as total_schedules FROM task_schedule;
