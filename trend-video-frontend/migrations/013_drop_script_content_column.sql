-- Migration: Drop script_content column from content table
-- Date: 2025-11-27
-- Reason: 대본 내용은 파일 기반으로 이동 (tasks/{content_id}/story.json)

-- SQLite 3.35.0+ supports ALTER TABLE DROP COLUMN
ALTER TABLE content DROP COLUMN script_content;
