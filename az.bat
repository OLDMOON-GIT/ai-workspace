@echo off
chcp 65001 > nul
setlocal enabledelayedexpansion

echo ============================================================
echo   Auto Update + Server Start
echo ============================================================
echo.

cd /d "%~dp0"

echo Git Pull 시작...
echo ============================================================

echo.
echo [1/3] Workspace 업데이트...
git stash -q 2>nul
git pull
if %errorlevel% neq 0 (
    echo    [WARNING] Pull 실패! 로컬 변경사항 확인 필요
)

echo.
echo [2/3] Frontend 업데이트...
cd trend-video-frontend
git stash -q 2>nul
git pull
if %errorlevel% neq 0 (
    echo    [WARNING] Pull 실패! 로컬 변경사항 확인 필요
)
cd ..

echo.
echo [3/3] Backend 업데이트...
cd trend-video-backend
git stash -q 2>nul
git pull
if %errorlevel% neq 0 (
    echo    [WARNING] Pull 실패! 로컬 변경사항 확인 필요
)
cd ..

echo.
echo Git Pull 완료!
echo.
echo server.bat 실행 중...
echo.

REM server.bat 호출
call server.bat
