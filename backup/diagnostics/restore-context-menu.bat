@echo off
chcp 65001 > nul
echo ========================================
echo   컨텍스트 메뉴 복원
echo ========================================
echo.
echo 비활성화된 Shell Extensions를 복원합니다.
echo.
echo 관리자 권한으로 실행됩니다...
echo.
pause

powershell -Command "Start-Process powershell -ArgumentList '-ExecutionPolicy Bypass -File \"%~dp0restore-context-menu.ps1\"' -Verb RunAs"
