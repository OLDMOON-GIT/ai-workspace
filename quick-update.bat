@echo off
chcp 65001 > nul
cd /d "%~dp0"

echo 🔄 빠른 업데이트 시작...
echo.

echo 📥 Git Pull...
git pull
cd trend-video-frontend && git pull && cd ..
cd trend-video-backend && git pull && cd ..

echo.
echo ✅ 완료! Hot Reload가 자동 적용됩니다.
timeout /t 3
