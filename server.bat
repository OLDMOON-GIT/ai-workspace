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

echo [1/2] AI 로그인 설정 실행 중...
cd /d "%~dp0trend-video-backend\src"
python ai_aggregator\setup_login.py -a chatgpt,gemini,claude,grok

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

REM AI 로그인 설정 (크롬 브라우저 체크)
echo [1/2] AI 로그인 설정 실행 중...
cd /d "%~dp0trend-video-backend\src"
python ai_aggregator\setup_login.py -a chatgpt,gemini,claude,grok

REM 서버 시작
echo.
echo 🔹 서버 시작 중...
cd trend-video-frontend
start "Trend Video Frontend" cmd /k "npm run dev"
cd ..

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

REM AI 로그인 설정 (크롬 브라우저 체크)
echo [1/2] AI 로그인 설정 실행 중...
cd /d "%~dp0trend-video-backend\src"
python ai_aggregator\setup_login.py -a chatgpt,gemini,claude,grok

echo [2/2] Frontend 서버 시작...
cd trend-video-frontend
start "Trend Video Frontend" cmd /k "npm run dev"
cd ..

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
