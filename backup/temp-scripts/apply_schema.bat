@echo off
chcp 65001 > nul
echo Applying coupang_crawl_queue fix...
"C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe" -u root -ptrend2024! trend_video < fix_schema.sql
if %errorlevel%==0 (
    echo SUCCESS - coupang_crawl_queue table fixed!
) else (
    echo FAILED - Check MySQL connection
)
pause
