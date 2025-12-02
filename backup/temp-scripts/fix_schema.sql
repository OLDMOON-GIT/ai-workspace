-- Fix coupang_crawl_queue table
DROP TABLE IF EXISTS coupang_crawl_queue;

CREATE TABLE coupang_crawl_queue (
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
  INDEX idx_coupang_crawl_queue_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
