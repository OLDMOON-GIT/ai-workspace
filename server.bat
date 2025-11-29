@echo off
chcp 65001 > nul
setlocal enabledelayedexpansion

echo ============================================================
echo   🚀 Trend Video Server Manager
echo ============================================================
echo.

cd /d "%~dp0"

:MENU
echo [1] 🔄 Git Pull + 서버 재시작
echo [2] 📥 Git Pull만 (Hot Reload)
echo [3] 🖥️  서버만 시작
echo [4] 🛑 서버 중지
echo [5] 📊 서버 상태 확인
echo [6] ❌ 종료
echo.
set /p choice="선택하세요 (1-6): "

if "%choice%"=="1" goto PULL_AND_RESTART
if "%choice%"=="2" goto PULL_ONLY
if "%choice%"=="3" goto START_SERVER
if "%choice%"=="4" goto STOP_SERVER
if "%choice%"=="5" goto CHECK_STATUS
if "%choice%"=="6" goto END

echo 잘못된 선택입니다.
goto MENU

:PULL_ONLY
echo.
echo 📥 Git Pull 시작 (Hot Reload)...
echo ============================================================

echo.
echo 🔹 Workspace 업데이트...
git pull

echo.
echo 🔹 Frontend 업데이트...
cd trend-video-frontend
git pull
cd ..

echo.
echo 🔹 Backend 업데이트...
cd trend-video-backend
git pull
cd ..

call :RUN_SETUP_LOGIN

echo.
echo ✅ Git Pull 완료! Next.js dev 서버가 실행 중이면 자동으로 Hot Reload됩니다.
echo.
pause
goto MENU

:PULL_AND_RESTART
echo.
echo 🔄 Git Pull + 서버 재시작...
echo ============================================================

REM Git Pull
echo.
echo 🔹 Workspace 업데이트...
git pull

echo.
echo 🔹 Frontend 업데이트...
cd trend-video-frontend
git pull
cd ..

echo.
echo 🔹 Backend 업데이트...
cd trend-video-backend
git pull
cd ..

REM 기존 서버 종료
echo.
echo 🔹 기존 서버 종료 중...
taskkill /F /IM node.exe 2>nul
timeout /t 2 /nobreak > nul

call :RUN_SETUP_LOGIN

REM 서버 시작
echo.
echo [2/2] 서버 시작 중...
cd /d "%~dp0trend-video-frontend"
start "Trend Video Frontend" cmd /k "npm run dev"
cd /d "%~dp0"

echo.
echo ✅ 서버가 시작되었습니다!
echo    Frontend: http://localhost:3000
echo.
pause
goto MENU

:START_SERVER
echo.
echo 🖥️  서버 시작...
echo ============================================================

REM 기존 서버 종료
echo 🔹 기존 프로세스 정리 중...
taskkill /F /IM node.exe 2>nul
timeout /t 2 /nobreak > nul

call :RUN_SETUP_LOGIN

echo [2/2] Frontend 서버 시작 중...
cd /d "%~dp0trend-video-frontend"
start "Trend Video Frontend" cmd /k "npm run dev"
cd /d "%~dp0"

echo.
echo ✅ 서버가 시작되었습니다!
echo    Frontend: http://localhost:3000
echo.
pause
goto MENU

:STOP_SERVER
echo.
echo 🛑 서버 중지...
echo ============================================================
taskkill /F /IM node.exe 2>nul
echo ✅ 모든 Node.js 프로세스가 종료되었습니다.
echo.
pause
goto MENU

:CHECK_STATUS
echo.
echo 📊 서버 상태 확인...
echo ============================================================
echo.
echo 🔹 실행 중인 Node.js 프로세스:
tasklist /FI "IMAGENAME eq node.exe" 2>nul | find "node.exe" > nul
if %errorlevel%==0 (
    tasklist /FI "IMAGENAME eq node.exe"
    echo.
    echo 🔹 포트 3000 사용 상태:
    netstat -ano | findstr :3000
) else (
    echo    실행 중인 Node.js 프로세스가 없습니다.
)
echo.
pause
goto MENU

:END
echo.
echo 👋 종료합니다.
exit /b 0

REM ============================================================
REM 서브루틴: AI 로그인 설정 (1시간 이내면 스킵)
REM ============================================================
:RUN_SETUP_LOGIN
set "TIMESTAMP_FILE=%~dp0.last_login_setup"

REM 1시간(3600초) 이내인지 체크
for /f %%i in ('powershell -NoProfile -Command "if (Test-Path '%TIMESTAMP_FILE%') { $diff = (Get-Date) - (Get-Item '%TIMESTAMP_FILE%').LastWriteTime; if ($diff.TotalSeconds -lt 3600) { 'SKIP' } else { 'RUN' } } else { 'RUN' }"') do set RESULT=%%i

if "%RESULT%"=="SKIP" (
    echo [1/2] AI 로그인 설정 스킵 (1시간 이내 실행됨)
) else (
    echo [1/2] AI 로그인 설정 실행 중...
    cd /d "%~dp0trend-video-backend\src"
    python ai_aggregator\setup_login.py -a chatgpt,gemini,claude,grok
    cd /d "%~dp0"
    REM 타임스탬프 파일 업데이트
    echo %date% %time% > "%TIMESTAMP_FILE%"
)
goto :eof
