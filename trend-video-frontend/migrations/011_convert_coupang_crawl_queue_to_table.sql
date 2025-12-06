-- =============================================
-- Add columns to coupang_crawl_queue table
-- Date: 2025-11-26
-- Description: destination, source_url 컬럼 추가
-- =============================================

-- coupang_crawl_queue 테이블에 destination 컬럼 추가
ALTER TABLE coupang_crawl_queue ADD COLUMN destination TEXT;

-- coupang_crawl_queue 테이블에 source_url 컬럼 추가
ALTER TABLE coupang_crawl_queue ADD COLUMN source_url TEXT;
