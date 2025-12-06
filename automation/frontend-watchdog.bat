@echo off
REM ============================================================
REM Frontend Watchdog - 프론트엔드 서버 헬스체크 및 자동 재시작
REM SPEC-3462: 5분 간격으로 localhost 감시 (포트는 환경변수)
REM BTS-14940: 초기 대기 및 잠금 파일로 충돌 방지
REM ============================================================
title Frontend Watchdog (5min interval)

chcp 65001 >nul
setlocal enabledelayedexpansion
cd /d C:\Users\oldmoon\workspace

REM 환경변수가 없으면 기본값 사용
if not defined TREND_HTTP_PORT set TREND_HTTP_PORT=2000

set LOCKFILE=C:\Users\oldmoon\workspace\automation\.frontend-restart.lock

echo ============================================================
echo   Frontend Watchdog Started
echo   Interval: 5 minutes (300 seconds)
echo   Target: http://localhost:%TREND_HTTP_PORT%
echo   Press Ctrl+C to stop
echo ============================================================
echo.

REM BTS-14940: 초기 대기 - 서버가 완전히 구동될 때까지 120초 대기
echo [%date% %time%] Waiting 120s for initial server startup...
timeout /t 120 /nobreak >nul
echo [%date% %time%] Initial wait complete. Starting health check loop.
echo.

:LOOP
echo [%date% %time%] ========================================
echo [%date% %time%] Health check: localhost:%TREND_HTTP_PORT%

REM PowerShell로 헬스체크 (3초 타임아웃)
powershell -Command "$port = $env:TREND_HTTP_PORT; if (-not $port) { $port = '2000' }; $ProgressPreference='SilentlyContinue'; try { $response = Invoke-WebRequest -Uri \"http://localhost:$port\" -TimeoutSec 3 -UseBasicParsing -ErrorAction Stop; if ($response.StatusCode -eq 200) { Write-Host '[OK] Frontend is running (HTTP 200)'; exit 0 } else { Write-Host '[WARN] Unexpected status:' $response.StatusCode; exit 1 } } catch { Write-Host '[ERROR] Frontend is DOWN:' $_.Exception.Message; exit 1 }"

if %errorlevel% NEQ 0 (
    echo.
    echo [%date% %time%] [RESTART] Frontend server is down! Restarting...
    echo ============================================================

    REM 1. 기존 프로세스 종료
    echo [1/3] Killing existing processes on port %TREND_HTTP_PORT%...
    taskkill /FI "WINDOWTITLE eq Trend Video Frontend*" /F >nul 2>&1
    powershell -Command "$port = $env:TREND_HTTP_PORT; if (-not $port) { $port = '2000' }; Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }"
    timeout /t 3 /nobreak >nul

    REM 2. .next 캐시 삭제 (문제 방지)
    echo [2/3] Cleaning .next cache...
    if exist "trend-video-frontend\.next" (
        rmdir /s /q "trend-video-frontend\.next" >nul 2>&1
    )

    REM 3. 프론트엔드 재시작
    echo [3/3] Starting Frontend server...
    cd /d C:\Users\oldmoon\workspace\trend-video-frontend

    REM BTS-14647: 콘솔 출력을 로그 파일로 저장 (빌드 에러 감지용)
    REM 환경변수 PORT 설정하여 Next.js에 전달
    if not exist "logs" mkdir logs
    start "Trend Video Frontend" cmd /c "set PORT=%TREND_HTTP_PORT% && npm run dev 2>&1 | powershell -Command \"$input | Tee-Object -FilePath 'logs\console.log' -Append\""
    cd /d C:\Users\oldmoon\workspace

    echo.
    echo [%date% %time%] Frontend restart triggered. Waiting 60s for startup...
    timeout /t 60 /nobreak >nul
) else (
    echo [%date% %time%] Frontend is healthy.
)

echo [%date% %time%] Next check in 5 minutes...
echo [%date% %time%] ========================================
echo.
timeout /t 300 /nobreak >nul
goto LOOP
