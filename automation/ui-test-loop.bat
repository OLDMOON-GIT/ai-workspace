@echo off
REM ============================================================
REM UI Test Loop - 1시간 간격으로 시나리오 테스트 실행
REM BTS-3060: cmd /k 래퍼 제거를 위해 별도 배치 파일로 분리
REM SPEC-3350: 야간 자동화를 위해 1시간 간격으로 변경
REM SPEC-3350: 시나리오 테스트로 변경 (test-runner.js)
REM ============================================================
REM 창 제목 설정 (작업 관리자에서 식별용)
title Scenario Test Loop (1h interval)

chcp 65001 >nul
cd /d C:\Users\oldmoon\workspace

echo ============================================================
echo   Scenario Test Loop Started
echo   Interval: 1 hour (3600 seconds)
echo   Press Ctrl+C to stop
echo ============================================================
echo.

:LOOP
echo [%date% %time%] ========================================
echo [%date% %time%] Running Scenario Test...
echo.
echo [1/3] Scanning UI elements and generating usecases...
node automation/auto-usecase-scanner.js --scan
echo.
echo [2/3] Converting usecases to scenarios...
node automation/scenario-generator.js --all
echo.
echo [3/3] Running scenarios...
node automation/test-runner.js --all
echo.
echo [%date% %time%] Test completed. Waiting 1 hour...
echo [%date% %time%] ========================================
timeout /t 3600 /nobreak >nul
goto LOOP
