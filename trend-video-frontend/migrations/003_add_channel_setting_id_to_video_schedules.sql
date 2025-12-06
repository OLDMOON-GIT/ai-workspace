-- Add channel_setting_id column to video_schedules table
-- This column stores the reference to the YouTube channel setting used for this schedule
ALTER TABLE video_schedules ADD COLUMN channel_setting_id TEXT;
