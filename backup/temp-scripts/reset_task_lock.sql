-- task_lock 테이블 초기화
-- 모든 레코드 삭제 후 4개 task_type만 재생성

-- 1. 모든 레코드 삭제 (empty 포함)
DELETE FROM task_lock;

-- 2. 4개 task_type만 재생성
INSERT INTO task_lock (task_type, lock_task_id, locked_at, worker_pid)
VALUES
  ('script', NULL, NULL, NULL),
  ('image', NULL, NULL, NULL),
  ('video', NULL, NULL, NULL),
  ('youtube', NULL, NULL, NULL);

SELECT * FROM task_lock;
