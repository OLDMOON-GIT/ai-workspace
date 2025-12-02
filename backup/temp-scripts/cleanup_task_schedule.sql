-- task_schedule 테이블 정리: 불필요한 컬럼 제거
-- 스케줄 정보만 유지, 나머지는 content/content_setting 참조

USE trend_video;

-- 1. content_id 제거 (task_id로 충분)
ALTER TABLE task_schedule DROP COLUMN IF EXISTS content_id;

-- 2. youtube_publish_time 제거 (content 테이블에 있음)
ALTER TABLE task_schedule DROP COLUMN IF EXISTS youtube_publish_time;

-- 3. retry_count 제거 (task_queue에 있어야 함)
ALTER TABLE task_schedule DROP COLUMN IF EXISTS retry_count;

-- 4. shortform 관련 컬럼 제거 (숏폼 기능 제거됨)
ALTER TABLE task_schedule DROP COLUMN IF EXISTS shortform_task_id;
ALTER TABLE task_schedule DROP COLUMN IF EXISTS parent_youtube_url;
ALTER TABLE task_schedule DROP COLUMN IF EXISTS shortform_uploaded;

-- 확인
DESCRIBE task_schedule;
