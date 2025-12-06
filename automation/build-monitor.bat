@echo off
REM ============================================================
REM build-monitor.bat - 30분마다 빌드 체크 및 서버 재시작
REM BTS-14862: 빌드 에러 감지 시 버그 등록 + 서버 재시작
REM BTS-14964: 폴더 존재 확인 추가
REM ============================================================

chcp 65001 >nul
setlocal enabledelayedexpansion

set WORKSPACE=%~dp0..
set FRONTEND_PATH=%WORKSPACE%\trend-video-frontend
set CHECK_INTERVAL=1800

echo ============================================================
echo   Build Monitor - 30분 간격 빌드 체크
echo   대상: %FRONTEND_PATH%
echo ============================================================
echo.

REM BTS-14940: 첫 빌드 전 5분 대기 (서버 완전 시작 대기)
echo [%date% %time%] 첫 체크 전 5분 대기 (서버 시작 대기)...
timeout /t 300 /nobreak >nul

:LOOP
echo [%date% %time%] 빌드 체크 시작...

REM 폴더 존재 확인 (BTS-14964)
if not exist "%FRONTEND_PATH%" (
    echo [스킵] %FRONTEND_PATH% 폴더가 존재하지 않습니다.
    echo [다음 체크] 30분 후...
    echo.
    timeout /t %CHECK_INTERVAL% /nobreak >nul
    goto LOOP
)

REM package.json 존재 확인 (BTS-14964)
if not exist "%FRONTEND_PATH%\package.json" (
    echo [스킵] %FRONTEND_PATH%\package.json이 존재하지 않습니다.
    echo [다음 체크] 30분 후...
    echo.
    timeout /t %CHECK_INTERVAL% /nobreak >nul
    goto LOOP
)

REM 빌드 실행
cd /d "%FRONTEND_PATH%"
call npm run build > "%WORKSPACE%\automation\build-output.log" 2>&1
set BUILD_EXIT_CODE=%ERRORLEVEL%

if %BUILD_EXIT_CODE% NEQ 0 (
    echo [빌드 실패] exit code: %BUILD_EXIT_CODE%

    REM 버그 등록
    cd /d "%WORKSPACE%"
    node -e "const mysql=require('mysql2/promise');(async()=>{const c=await mysql.createConnection({host:'localhost',user:'root',password:'trend2024',database:'trend_video'});const fs=require('fs');const log=fs.readFileSync('automation/build-output.log','utf8').substring(0,2000);const title='[build_error] 빌드 실패 - build-monitor 감지';await c.execute('INSERT INTO bugs (title,summary,status,priority,type,created_at,updated_at) VALUES (?,?,\"open\",\"P0\",\"bug\",NOW(),NOW())',[title,log]);console.log('버그 등록 완료');await c.end();})().catch(e=>console.error(e));"

    echo [서버 재시작] Frontend 재시작 중...

    REM Frontend 종료
    taskkill /FI "WINDOWTITLE eq Trend Video Frontend*" /F >nul 2>&1
    powershell -Command "Get-NetTCPConnection -LocalPort 2000 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }" >nul 2>&1
    timeout /t 3 /nobreak >nul

    REM .next 캐시 삭제
    if exist "%FRONTEND_PATH%\.next" (
        rmdir /s /q "%FRONTEND_PATH%\.next"
    )

    REM Frontend 재시작
    cd /d "%FRONTEND_PATH%"
    start "Trend Video Frontend" npm run dev

    echo [완료] Frontend 재시작됨
) else (
    echo [빌드 성공]
)

cd /d "%WORKSPACE%"

echo [다음 체크] 30분 후...
echo.

REM 30분 대기 (1800초)
timeout /t %CHECK_INTERVAL% /nobreak >nul

goto LOOP
