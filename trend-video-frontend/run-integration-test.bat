@echo off
chcp 65001 > nul

echo ============================================
echo 제목 관리 통합 테스트 실행
echo ============================================
echo.

REM 환경 변수 설정
set NODE_ENV=test
set TEST_AUTH_COOKIE=test-auth-cookie
set NEXT_PUBLIC_API_URL=http://localhost:3000

REM 테스트 실행
cd /d "%~dp0"
npm test -- titles.integration.test.ts --verbose

echo.
echo ============================================
echo 테스트 완료
echo ============================================
pause
