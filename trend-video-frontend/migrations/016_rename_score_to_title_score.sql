-- Rename content.score to content.title_score
ALTER TABLE content CHANGE COLUMN score title_score INT DEFAULT 0;
