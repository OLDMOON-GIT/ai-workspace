-- task_schedule 구조 변경: schedule_id 제거, task_id를 PK로
-- 1 task = 1 schedule (1:1 관계)

USE trend_video;

-- 1. 기존 데이터 백업
CREATE TABLE IF NOT EXISTS task_schedule_backup AS
SELECT * FROM task_schedule;

-- 2. task당 가장 최근 schedule 1개만 선택
CREATE TEMPORARY TABLE task_schedule_latest AS
SELECT
  task_id,
  scheduled_time,
  created_at,
  updated_at
FROM (
  SELECT
    task_id,
    scheduled_time,
    created_at,
    updated_at,
    ROW_NUMBER() OVER (PARTITION BY task_id ORDER BY created_at DESC) as rn
  FROM task_schedule
) t
WHERE rn = 1;

-- 3. 기존 테이블 삭제
DROP TABLE task_schedule;

-- 4. 새 구조로 생성 (task_id가 PK)
CREATE TABLE task_schedule (
  task_id VARCHAR(255) PRIMARY KEY,
  scheduled_time DATETIME NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_task_schedule_scheduled_time (scheduled_time),
  FOREIGN KEY (task_id) REFERENCES task(task_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. 데이터 복원 (task당 1개만)
INSERT INTO task_schedule (task_id, scheduled_time, created_at, updated_at)
SELECT task_id, scheduled_time, created_at, updated_at
FROM task_schedule_latest;

-- 6. 임시 테이블 삭제
DROP TEMPORARY TABLE task_schedule_latest;

-- 완료 메시지
SELECT '✅ task_schedule 1:1 구조 변경 완료!' as message;
SELECT COUNT(*) as total_schedules FROM task_schedule;
SELECT '📦 백업 테이블: task_schedule_backup' as backup_info;
