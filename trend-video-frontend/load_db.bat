@echo off
chcp 65001 > nul
echo ============================================================
echo   DB 로드 스크립트
echo ============================================================
echo.

cd /d "%~dp0"

echo 🔹 기존 DB 백업 중...
if exist "data\database.sqlite" (
    move "data\database.sqlite" "data\database.sqlite.bak" >nul 2>&1
    echo    database.sqlite 백업 완료
)
if exist "data\automation.db" (
    move "data\automation.db" "data\automation.db.bak" >nul 2>&1
    echo    automation.db 백업 완료
)

echo.
echo 🔹 SQL 덤프에서 DB 로드 중...

echo    database.sqlite 로드 중...
sqlite3 data\database.sqlite < data\database_dump.sql
if %errorlevel%==0 (
    echo    ✅ database.sqlite 로드 완료
) else (
    echo    ❌ database.sqlite 로드 실패
)

echo    automation.db 로드 중...
sqlite3 data\automation.db < data\automation_dump.sql
if %errorlevel%==0 (
    echo    ✅ automation.db 로드 완료
) else (
    echo    ❌ automation.db 로드 실패
)

echo.
echo ============================================================
echo   DB 로드 완료!
echo ============================================================
pause
