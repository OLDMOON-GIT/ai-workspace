@echo off
REM ============================================================
REM az.bat - Trend Video 개발 서버 통합 실행 스크립트
REM ============================================================
REM
REM 사용법:
REM   az.bat          - 일반 모드 (git stash/pull/pop + 서버 시작)
REM   az.bat --force  - 강제 모드 (origin/master로 리셋 + 의존성 설치)
REM   az.bat -f       - 강제 모드 (위와 동일)
REM
REM 실행되는 프로세스:
REM   1. Frontend (npm run dev)
REM      - Next.js 개발 서버 (http://localhost:2000)
REM      - Unified Worker 포함 (스크립트/이미지/영상 생성)
REM
REM   2. MCP Debugger (npm run start)
REM      - MCP 프로토콜 디버깅 서버
REM      - 에러 큐 관리 및 API 제공
REM
REM   3. Log Monitor (node dist/log-monitor.js)
REM      - 로그 파일 실시간 감시 (chokidar)
REM      - 에러 패턴 감지 시 bugs 테이블에 자동 등록
REM      - 감시 대상: trend-video-frontend/*.log, trend-video-backend/*.log
REM
REM   4. Spawning Pool (python spawning-pool.py)
REM      - bugs 테이블에서 open 상태 버그 조회
REM      - Claude/Codex/Gemini 워커 자동 스폰
REM      - 워커당 1개 버그 할당, 최대 4개 동시 실행
REM      - 스폰 실패 시 자동 롤백 (in_progress -> open)
REM
REM   5. UI Test Loop (auto-suite.js, 10분 간격)
REM      - Playwright 기반 UI 자동화 테스트
REM      - 스모크 테스트 시나리오 반복 실행
REM      - 실패 시 스크린샷/비디오 저장 + 버그 자동 등록
REM
REM ============================================================

chcp 65001 >nul
setlocal enabledelayedexpansion

set FORCE_MODE=0
if "%1"=="--force" set FORCE_MODE=1
if "%1"=="-f" set FORCE_MODE=1

if %FORCE_MODE%==1 (
    echo ============================================================
    echo   [FORCE MODE] Reset to origin/master, Install dependencies
    echo ============================================================
) else (
    echo ============================================================
    echo   [DEV MODE] Safe update stash/pull/pop, Server Start
    echo   Force update: az.bat --force
    echo ============================================================
)
echo.

cd /d "%~dp0"

echo Git Pull...
echo ============================================================

echo.
echo [1/3] Workspace update...
if %FORCE_MODE%==1 (
    git fetch origin 2>nul
    git reset --hard origin/master 2>nul
) else (
    git stash -q 2>nul
    set WORKSPACE_STASHED=!errorlevel!
    git pull 2>nul
    if !WORKSPACE_STASHED!==0 (
        git stash pop -q 2>nul
    )
)

echo.
echo [2/3] Frontend update...
cd trend-video-frontend
if %FORCE_MODE%==1 (
    git fetch origin 2>nul
    git reset --hard origin/master 2>nul
) else (
    git stash -q 2>nul
    set FRONTEND_STASHED=!errorlevel!
    git pull 2>nul
    if !FRONTEND_STASHED!==0 (
        git stash pop -q 2>nul
    )
)
cd ..

echo.
echo [3/3] Backend update...
cd trend-video-backend
if %FORCE_MODE%==1 (
    git fetch origin 2>nul
    git reset --hard origin/master 2>nul
) else (
    git stash -q 2>nul
    set BACKEND_STASHED=!errorlevel!
    git pull 2>nul
    if !BACKEND_STASHED!==0 (
        git stash pop -q 2>nul
    )
)
cd ..

echo.
echo Git Pull done!

if %FORCE_MODE%==1 (
    echo.
    echo ============================================================
    echo   [SETUP] Install dependencies
    echo ============================================================

    echo.
    echo [1/4] Frontend npm install...
    cd trend-video-frontend
    call npm install
    cd ..

    echo.
    echo [2/4] Backend pip install...
    cd trend-video-backend
    pip install -r requirements.txt 2>nul
    cd ..

    echo.
    echo [3/4] Playwright install...
    pip install playwright >nul 2>nul
    playwright install chromium >nul 2>nul

    echo.
    echo [4/4] AI login setup...
    cd trend-video-backend\src
    python ai_aggregator\setup_login.py -a chatgpt,gemini,claude,grok
    cd ..\..

    echo.
    echo Setup done!
)

call :START_SERVER

:MENU
echo.
echo ============================================================
echo [0] Restart ALL
echo [1] Restart Frontend
echo [2] Restart MCP Debugger
echo [3] Restart Log Monitor
echo [4] Restart Spawning Pool
echo [5] Restart UI Test Loop
echo [6] Run UI Test (once)
echo [7] Stop ALL
echo [8] Exit
echo ============================================================
set /p choice="Select (0-8, Enter=0): "

if "%choice%"=="" set choice=0

if "%choice%"=="0" goto RESTART_ALL
if "%choice%"=="1" goto RESTART_FRONTEND
if "%choice%"=="2" goto RESTART_MCP
if "%choice%"=="3" goto RESTART_LOG_MONITOR
if "%choice%"=="4" goto RESTART_SPAWNING_POOL
if "%choice%"=="5" goto RESTART_UI_LOOP
if "%choice%"=="6" goto RUN_TEST
if "%choice%"=="7" goto STOP_ALL
if "%choice%"=="8" goto END

echo Invalid choice.
goto MENU

:RESTART_ALL
call :STOP_ALL_QUIET
call :START_SERVER
goto MENU

:RESTART_FRONTEND
echo.
echo Restarting Frontend...
echo ============================================================
REM 창 제목으로 종료
taskkill /FI "WINDOWTITLE eq Trend Video Frontend*" /F >nul 2>&1
powershell -Command "Get-NetTCPConnection -LocalPort 2000 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }"
timeout /t 2 /nobreak >nul
cd /d "%~dp0trend-video-frontend"
REM BTS-3060: cmd /k 없이 직접 실행 (창 제목으로 식별)
start "Trend Video Frontend" npm run dev
cd /d "%~dp0"
echo Frontend restarted.
goto MENU

:RESTART_MCP
echo.
echo Restarting MCP Debugger...
echo ============================================================
taskkill /FI "WINDOWTITLE eq MCP Debugger*" /F >nul 2>&1
timeout /t 1 /nobreak >nul
cd /d "%~dp0mcp-debugger"
REM BTS-3060: cmd /k 제거 (창 제목으로 식별)
start "MCP Debugger" npm run start
cd /d "%~dp0"
echo MCP Debugger restarted.
goto MENU

:RESTART_LOG_MONITOR
echo.
echo Restarting Log Monitor...
echo ============================================================
taskkill /FI "WINDOWTITLE eq Log Monitor*" /F >nul 2>&1
timeout /t 1 /nobreak >nul
cd /d "%~dp0mcp-debugger"
call npx tsc >nul 2>&1
REM BTS-3060: cmd /k 없이 직접 실행 (process.title로 식별)
start "Log Monitor" node dist/log-monitor.js
cd /d "%~dp0"
echo Log Monitor restarted.
goto MENU

:RESTART_SPAWNING_POOL
echo.
echo Restarting Spawning Pool...
echo ============================================================
taskkill /FI "WINDOWTITLE eq Spawning Pool*" /F >nul 2>&1
timeout /t 1 /nobreak >nul
cd /d "%~dp0mcp-debugger"
REM BTS-3060: cmd /k 제거 (창 제목으로 식별)
start "Spawning Pool" python spawning-pool.py
cd /d "%~dp0"
echo Spawning Pool restarted.
goto MENU

:RESTART_UI_LOOP
echo.
echo Restarting UI Test Loop...
echo ============================================================
taskkill /FI "WINDOWTITLE eq UI Test Loop*" /F >nul 2>&1
timeout /t 1 /nobreak >nul
call :START_UI_TEST_LOOP
echo UI Test Loop restarted.
goto MENU

:RUN_TEST
echo.
echo Running UI test (once)...
echo ============================================================
node automation/auto-suite.js --url http://localhost:2000 --name az-smoke --worker az
echo.
pause
goto MENU

:STOP_ALL
echo.
echo Stopping ALL servers...
echo ============================================================
call :STOP_ALL_QUIET
echo All servers stopped.
pause
goto MENU

:STOP_ALL_QUIET
taskkill /FI "WINDOWTITLE eq Trend Video Frontend*" /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq MCP Debugger*" /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq Log Monitor*" /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq Spawning Pool*" /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq UI Test Loop*" /F >nul 2>&1
powershell -Command "Get-NetTCPConnection -LocalPort 2000 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }"
timeout /t 2 /nobreak >nul
goto :eof

:START_SERVER
echo.
echo Starting server...
echo ============================================================

REM --- Step 1: 기존 프로세스 종료 ---
echo [1/8] Kill port 2000...
echo        - 포트 2000 사용 중인 프로세스 강제 종료
powershell -Command "Get-NetTCPConnection -LocalPort 2000 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }"
timeout /t 2 /nobreak >nul

REM --- Step 2: Next.js 빌드 캐시 삭제 ---
echo [2/8] Delete .next cache...
echo        - Next.js 빌드 캐시 삭제 (핫 리로드 문제 방지)
if exist "%~dp0trend-video-frontend\.next" (
    rmdir /s /q "%~dp0trend-video-frontend\.next"
    echo        .next deleted
) else (
    echo        .next not found [SKIP]
)

REM --- Step 3: Frontend 서버 시작 ---
echo [3/8] Start Frontend, Unified Worker...
echo        - 실행: npm run dev (http://localhost:2000)
echo        - Next.js 개발 서버 + API 라우트 + 백그라운드 워커
cd /d "%~dp0trend-video-frontend"
REM BTS-3060: cmd /k 없이 직접 실행 (창 제목으로 식별)
start "Trend Video Frontend" npm run dev
cd /d "%~dp0"

REM --- Step 4: MCP Debugger 시작 ---
echo [4/8] Start MCP Debugger...
echo        - 실행: npm run start
echo        - MCP 프로토콜 서버 + 버그 API (/api/bugs)
cd /d "%~dp0mcp-debugger"
REM BTS-3060: cmd /k 제거 (창 제목으로 식별)
start "MCP Debugger" npm run start
cd /d "%~dp0"

REM --- Step 5: TypeScript 빌드 ---
echo [5/8] Build MCP Debugger TypeScript...
echo        - 실행: npx tsc
echo        - src/*.ts -> dist/*.js 컴파일
cd /d "%~dp0mcp-debugger"
call npx tsc >nul 2>&1
cd /d "%~dp0"

REM --- Step 6: Log Monitor 시작 (BTS-3007) ---
echo [6/8] Start Log Monitor...
echo        - 실행: node dist/log-monitor.js
echo        - 역할: 로그 파일 실시간 감시 (chokidar)
echo        - 감지: 에러 패턴 발견 시 bugs 테이블에 INSERT
cd /d "%~dp0mcp-debugger"
REM BTS-3060: cmd /k 없이 직접 실행 (process.title로 식별)
start "Log Monitor" node dist/log-monitor.js
cd /d "%~dp0"

REM --- Step 7: Spawning Pool 시작 (BTS-3055: Python 버전) ---
echo [7/8] Start Spawning Pool (Python)...
echo        - python spawning-pool.py
echo        - Claude CLI 직접 호출, 결과 처리
echo        - 성공시 resolved, 실패시 open 롤백
cd /d "%~dp0mcp-debugger"
REM BTS-3060: cmd /k 제거 (창 제목으로 식별)
start "Spawning Pool" python spawning-pool.py
cd /d "%~dp0"

REM --- Step 8: UI 자동화 테스트 ---
echo [8/8] Run UI test, Start loop...
echo        - node automation/auto-suite.js
echo        - Playwright smoke test
echo        - Loop: every 10 minutes
timeout /t 5 /nobreak >nul
REM BTS-3055: 테스트 실패해도 배치 종료 방지
node automation/auto-suite.js --url http://localhost:2000 --name az-smoke --worker az 2>&1
call :START_UI_TEST_LOOP

echo.
echo ============================================================
echo   All servers started!
echo ============================================================
echo.
echo   [프로세스 목록]
echo   --------------------------------------------------------
echo   1. Frontend      : http://localhost:2000
echo      - npm run dev (Next.js + Unified Worker)
echo.
echo   2. MCP Debugger  : npm run start
echo      - 에러 큐 관리 + 버그 API
echo.
echo   3. Log Monitor   : node dist/log-monitor.js
echo      - 로그 감시 -> 에러 발견 시 bugs 테이블 INSERT
echo.
echo   4. Spawning Pool : python spawning-pool.py
echo      - bugs 조회 -> Claude/Codex/Gemini 워커 스폰
echo.
echo   5. UI Test Loop  : auto-suite.js (10분 간격)
echo      - Playwright 스모크 테스트 자동 반복
echo ============================================================
echo.
goto :eof

:START_UI_TEST_LOOP
echo [UI Loop] Starting UI test loop (every 10 minutes)...
REM BTS-3060: cmd /k 제거 - 별도 배치 파일로 분리 (창 제목으로 식별)
start "UI Test Loop" "%~dp0automation\ui-test-loop.bat"
goto :eof

:END
echo.
echo Exiting...
exit /b 0
