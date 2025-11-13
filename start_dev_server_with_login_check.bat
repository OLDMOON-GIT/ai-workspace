@echo off
chcp 65001 > nul
echo ===================================
echo 트렌드 비디오 서버 시작
echo ===================================
echo.

echo [1/2] AI 로그인 상태 확인 중...
cd /d "C:\Users\oldmoon\workspace\multi-ai-aggregator"
python check_all_logins.py
IF %ERRORLEVEL% NEQ 0 (
    echo.
    echo ===================================
    echo ❌ AI 로그인 확인 실패!
    echo Next.js 개발 서버를 시작할 수 없습니다.
    echo 위에 표시된 지침에 따라 로그인 문제를 해결하세요.
    echo ===================================
    pause
    exit /b %ERRORLEVEL%
)
echo.
echo ✅ AI 로그인 확인 완료.

echo.
echo [2/2] Next.js 개발 서버 시작 중...
cd /d "C:\Users\oldmoon\workspace\trend-video-frontend"
npm run dev
pause
