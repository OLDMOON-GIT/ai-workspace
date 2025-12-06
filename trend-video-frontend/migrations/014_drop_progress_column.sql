-- Migration: Drop progress column from content table
-- Date: 2025-11-28
-- Reason: progress는 status로 계산 (calculateProgress 함수), DB 저장 불필요

ALTER TABLE content DROP COLUMN progress;
