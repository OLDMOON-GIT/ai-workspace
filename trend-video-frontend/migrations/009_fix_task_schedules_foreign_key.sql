-- =============================================
-- Fix task_schedules Foreign Key
-- Date: 2025-11-24
-- Description: task_schedules의 외래키 제약 수정
-- =============================================

-- SQLite는 ALTER TABLE로 FOREIGN KEY를 변경할 수 없으므로
-- 테이블을 다시 생성해야 합니다

-- 1. 기존 데이터 백업
CREATE TABLE task_schedules_temp AS SELECT * FROM task_schedules;

-- 2. 기존 테이블 삭제
DROP TABLE task_schedules;

-- 3. 새로운 테이블 생성 (외래키 제거)
CREATE TABLE task_schedules (
  id TEXT PRIMARY KEY,
  task_id TEXT,
  title_id TEXT,
  user_id TEXT,
  scheduled_time DATETIME NOT NULL,
  youtube_publish_time DATETIME,
  youtube_privacy TEXT DEFAULT 'public',
  youtube_url TEXT,
  channel_setting_id TEXT,
  media_mode TEXT DEFAULT 'upload',
  status TEXT DEFAULT 'pending' CHECK(status IN (
    'pending', 'processing', 'completed', 'failed',
    'cancelled', 'waiting_for_upload'
  )),
  script_id TEXT,
  video_id TEXT,
  youtube_upload_id TEXT,
  shortform_task_id TEXT,
  parent_youtube_url TEXT,
  shortform_uploaded INTEGER DEFAULT 0,
  error TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  -- 외래키 제약 제거 (video_titles가 뷰이므로)
);

-- 4. 인덱스 재생성
CREATE INDEX IF NOT EXISTS idx_task_schedules_task_id ON task_schedules(task_id);
CREATE INDEX IF NOT EXISTS idx_task_schedules_title_id ON task_schedules(title_id);
CREATE INDEX IF NOT EXISTS idx_task_schedules_status ON task_schedules(status);
CREATE INDEX IF NOT EXISTS idx_task_schedules_scheduled ON task_schedules(scheduled_time);
CREATE INDEX IF NOT EXISTS idx_task_schedules_user_id ON task_schedules(user_id);

-- 5. 데이터 복원
INSERT INTO task_schedules
SELECT * FROM task_schedules_temp;

-- 6. 임시 테이블 삭제
DROP TABLE task_schedules_temp;