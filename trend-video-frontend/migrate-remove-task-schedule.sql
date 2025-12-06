-- task_schedule 테이블 제거, task.scheduled_time으로 통합
-- task_schedule → task 데이터 마이그레이션

USE trend_video;

-- 1. task 테이블에 scheduled_time 컬럼 추가 (없으면)
SET @query = (SELECT IF(
  COUNT(*) = 0,
  'ALTER TABLE task ADD COLUMN scheduled_time DATETIME;',
  'SELECT "Column scheduled_time already exists";'
) FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = 'trend_video' AND TABLE_NAME = 'task' AND COLUMN_NAME = 'scheduled_time');
PREPARE stmt FROM @query;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 인덱스 추가
SET @query = (SELECT IF(
  COUNT(*) = 0,
  'ALTER TABLE task ADD INDEX idx_task_scheduled_time (scheduled_time);',
  'SELECT "Index idx_task_scheduled_time already exists";'
) FROM INFORMATION_SCHEMA.STATISTICS
WHERE TABLE_SCHEMA = 'trend_video' AND TABLE_NAME = 'task' AND INDEX_NAME = 'idx_task_scheduled_time');
PREPARE stmt FROM @query;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 2. task_schedule 데이터를 task.scheduled_time으로 복사
UPDATE task t
JOIN task_schedule s ON t.task_id = s.task_id
SET t.scheduled_time = s.scheduled_time;

-- 3. task_schedule 테이블 삭제
DROP TABLE IF EXISTS task_schedule;

-- 4. task_schedule_backup도 삭제 (있으면)
DROP TABLE IF EXISTS task_schedule_backup;

SELECT '✅ task_schedule 제거 완료! task.scheduled_time으로 통합됨' as message;
SELECT COUNT(*) as tasks_with_schedule FROM task WHERE scheduled_time IS NOT NULL;
