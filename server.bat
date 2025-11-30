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
git stash -q 2>nul
git pull
if %errorlevel% neq 0 (
    echo    ⚠️ [WARNING] Pull 실패! 로컬 변경사항 확인 필요
)

echo.
echo 🔹 Frontend 업데이트...
cd trend-video-frontend
git stash -q 2>nul
git pull
if %errorlevel% neq 0 (
    echo    ⚠️ [WARNING] Pull 실패! 로컬 변경사항 확인 필요
)
cd ..

echo.
echo 🔹 Backend 업데이트...
cd trend-video-backend
git stash -q 2>nul
git pull
if %errorlevel% neq 0 (
    echo    ⚠️ [WARNING] Pull 실패! 로컬 변경사항 확인 필요
)
cd ..

call :RUN_SETUP_LOGIN

echo.
echo ✅ Git Pull 완료! Next.js dev 서버가 실행 중이면 자동으로 Hot Reload됩니다.
echo    💡 Stash된 변경사항 복구: git stash pop
echo.
pause
goto MENU

:PULL_AND_RESTART
echo.
echo 🔄 Git Pull + 서버 재시작...
echo ============================================================

REM Git Pull (stash 후 pull)
echo.
echo 🔹 Workspace 업데이트...
git stash -q 2>nul
git pull
if %errorlevel% neq 0 (
    echo    ⚠️ [WARNING] Pull 실패! 로컬 변경사항 확인 필요
)

echo.
echo 🔹 Frontend 업데이트...
cd trend-video-frontend
git stash -q 2>nul
git pull
if %errorlevel% neq 0 (
    echo    ⚠️ [WARNING] Pull 실패! 로컬 변경사항 확인 필요
)
cd ..

echo.
echo 🔹 Backend 업데이트...
cd trend-video-backend
git stash -q 2>nul
git pull
if %errorlevel% neq 0 (
    echo    ⚠️ [WARNING] Pull 실패! 로컬 변경사항 확인 필요
)
cd ..

REM 기존 서버 종료 (포트 3000만)
echo.
echo 🔹 기존 서버 종료 중 (포트 3000)...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3000 ^| findstr LISTENING') do taskkill /F /PID %%a 2>nul
timeout /t 2 /nobreak > nul

call :INIT_MYSQL
call :RUN_SETUP_LOGIN

REM 서버 시작
echo.
echo [3/3] 서버 시작 중...
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

REM 기존 서버 종료 (포트 3000만)
echo 🔹 기존 프로세스 정리 중 (포트 3000)...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3000 ^| findstr LISTENING') do taskkill /F /PID %%a 2>nul
timeout /t 2 /nobreak > nul

call :INIT_MYSQL
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
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3000 ^| findstr LISTENING') do taskkill /F /PID %%a 2>nul
echo ✅ 포트 3000 서버가 종료되었습니다.
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
REM 서브루틴: MySQL 초기화 (스키마 변경 시 자동 재적용)
REM ============================================================
:INIT_MYSQL
set MYSQL_USER=root
set MYSQL_PASSWORD=trend2024!
set MYSQL_DATABASE=trend_video
set SCHEMA_FILE=%~dp0trend-video-frontend\schema-mysql.sql
set HASH_FILE=%~dp0.schema_hash

REM 스키마 파일 없으면 스킵
if not exist "%SCHEMA_FILE%" (
    echo 🔹 MySQL [SKIP] schema-mysql.sql 없음
    goto :eof
)

REM 스키마 파일 해시 계산
for /f %%i in ('certutil -hashfile "%SCHEMA_FILE%" MD5 ^| findstr /v "hash"') do set NEW_HASH=%%i

REM 이전 해시와 비교
set OLD_HASH=
if exist "%HASH_FILE%" (
    set /p OLD_HASH=<"%HASH_FILE%"
)

if "%NEW_HASH%"=="%OLD_HASH%" (
    echo 🔹 MySQL 스키마 변경 없음 [SKIP]
    goto :eof
)

echo.
echo 🔹 MySQL 스키마 적용 중...

REM DB 생성
mysql -u %MYSQL_USER% -p%MYSQL_PASSWORD% -e "CREATE DATABASE IF NOT EXISTS %MYSQL_DATABASE% CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;" 2>nul

REM 스키마 적용
mysql -u %MYSQL_USER% -p%MYSQL_PASSWORD% %MYSQL_DATABASE% < "%SCHEMA_FILE%" 2>nul
echo    스키마 적용 완료
echo %NEW_HASH%> "%HASH_FILE%"
goto :eof

REM ============================================================
REM 서브루틴: AI 로그인 설정 (1시간 이내면 스킵)
REM ============================================================
:RUN_SETUP_LOGIN
for /f %%i in ('python "%~dp0check_login_time.py"') do set "RESULT=%%i"

if "%RESULT%"=="SKIP" (
    echo [1/2] AI 로그인 설정 스킵 - 1시간 이내 실행됨
    goto :eof
)

echo [1/2] AI 로그인 설정 실행 중...
REM Playwright 설치 확인
python -c "import playwright" 2>nul
if errorlevel 1 (
    echo       Playwright 설치 중...
    pip install playwright
    playwright install chromium
)
cd /d "%~dp0trend-video-backend\src"
python ai_aggregator\setup_login.py -a chatgpt,gemini,claude,grok
cd /d "%~dp0"
echo %date% %time% > "%~dp0.last_login_setup"
goto :eof
