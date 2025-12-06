-- task_queue 시간 기록을 task_time_log로 분리
-- task_queue는 현재 상태만, 시간 기록은 task_time_log로

USE trend_video;

-- 1. task_time_log 테이블 생성
DROP TABLE IF EXISTS task_time_log;
CREATE TABLE task_time_log (
  task_id VARCHAR(255) NOT NULL,
  type ENUM('script', 'image', 'video', 'youtube') NOT NULL,
  retry_cnt INT NOT NULL DEFAULT 0,
  start_time DATETIME NOT NULL,
  end_time DATETIME,
  elapsed_time INT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (task_id, type, retry_cnt),
  INDEX idx_task_time_log_start_time (start_time),
  FOREIGN KEY (task_id) REFERENCES task(task_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. 기존 task_queue 데이터를 task_time_log로 마이그레이션 (retry_cnt = 0)
-- 컬럼이 존재하는 경우에만 실행

-- started_at 컬럼이 있는지 확인
SET @has_started_at = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = 'trend_video' AND TABLE_NAME = 'task_queue' AND COLUMN_NAME = 'started_at');

-- script 단계 (started_at, script_completed_at 필요)
SET @query = IF(@has_started_at > 0,
  "INSERT INTO task_time_log (task_id, type, retry_cnt, start_time, end_time)
   SELECT task_id, 'script', 0, started_at, script_completed_at
   FROM task_queue WHERE script_completed_at IS NOT NULL AND started_at IS NOT NULL",
  "SELECT 'started_at 컬럼 없음 - script 마이그레이션 스킵' as message");
PREPARE stmt FROM @query; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- image 단계 (script_completed_at, image_completed_at 필요)
SET @query = IF(@has_started_at > 0,
  "INSERT INTO task_time_log (task_id, type, retry_cnt, start_time, end_time)
   SELECT task_id, 'image', 0, script_completed_at, image_completed_at
   FROM task_queue WHERE image_completed_at IS NOT NULL AND script_completed_at IS NOT NULL",
  "SELECT 'started_at 컬럼 없음 - image 마이그레이션 스킵' as message");
PREPARE stmt FROM @query; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- video 단계 (image_completed_at, video_completed_at 필요)
SET @query = IF(@has_started_at > 0,
  "INSERT INTO task_time_log (task_id, type, retry_cnt, start_time, end_time)
   SELECT task_id, 'video', 0, image_completed_at, video_completed_at
   FROM task_queue WHERE video_completed_at IS NOT NULL AND image_completed_at IS NOT NULL",
  "SELECT 'started_at 컬럼 없음 - video 마이그레이션 스킵' as message");
PREPARE stmt FROM @query; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- youtube 단계 (video_completed_at, youtube_completed_at 필요)
SET @query = IF(@has_started_at > 0,
  "INSERT INTO task_time_log (task_id, type, retry_cnt, start_time, end_time)
   SELECT task_id, 'youtube', 0, video_completed_at, youtube_completed_at
   FROM task_queue WHERE youtube_completed_at IS NOT NULL AND video_completed_at IS NOT NULL",
  "SELECT 'started_at 컬럼 없음 - youtube 마이그레이션 스킵' as message");
PREPARE stmt FROM @query; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 3. task_queue에서 시간 관련 컬럼 제거
SET @query = (SELECT IF(COUNT(*) > 0, 'ALTER TABLE task_queue DROP COLUMN started_at;', 'SELECT "started_at not exists";') FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = 'trend_video' AND TABLE_NAME = 'task_queue' AND COLUMN_NAME = 'started_at');
PREPARE stmt FROM @query; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @query = (SELECT IF(COUNT(*) > 0, 'ALTER TABLE task_queue DROP COLUMN completed_at;', 'SELECT "completed_at not exists";') FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = 'trend_video' AND TABLE_NAME = 'task_queue' AND COLUMN_NAME = 'completed_at');
PREPARE stmt FROM @query; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @query = (SELECT IF(COUNT(*) > 0, 'ALTER TABLE task_queue DROP COLUMN elapsed_time;', 'SELECT "elapsed_time not exists";') FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = 'trend_video' AND TABLE_NAME = 'task_queue' AND COLUMN_NAME = 'elapsed_time');
PREPARE stmt FROM @query; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @query = (SELECT IF(COUNT(*) > 0, 'ALTER TABLE task_queue DROP COLUMN script_completed_at;', 'SELECT "script_completed_at not exists";') FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = 'trend_video' AND TABLE_NAME = 'task_queue' AND COLUMN_NAME = 'script_completed_at');
PREPARE stmt FROM @query; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @query = (SELECT IF(COUNT(*) > 0, 'ALTER TABLE task_queue DROP COLUMN image_completed_at;', 'SELECT "image_completed_at not exists";') FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = 'trend_video' AND TABLE_NAME = 'task_queue' AND COLUMN_NAME = 'image_completed_at');
PREPARE stmt FROM @query; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @query = (SELECT IF(COUNT(*) > 0, 'ALTER TABLE task_queue DROP COLUMN video_completed_at;', 'SELECT "video_completed_at not exists";') FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = 'trend_video' AND TABLE_NAME = 'task_queue' AND COLUMN_NAME = 'video_completed_at');
PREPARE stmt FROM @query; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @query = (SELECT IF(COUNT(*) > 0, 'ALTER TABLE task_queue DROP COLUMN youtube_completed_at;', 'SELECT "youtube_completed_at not exists";') FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = 'trend_video' AND TABLE_NAME = 'task_queue' AND COLUMN_NAME = 'youtube_completed_at');
PREPARE stmt FROM @query; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SELECT '✅ task_time_log 분리 완료!' as message;
SELECT COUNT(*) as total_time_logs FROM task_time_log;
SELECT COUNT(*) as total_queues FROM task_queue;
