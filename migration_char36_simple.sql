-- Migration: VARCHAR(255) -> CHAR(36) for UUID columns
-- 모든 task_id, content_id를 CHAR(36)으로 변경

-- 1. task 테이블 (부모 테이블 먼저)
ALTER TABLE task MODIFY COLUMN task_id CHAR(36) NOT NULL;

-- 2. content 테이블 (부모 테이블)
ALTER TABLE content MODIFY COLUMN content_id CHAR(36) NOT NULL;
ALTER TABLE content MODIFY COLUMN source_content_id CHAR(36);

-- 3. 자식 테이블들 수정
ALTER TABLE task_time_log MODIFY COLUMN task_id CHAR(36) NOT NULL;
ALTER TABLE task_queue MODIFY COLUMN task_id CHAR(36) NOT NULL;
ALTER TABLE content_setting MODIFY COLUMN content_id CHAR(36) NOT NULL;

SELECT 'Migration completed: All task_id/content_id changed to CHAR(36)' AS status;
