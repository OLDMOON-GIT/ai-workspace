@echo off
REM ============================================================
REM services-combined.bat - 모니터링 서비스 통합 실행
REM ============================================================
REM 실행되는 서비스:
REM   1. Log Monitor (node) - 로그 감시, 에러 자동 등록
REM   2. Build Monitor (node) - 빌드 에러 감지 (30분 간격)
REM   3. UI Test Loop (node) - UI 테스트 반복 (10분 간격)
REM ============================================================
REM NOTE: Spawning Pool은 별도 창에서 실행 (분리 필수!)
REM ============================================================

chcp 65001 >nul
setlocal enabledelayedexpansion

cd /d "%~dp0.."

echo ============================================================
echo   Monitoring Services - Log + Build + UI Test
echo ============================================================
echo   시작시간: %date% %time%
echo ============================================================
echo.

REM TypeScript 빌드
echo [1/2] Building TypeScript...
cd mcp-debugger
call npx tsc >nul 2>&1
cd ..

REM 병렬 실행
echo [2/2] Starting monitoring services...

REM Log Monitor
echo   - Log Monitor starting...
start /B "" cmd /c "cd mcp-debugger && node dist/log-monitor.js 2>&1"

REM Build Monitor (30분 간격)
echo   - Build Monitor starting (30min interval)...
start /B "" cmd /c "automation\build-monitor-loop.bat 2>&1"

REM UI Test Loop (10분 간격)
echo   - UI Test Loop starting (10min interval)...
start /B "" cmd /c "automation\ui-test-loop.bat 2>&1"

echo.
echo ============================================================
echo   Log Monitor   : 로그 실시간 감시 중
echo   Build Monitor : 30분 간격 빌드 체크
echo   UI Test Loop  : 10분 간격 UI 테스트
echo ============================================================
echo.
echo   이 창을 닫으면 모니터링 서비스가 종료됩니다.
echo   Ctrl+C로 종료하세요.
echo ============================================================

REM 메인 프로세스 유지
:WAIT_LOOP
timeout /t 60 /nobreak >nul
goto WAIT_LOOP
