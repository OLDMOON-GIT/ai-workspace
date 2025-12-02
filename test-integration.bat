@echo off
chcp 65001 > nul
echo.
echo ╔════════════════════════════════════════════════════════════════╗
echo ║                                                                ║
echo ║   🧪 통합 테스트 실행기                                       ║
echo ║                                                                ║
echo ╚════════════════════════════════════════════════════════════════╝
echo.

echo 🔍 테스트 스크립트 확인 중...
if not exist "test-product-youtube-integration.mjs" (
    echo ❌ 테스트 스크립트를 찾을 수 없습니다.
    echo    파일: test-product-youtube-integration.mjs
    pause
    exit /b 1
)

echo ✅ 테스트 스크립트 발견
echo.
echo 🚀 통합 테스트 실행 중...
echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo.

node test-product-youtube-integration.mjs

echo.
echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo.

if %ERRORLEVEL% EQU 0 (
    echo ✅ 모든 테스트 통과!
) else (
    echo ❌ 테스트 실패 (Exit code: %ERRORLEVEL%^)
)

echo.
pause
