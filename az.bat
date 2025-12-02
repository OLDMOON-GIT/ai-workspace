@echo off
chcp 65001 > nul
setlocal enabledelayedexpansion

REM 모드 설정: --force 옵션이면 강제 모드, 아니면 개발 모드
set FORCE_MODE=0
if "%1"=="--force" set FORCE_MODE=1
if "%1"=="-f" set FORCE_MODE=1

if %FORCE_MODE%==1 (
    echo ============================================================
    echo   [초기 설치 모드] 강제 업데이트 + Server Start
    echo   주의: 로컬 변경사항이 모두 덮어씌워집니다
    echo ============================================================
) else (
    echo ============================================================
    echo   [개발 모드] 안전 업데이트 + Server Start
    echo   로컬 변경사항이 보존됩니다
    echo   강제 업데이트: az.bat --force
    echo ============================================================
)
echo.

cd /d "%~dp0"

echo Git Pull 시작...
echo ============================================================

echo.
echo [1/3] Workspace 업데이트...
if %FORCE_MODE%==1 (
    git fetch origin
    git reset --hard origin/master
) else (
    git stash -q 2>nul
    set WORKSPACE_STASHED=!errorlevel!
    git pull
    if !errorlevel! neq 0 (
        echo    [WARNING] Pull 실패! 로컬 변경사항 확인 필요
    )
    if !WORKSPACE_STASHED!==0 (
        git stash pop -q 2>nul
        if !errorlevel! neq 0 echo    [INFO] Stash pop 충돌 - 수동 확인 필요
    )
)

echo.
echo [2/3] Frontend 업데이트...
cd trend-video-frontend
if %FORCE_MODE%==1 (
    git fetch origin
    git reset --hard origin/master
) else (
    git stash -q 2>nul
    set FRONTEND_STASHED=!errorlevel!
    git pull
    if !errorlevel! neq 0 (
        echo    [WARNING] Pull 실패! 로컬 변경사항 확인 필요
    )
    if !FRONTEND_STASHED!==0 (
        git stash pop -q 2>nul
        if !errorlevel! neq 0 echo    [INFO] Stash pop 충돌 - 수동 확인 필요
    )
)
cd ..

echo.
echo [3/3] Backend 업데이트...
cd trend-video-backend
if %FORCE_MODE%==1 (
    git fetch origin
    git reset --hard origin/master
) else (
    git stash -q 2>nul
    set BACKEND_STASHED=!errorlevel!
    git pull
    if !errorlevel! neq 0 (
        echo    [WARNING] Pull 실패! 로컬 변경사항 확인 필요
    )
    if !BACKEND_STASHED!==0 (
        git stash pop -q 2>nul
        if !errorlevel! neq 0 echo    [INFO] Stash pop 충돌 - 수동 확인 필요
    )
)
cd ..

echo.
echo Git Pull 완료!

REM 초기 설치 모드일 때만 셋업 실행
if %FORCE_MODE%==1 (
    echo.
    echo ============================================================
    echo   [초기 셋업] 의존성 설치 + AI 로그인 설정
    echo ============================================================

    echo.
    echo [1/4] Frontend 의존성 설치...
    cd trend-video-frontend
    call npm install
    cd ..

    echo.
    echo [2/4] Backend 의존성 설치...
    cd trend-video-backend
    pip install -r requirements.txt 2>nul
    cd ..

    echo.
    echo [3/4] Playwright 설치...
    pip install playwright >nul 2>&1
    playwright install chromium >nul 2>&1

    echo.
    echo [4/4] AI 로그인 설정...
    cd trend-video-backend\src
    python ai_aggregator\setup_login.py -a chatgpt,gemini,claude,grok
    cd ..\..
    echo %date% %time% > "%~dp0.last_login_setup"

    echo.
    echo 초기 셋업 완료!
)

REM 초기 실행 시 자동으로 서버 시작
call :START_SERVER

:MENU
echo.
echo ============================================================
echo [1] 서버 재시작 (기본값)
echo [2] UI 테스트 재실행
echo [3] 서버 중지
echo [4] 종료
echo ============================================================
set /p choice="선택하세요 (1-4, 엔터=1): "

REM 빈 입력이면 기본값 1
if "%choice%"=="" set choice=1

if "%choice%"=="1" goto RESTART_SERVER
if "%choice%"=="2" goto RUN_TEST
if "%choice%"=="3" goto STOP_SERVER
if "%choice%"=="4" goto END

echo 잘못된 선택입니다.
goto MENU

:RESTART_SERVER
call :STOP_SERVER
call :START_SERVER
goto MENU

:RUN_TEST
echo.
echo UI 테스트 실행 중...
echo ============================================================
node automation/auto-suite.js --url http://localhost:2000 --name az-smoke --worker az
echo.
pause
goto MENU

:STOP_SERVER
echo.
echo 서버 중지 중...
echo ============================================================
powershell -Command "Get-NetTCPConnection -LocalPort 2000 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }"
timeout /t 2 /nobreak >nul
echo 서버가 중지되었습니다.
goto :eof

:START_SERVER
echo.
echo 서버 자동 재시작 중...
echo ============================================================

REM 포트 2000 사용 중인 프로세스 종료
echo [1/4] 포트 2000 사용 중인 프로세스 종료...
powershell -Command "Get-NetTCPConnection -LocalPort 2000 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }"
timeout /t 2 /nobreak >nul

echo [2/4] Next.js 빌드 캐시 삭제 (.next)...
if exist "%~dp0trend-video-frontend\.next" (
    rmdir /s /q "%~dp0trend-video-frontend\.next"
    echo    .next 디렉토리 삭제됨
) else (
    echo    .next 없음 [SKIP]
)

echo [3/4] Frontend 서버 + 통합 워커 런치...
cd /d "%~dp0trend-video-frontend"
start "Trend Video Frontend" cmd /k "npm run dev"
cd /d "%~dp0"

echo [4/4] 자동 UI 체크 + 버그 리포트...
timeout /t 5 /nobreak >nul
REM MCP Debugger 서버 시작 (@디버깅 툴용)
cd /d "%~dp0mcp-debugger"
start "MCP Debugger" cmd /k "npm run start"
cd /d "%~dp0"
node automation/auto-suite.js --url http://localhost:2000 --name az-smoke --worker az

echo.
echo 모든 서버가 런치되었습니다
echo    Frontend: http://localhost:2000
echo    Workers : 통합 워커 (Script + Image + Video + YouTube) - 로그 창
echo    AutoRun : automation/auto-suite.js (UI 체크 + 버그 리스팅)
echo.
goto :eof

:END
echo.
echo 종료합니다.
exit /b 0
