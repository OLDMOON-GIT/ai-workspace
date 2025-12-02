-- Add youtube_channel column to content table
ALTER TABLE content ADD COLUMN IF NOT EXISTS youtube_channel VARCHAR(255) AFTER youtube_url;
