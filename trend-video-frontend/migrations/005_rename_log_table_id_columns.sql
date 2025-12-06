-- Migration: Rename id columns (모호한 컬럼명 제거)
-- Date: 2025-11-26
-- Description: 모든 테이블의 id → 명확한 컬럼명으로 변경

-- ============================================================
-- 1단계: 핵심 테이블 (task, task_schedule, user)
-- ⚠️ 가장 영향도 높음 - FK 참조 많음
-- ============================================================
ALTER TABLE task RENAME COLUMN id TO task_id;
ALTER TABLE task_schedule RENAME COLUMN id TO schedule_id;
ALTER TABLE user RENAME COLUMN id TO user_id;

-- ============================================================
-- 2단계: 로그 테이블
-- ============================================================
ALTER TABLE task_log RENAME COLUMN id TO log_id;
ALTER TABLE content_log RENAME COLUMN id TO log_id;
ALTER TABLE automation_log RENAME COLUMN id TO log_id;
ALTER TABLE user_activity_log RENAME COLUMN id TO activity_id;

-- ============================================================
-- 3단계: 설정/세션 테이블
-- ============================================================
ALTER TABLE user_session RENAME COLUMN id TO session_id;
ALTER TABLE youtube_channel_setting RENAME COLUMN id TO setting_id;
ALTER TABLE user_content_category RENAME COLUMN id TO category_id;

-- ============================================================
-- 4단계: 크레딧/결제 테이블
-- ============================================================
ALTER TABLE user_credit_history RENAME COLUMN id TO history_id;
ALTER TABLE user_charge_request RENAME COLUMN id TO request_id;

-- ============================================================
-- 5단계: 쿠팡/크롤링 테이블
-- ============================================================
ALTER TABLE coupang_product RENAME COLUMN id TO coupang_id;
ALTER TABLE coupang_crawl_queue RENAME COLUMN id TO queue_id;
ALTER TABLE product_crawl_link RENAME COLUMN id TO link_id;
ALTER TABLE product_crawl_link_history RENAME COLUMN id TO history_id;
ALTER TABLE product_crawl_link_pending RENAME COLUMN id TO pending_id;

-- ============================================================
-- 6단계: 기타 테이블
-- ============================================================
ALTER TABLE title_pool RENAME COLUMN id TO title_id;

-- ============================================================
-- 7단계: model → ai_model 컬럼명 변경
-- ============================================================
ALTER TABLE content RENAME COLUMN model TO ai_model;
ALTER TABLE task RENAME COLUMN model TO ai_model;
ALTER TABLE title_pool RENAME COLUMN model TO ai_model;
