-- Add missing time tracking columns to task_queue
ALTER TABLE task_queue
  ADD COLUMN started_at DATETIME AFTER created_at,
  ADD COLUMN completed_at DATETIME AFTER started_at,
  ADD COLUMN elapsed_time INT AFTER completed_at,
  ADD COLUMN script_completed_at DATETIME AFTER elapsed_time,
  ADD COLUMN image_completed_at DATETIME AFTER script_completed_at,
  ADD COLUMN video_completed_at DATETIME AFTER image_completed_at,
  ADD COLUMN youtube_completed_at DATETIME AFTER video_completed_at;

-- Add priority and metadata columns if not exists
ALTER TABLE task_queue
  ADD COLUMN priority INT DEFAULT 0 AFTER status,
  ADD COLUMN metadata TEXT AFTER user_id,
  ADD COLUMN logs TEXT AFTER metadata;
