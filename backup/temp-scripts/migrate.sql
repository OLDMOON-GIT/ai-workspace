-- Migration: Add missing columns

-- Add youtube_channel to content table
ALTER TABLE content ADD COLUMN IF NOT EXISTS youtube_channel VARCHAR(255) AFTER youtube_url;

-- Add media_mode to content_setting table
ALTER TABLE content_setting ADD COLUMN IF NOT EXISTS media_mode VARCHAR(100) DEFAULT 'crawl' AFTER script_mode;

SELECT 'Migration completed' AS status;
