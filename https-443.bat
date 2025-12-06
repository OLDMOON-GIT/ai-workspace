@echo off
REM HTTPS Proxy Server 시작 (관리자 권한 필요)
REM BTS-0001212: localhost:443 HTTPS 설정
REM
REM 사용법: 관리자 권한으로 실행
REM   - 우클릭 → "관리자 권한으로 실행"
REM   - 또는 관리자 CMD에서 실행

echo ========================================
echo  HTTPS Proxy (localhost:443)
echo ========================================
echo.

REM 관리자 권한 확인
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo ERROR: 관리자 권한이 필요합니다!
    echo.
    echo 이 파일을 우클릭하고 "관리자 권한으로 실행"을 선택하세요.
    pause
    exit /b 1
)

cd /d C:\Users\oldmoon\workspace\trend-video-frontend
node https-proxy.js
