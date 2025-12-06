@echo off
REM ngrok HTTPS 터널링 시작 스크립트
REM trend-video-frontend (port 3000)에 HTTPS 터널 생성

echo ========================================
echo ngrok HTTPS Tunnel for Trend Video
echo ========================================
echo.

REM ngrok 버전 확인
ngrok version

echo.
echo Starting HTTPS tunnel to localhost:3000...
echo.
echo HTTPS URL이 생성되면 YouTube OAuth 등에서 사용 가능합니다.
echo Ctrl+C로 종료
echo.

ngrok http 3000
