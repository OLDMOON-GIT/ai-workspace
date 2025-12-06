@echo off
echo task.status 제거 중...
mysql -h 127.0.0.1 -u root -ptrend2024! trend_video -e "ALTER TABLE task DROP COLUMN status;"
mysql -h 127.0.0.1 -u root -ptrend2024! trend_video -e "ALTER TABLE task DROP INDEX idx_task_status;"
echo 완료!
mysql -h 127.0.0.1 -u root -ptrend2024! trend_video -e "DESCRIBE task;"
