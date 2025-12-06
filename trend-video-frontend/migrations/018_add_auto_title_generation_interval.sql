-- Add auto title generation interval setting
-- Default: 10 minutes

INSERT INTO automation_setting (`key`, `value`, description)
VALUES ('auto_title_generation_interval', '10', 'Auto title generation interval (in minutes)')
ON DUPLICATE KEY UPDATE `key` = `key`;
