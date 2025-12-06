USE trend_video;
ALTER TABLE task DROP COLUMN status;
ALTER TABLE task DROP INDEX idx_task_status;
SELECT '✅ task.status 제거 완료!' as result;
DESCRIBE task;
