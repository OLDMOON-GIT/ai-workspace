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
    echo   ⚠️  로컬 변경사항이 모두 덮어씌워집니다!
    echo ============================================================
) else (
    echo ============================================================
    echo   [개발 모드] 안전 업데이트 + Server Start
    echo   ✅ 로컬 변경사항이 보존됩니다
    echo   💡 강제 업데이트: az.bat --force
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

echo.
echo server.bat 실행 중...
echo.

REM server.bat 호출
call server.bat
