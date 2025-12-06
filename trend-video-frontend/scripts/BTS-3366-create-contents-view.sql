-- BTS-3366: 'contents' 호환성 뷰 생성
-- 문제: Table 'trend_video.contents' doesn't exist
-- 원인: MySQL 스키마는 'content' (단수형) 테이블을 사용하지만,
--       일부 구형 코드가 'contents' (복수형) 테이블을 참조
-- 해결: 'contents' 뷰를 생성하여 'content' 테이블을 가리키도록 함

USE trend_video;

-- 기존 contents 뷰/테이블 확인
-- SELECT TABLE_NAME, TABLE_TYPE FROM information_schema.TABLES WHERE TABLE_SCHEMA = 'trend_video' AND TABLE_NAME = 'contents';

-- contents 뷰 생성 (content 테이블을 가리킴)
CREATE OR REPLACE VIEW contents AS
SELECT
  content_id AS id,
  user_id,
  'script' AS type,
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

-- 뷰 확인
SELECT COUNT(*) AS total_contents FROM contents;
SELECT 'BTS-3366 완료: contents 호환성 뷰 생성됨' AS result;
