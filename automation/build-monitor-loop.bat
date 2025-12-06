@echo off
REM Build Monitor Loop - 30분 간격으로 빌드 체크
chcp 65001 >nul
cd /d "%~dp0.."

:LOOP
echo [%date% %time%] Build check starting...
node automation/build-check.js 2>&1
echo [%date% %time%] Build check done. Next in 30 minutes.
timeout /t 1800 /nobreak >nul
goto LOOP
