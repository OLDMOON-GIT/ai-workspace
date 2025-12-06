-- =============================================
-- Drop coupang_crawl_queue VIEW and create TABLE
-- Date: 2025-11-26
-- Description: VIEW를 DROP하고 실제 테이블로 재생성
-- =============================================

-- 1. 기존 VIEW 삭제 (존재하는 경우)
DROP VIEW IF EXISTS coupang_crawl_queue;

-- 2. 실제 테이블 생성
CREATE TABLE IF NOT EXISTS coupang_crawl_queue (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  product_url TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('pending', 'processing', 'completed', 'failed')),
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  timeout_seconds INTEGER DEFAULT 30,
  error_message TEXT,
  product_info TEXT,
  custom_category TEXT,
  destination TEXT,
  source_url TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  processed_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 3. 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_coupang_crawl_queue_user_id ON coupang_crawl_queue(user_id);
CREATE INDEX IF NOT EXISTS idx_coupang_crawl_queue_status ON coupang_crawl_queue(status);
CREATE INDEX IF NOT EXISTS idx_coupang_crawl_queue_created_at ON coupang_crawl_queue(created_at);
