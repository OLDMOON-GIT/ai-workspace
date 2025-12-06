-- Trend Video MySQL Database Schema
-- v4: 22개 필수 테이블 (단수형 통일)
-- Converted from SQLite: 2025-11-30

-- ============================================================
-- 사용자 관리 (3개)
-- ============================================================

-- Users table (단수형: user)
CREATE TABLE IF NOT EXISTS user (
  user_id VARCHAR(255) PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  nickname VARCHAR(100),
  is_admin TINYINT DEFAULT 0,
  credits INT DEFAULT 0,
  is_email_verified TINYINT DEFAULT 0,
  verification_token VARCHAR(255),
  memo TEXT,
  google_sites_url TEXT,
  google_sites_edit_url TEXT,
  google_sites_home_url TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_user_email (email),
  INDEX idx_user_verification_token (verification_token)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- User sessions table (단수형: user_session)
CREATE TABLE IF NOT EXISTS user_session (
  session_id VARCHAR(255) PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  expires_at DATETIME NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user_session_user_id (user_id),
  INDEX idx_user_session_expires_at (expires_at),
  FOREIGN KEY (user_id) REFERENCES user(user_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- User activity logs table (단수형: user_activity_log)
CREATE TABLE IF NOT EXISTS user_activity_log (
  activity_id INT AUTO_INCREMENT PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  action VARCHAR(255) NOT NULL,
  details TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user_activity_log_user_id (user_id),
  INDEX idx_user_activity_log_created_at (created_at),
  FOREIGN KEY (user_id) REFERENCES user(user_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 크레딧/결제 (2개)
-- ============================================================

-- User credit history table
CREATE TABLE IF NOT EXISTS user_credit_history (
  history_id VARCHAR(255) PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  amount INT NOT NULL,
  type VARCHAR(50) NOT NULL,
  description TEXT,
  balance_after INT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user_credit_history_user_id (user_id),
  INDEX idx_user_credit_history_created_at (created_at),
  FOREIGN KEY (user_id) REFERENCES user(user_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- User charge requests table (단수형: user_charge_request)
CREATE TABLE IF NOT EXISTS user_charge_request (
  request_id VARCHAR(255) PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  amount INT NOT NULL,
  status VARCHAR(50) DEFAULT 'pending',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  processed_at DATETIME,
  INDEX idx_user_charge_request_user_id (user_id),
  INDEX idx_user_charge_request_status (status),
  FOREIGN KEY (user_id) REFERENCES user(user_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 콘텐츠 관리 (2개)
-- ============================================================

CREATE TABLE IF NOT EXISTS content (
  content_id CHAR(36) PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  title VARCHAR(500) NOT NULL,
  original_title VARCHAR(500),
  status ENUM('draft', 'script', 'video', 'completed', 'failed') DEFAULT 'draft',  -- BTS-3363: 3단계로 단순화
  score INT DEFAULT 0,
  error TEXT,
  youtube_url VARCHAR(500),
  youtube_channel VARCHAR(255),
  youtube_publish_time DATETIME,
  input_tokens INT,
  output_tokens INT,
  source_content_id CHAR(36),
  ai_model VARCHAR(100),
  prompt_format VARCHAR(100),
  product_info TEXT,
  category VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_content_content_id (content_id),
  INDEX idx_content_user_id (user_id),
  INDEX idx_content_status (status),
  FOREIGN KEY (user_id) REFERENCES user(user_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- content_setting: 제작 설정 (content_id = task_id)
CREATE TABLE IF NOT EXISTS content_setting (
  content_id CHAR(36) PRIMARY KEY,
  script_mode VARCHAR(100),
  media_mode VARCHAR(100),
  tts_voice VARCHAR(100) DEFAULT 'ko-KR-SoonBokNeural',
  tts_speed VARCHAR(20) DEFAULT '+0%',
  auto_create_shortform TINYINT DEFAULT 0,
  tags TEXT,
  settings TEXT,
  youtube_privacy VARCHAR(50) DEFAULT 'private',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (content_id) REFERENCES content(content_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 작업/큐 관리 (4개)
-- ============================================================

-- task: 태스크 정보 관리 (최소화 - 설정은 content/content_setting에!)
CREATE TABLE IF NOT EXISTS task (
  task_id CHAR(36) PRIMARY KEY,
  user_id VARCHAR(255),
  scheduled_time DATETIME,  -- 예약 시간 (NULL이면 예약 없음)
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_task_user_id (user_id),
  INDEX idx_task_scheduled_time (scheduled_time),
  FOREIGN KEY (user_id) REFERENCES user(user_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- task_queue: 단계별 실행 상태 관리 (현재 상태만)
CREATE TABLE IF NOT EXISTS task_queue (
  task_id CHAR(36) PRIMARY KEY,
  type ENUM('schedule', 'script', 'image', 'video', 'youtube') NOT NULL,
  status ENUM('waiting', 'processing', 'completed', 'failed', 'cancelled') NOT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  user_id VARCHAR(255) NOT NULL,
  error TEXT,
  INDEX idx_task_queue_type_status (type, status, created_at ASC),
  INDEX idx_task_queue_user_status (user_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- task_time_log: 각 단계별 실행 시간 기록 (재시도 포함)
CREATE TABLE IF NOT EXISTS task_time_log (
  task_id CHAR(36) NOT NULL,
  type ENUM('script', 'image', 'video', 'youtube') NOT NULL,
  retry_cnt INT NOT NULL DEFAULT 0,
  start_time DATETIME NOT NULL,
  end_time DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (task_id, type, retry_cnt),
  INDEX idx_task_time_log_start_time (start_time),
  FOREIGN KEY (task_id) REFERENCES task(task_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Task lock table (단수형: task_lock)
CREATE TABLE IF NOT EXISTS task_lock (
  task_type ENUM('script', 'image', 'video', 'youtube') PRIMARY KEY,
  lock_task_id CHAR(36),
  locked_at DATETIME,
  worker_pid INT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 초기 락 데이터
INSERT IGNORE INTO task_lock (task_type, lock_task_id, locked_at, worker_pid)
VALUES
  ('script', NULL, NULL, NULL),
  ('image', NULL, NULL, NULL),
  ('video', NULL, NULL, NULL),
  ('youtube', NULL, NULL, NULL);

-- ============================================================
-- 자동화 설정 (2개)
-- ============================================================

-- Automation settings table (단수형: automation_setting)
CREATE TABLE IF NOT EXISTS automation_setting (
  `key` VARCHAR(255) PRIMARY KEY,
  value TEXT NOT NULL,
  description TEXT,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Automation logs table (단수형: automation_log)
CREATE TABLE IF NOT EXISTS automation_log (
  log_id INT AUTO_INCREMENT PRIMARY KEY,
  pipeline_id VARCHAR(255),
  log_level VARCHAR(50) NOT NULL,
  message TEXT NOT NULL,
  metadata TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_automation_log_pipeline_id (pipeline_id),
  INDEX idx_automation_log_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- YouTube/SNS (1개)
-- ============================================================

-- YouTube channel settings table (단수형: youtube_channel_setting)
CREATE TABLE IF NOT EXISTS youtube_channel_setting (
  setting_id VARCHAR(255) PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  channel_id VARCHAR(255) NOT NULL,
  channel_name VARCHAR(255),
  channel_title VARCHAR(255),
  thumbnail_url TEXT,
  subscriber_count INT,
  description TEXT,
  token_file VARCHAR(500),
  color VARCHAR(50),
  posting_mode VARCHAR(50) DEFAULT 'fixed_interval',
  interval_value INT,
  interval_unit VARCHAR(20),
  posting_times TEXT,
  weekday_times TEXT,
  is_active TINYINT DEFAULT 1,
  categories TEXT,
  is_default TINYINT DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY unique_user_channel (user_id, channel_id),
  INDEX idx_youtube_channel_setting_user_id (user_id),
  INDEX idx_youtube_channel_setting_channel_id (channel_id),
  FOREIGN KEY (user_id) REFERENCES user(user_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- YouTube uploads history table (업로드 이력)
CREATE TABLE IF NOT EXISTS youtube_uploads (
  id INT AUTO_INCREMENT PRIMARY KEY,
  content_id CHAR(36) NOT NULL,
  youtube_url VARCHAR(500) NOT NULL,
  youtube_video_id VARCHAR(50),
  status VARCHAR(50) DEFAULT 'active',
  uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_youtube_uploads_content_id (content_id),
  INDEX idx_youtube_uploads_uploaded_at (uploaded_at),
  INDEX idx_youtube_uploads_status (status),
  FOREIGN KEY (content_id) REFERENCES content(content_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 제목 풀 (2개)
-- ============================================================

-- User content category table (대본 카테고리)
CREATE TABLE IF NOT EXISTS user_content_category (
  id VARCHAR(255) PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user_content_category_user_id (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Title pool table
CREATE TABLE IF NOT EXISTS title_pool (
  title_id VARCHAR(255) PRIMARY KEY,
  title VARCHAR(500) NOT NULL,
  category VARCHAR(255) NOT NULL,
  score INT DEFAULT 0,
  ai_model VARCHAR(100),
  used TINYINT DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_title_pool_category (category),
  INDEX idx_title_pool_used (used),
  INDEX idx_title_pool_score (score)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 쿠팡 파트너스 (5개)
-- ============================================================

-- Coupang products table (단수형: coupang_product)
CREATE TABLE IF NOT EXISTS coupang_product (
  coupang_id VARCHAR(255) PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  product_id VARCHAR(255),
  title VARCHAR(500),
  description TEXT,
  category VARCHAR(255),
  thumbnail_url TEXT,
  product_url TEXT,
  deep_link TEXT,
  original_price INT,
  discount_price INT,
  rocket_shipping TINYINT DEFAULT 0,
  free_shipping TINYINT DEFAULT 0,
  status VARCHAR(50) DEFAULT 'pending',
  view_count INT DEFAULT 0,
  click_count INT DEFAULT 0,
  is_favorite TINYINT DEFAULT 0,
  queue_id VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_coupang_product_user_id (user_id),
  INDEX idx_coupang_product_product_id (product_id),
  FOREIGN KEY (user_id) REFERENCES user(user_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Coupang crawl queue table
CREATE TABLE IF NOT EXISTS coupang_crawl_queue (
  queue_id VARCHAR(255) PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  url TEXT NOT NULL,
  product_url TEXT,
  status VARCHAR(50) DEFAULT 'pending',
  retry_count INT DEFAULT 0,
  max_retries INT DEFAULT 3,
  timeout_seconds INT DEFAULT 60,
  error_message TEXT,
  product_info TEXT,
  custom_category VARCHAR(255),
  destination VARCHAR(50) DEFAULT 'my_list',
  source_url TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  processed_at DATETIME,
  INDEX idx_coupang_crawl_queue_user_id (user_id),
  INDEX idx_coupang_crawl_queue_status (status),
  FOREIGN KEY (user_id) REFERENCES user(user_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Product crawl link table
CREATE TABLE IF NOT EXISTS product_crawl_link (
  link_id VARCHAR(255) PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  url TEXT NOT NULL,
  title VARCHAR(500),
  category VARCHAR(255),
  status VARCHAR(50) DEFAULT 'pending',
  original_price DECIMAL(15,2),
  discount_price DECIMAL(15,2),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_product_crawl_link_user_id (user_id),
  INDEX idx_product_crawl_link_status (status),
  FOREIGN KEY (user_id) REFERENCES user(user_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Product crawl link history table (크롤링 히스토리)
CREATE TABLE IF NOT EXISTS product_crawl_link_history (
  history_id VARCHAR(255) PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  source_url TEXT NOT NULL,
  hostname VARCHAR(255),
  last_result_count INT DEFAULT 0,
  last_duplicate_count INT DEFAULT 0,
  last_error_count INT DEFAULT 0,
  last_total_links INT DEFAULT 0,
  last_status VARCHAR(50) DEFAULT 'pending',
  last_message TEXT,
  last_job_id VARCHAR(255),
  last_crawled_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_product_crawl_link_history_user_id (user_id),
  FOREIGN KEY (user_id) REFERENCES user(user_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Product crawl link pending table
CREATE TABLE IF NOT EXISTS product_crawl_link_pending (
  pending_id VARCHAR(255) PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  source_url TEXT NOT NULL,
  product_url TEXT NOT NULL,
  title VARCHAR(500),
  description TEXT,
  image_url TEXT,
  original_price INT,
  discount_price INT,
  category VARCHAR(255),
  status VARCHAR(50) DEFAULT 'pending',
  crawl_status VARCHAR(50) DEFAULT 'not_crawled',
  notes TEXT,
  video_ready TINYINT DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_product_crawl_link_pending_user_id (user_id),
  INDEX idx_product_crawl_link_pending_status (status),
  FOREIGN KEY (user_id) REFERENCES user(user_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 호환성 뷰 (구형 테이블명 지원)
-- ============================================================

-- contents 뷰 (구형 복수형 테이블명 호환)
-- 일부 마이그레이션/테스트 코드가 'contents' 테이블을 참조하므로 뷰로 제공
CREATE OR REPLACE VIEW contents AS
SELECT
  content_id AS id,
  user_id,
  'script' AS type,  -- 기본값: script (구형 스키마 호환)
  prompt_format AS format,
  title,
  original_title,
  status,
  error,
  input_tokens,
  output_tokens,
  source_content_id,
  created_at,
  updated_at
FROM content;

-- ============================================================
-- 총 20개 테이블 + 1개 호환성 뷰 (단수형 통일)
-- ============================================================
