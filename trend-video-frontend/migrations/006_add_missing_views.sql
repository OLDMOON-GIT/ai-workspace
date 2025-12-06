-- =============================================
-- Additional Compatibility Views
-- Date: 2025-11-24
-- Description: 누락된 호환성 뷰 추가
-- =============================================

-- content_logs 뷰 (unified_logs 기반)
CREATE VIEW IF NOT EXISTS content_logs AS
SELECT
  id,
  entity_id as content_id,
  message as log_message,
  created_at
FROM unified_logs
WHERE source = 'content' OR entity_type = 'queue';