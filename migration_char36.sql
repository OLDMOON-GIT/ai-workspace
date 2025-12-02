-- Migration: VARCHAR(255) -> CHAR(36) for UUID columns
-- 모든 task_id, content_id를 CHAR(36)으로 변경
-- task_lock.locked_by -> lock_task_id로 이름 변경

-- 1. 모든 FK 제약 조건 먼저 삭제
ALTER TABLE task_time_log DROP FOREIGN KEY task_time_log_ibfk_1;
ALTER TABLE content_setting DROP FOREIGN KEY content_setting_ibfk_1;

-- 2. task 테이블 (부모 테이블 먼저)
ALTER TABLE task MODIFY COLUMN task_id CHAR(36) NOT NULL;

-- 4. content 테이블 (부모 테이블)
ALTER TABLE content MODIFY COLUMN content_id CHAR(36) NOT NULL;
ALTER TABLE content MODIFY COLUMN source_content_id CHAR(36);

-- 5. 자식 테이블들 수정
ALTER TABLE task_time_log MODIFY COLUMN task_id CHAR(36) NOT NULL;
ALTER TABLE task_queue MODIFY COLUMN task_id CHAR(36) NOT NULL;
ALTER TABLE content_setting MODIFY COLUMN content_id CHAR(36) NOT NULL;

-- 6. FK 재생성
ALTER TABLE task_time_log ADD CONSTRAINT task_time_log_ibfk_1
  FOREIGN KEY (task_id) REFERENCES task(task_id) ON DELETE CASCADE;

ALTER TABLE content_setting ADD CONSTRAINT content_setting_ibfk_1
  FOREIGN KEY (content_id) REFERENCES content(content_id) ON DELETE CASCADE;

SELECT 'Migration completed: All task_id/content_id changed to CHAR(36)' AS status;
