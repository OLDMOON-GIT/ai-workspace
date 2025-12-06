@echo off
REM ============================================================
REM az.bat - Trend Video 개발 서버 통합 실행 스크립트
REM ============================================================
REM
REM 사용법:
REM   az.bat              - 일반 모드 (git stash/pull/pop + 서버 시작)
REM   az.bat --force      - 강제 모드 (origin/master로 리셋 + 의존성 설치)
REM   az.bat -f           - 강제 모드 (위와 동일)
REM   az.bat --port 3000  - HTTP 포트 설정 (영구 환경변수 저장)
REM   az.bat -p 3000 3443 - HTTP/HTTPS 포트 설정
REM   az.bat --show-port  - 현재 포트 설정 확인
REM
REM 환경변수:
REM   TREND_HTTP_PORT   - HTTP 포트 (미설정 시 초기 설정 화면 표시)
REM   TREND_HTTPS_PORT  - HTTPS 포트 (미설정 시 초기 설정 화면 표시)
REM   TREND_DB_HOST     - MySQL 호스트 (기본값: 127.0.0.1)
REM   TREND_DB_PORT     - MySQL 포트 (기본값: 3306)
REM
REM 실행되는 프로세스:
REM   1. Frontend (npm run dev)
REM      - Next.js 개발 서버 (http://localhost:TREND_HTTP_PORT)
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
REM   6. Build Monitor (build-monitor.bat, 30분 간격)
REM      - 빌드 에러 감지 시 버그 자동 등록
REM      - 빌드 실패 시 Frontend 서버 자동 재시작
REM
REM ============================================================

chcp 65001 >nul
setlocal enabledelayedexpansion

REM ============================================================
REM 포트 설정 (환경변수 필수 - 미설정 시 초기 설정 유도)
REM ============================================================
REM 포트 설정 명령어 처리 (먼저 체크)
if "%1"=="--port" goto SET_PORT
if "%1"=="-p" goto SET_PORT
if "%1"=="--show-port" goto SHOW_PORT

REM 환경변수 미설정 시 초기 설정 화면으로 이동
if not defined TREND_HTTP_PORT goto INITIAL_PORT_SETUP
if not defined TREND_HTTPS_PORT goto INITIAL_PORT_SETUP
if not defined TREND_DB_HOST goto INITIAL_PORT_SETUP
if not defined TREND_DB_PORT goto INITIAL_PORT_SETUP

:AFTER_PORT_CHECK
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
    echo        [OK] Reset to origin/master
) else (
    REM BTS-14770: stash 전후 개수 비교
    for /f %%i in ('git stash list 2^>nul ^| find /c "stash@"') do set WORKSPACE_BEFORE=%%i
    git stash -q 2>nul
    for /f %%i in ('git stash list 2^>nul ^| find /c "stash@"') do set WORKSPACE_AFTER=%%i
    for /f "delims=" %%r in ('git pull 2^>^&1') do set GIT_RESULT=%%r
    if "!GIT_RESULT!"=="Already up to date." (
        echo        [OK] Already up to date
    ) else (
        echo        [OK] !GIT_RESULT!
    )
    if !WORKSPACE_AFTER! GTR !WORKSPACE_BEFORE! (
        git stash pop -q 2>nul
        if !errorlevel! NEQ 0 (
            echo        [WARN] Stash conflict - run 'git stash pop' manually
        ) else (
            echo        [OK] Local changes restored
        )
    )
)

echo.
echo [2/3] Frontend update...
cd trend-video-frontend
if %FORCE_MODE%==1 (
    git fetch origin 2>nul
    git reset --hard origin/master 2>nul
    echo        [OK] Reset to origin/master
) else (
    for /f %%i in ('git stash list 2^>nul ^| find /c "stash@"') do set FRONTEND_BEFORE=%%i
    git stash -q 2>nul
    for /f %%i in ('git stash list 2^>nul ^| find /c "stash@"') do set FRONTEND_AFTER=%%i
    for /f "delims=" %%r in ('git pull 2^>^&1') do set GIT_RESULT=%%r
    if "!GIT_RESULT!"=="Already up to date." (
        echo        [OK] Already up to date
    ) else (
        echo        [OK] !GIT_RESULT!
    )
    if !FRONTEND_AFTER! GTR !FRONTEND_BEFORE! (
        git stash pop -q 2>nul
        if !errorlevel! NEQ 0 (
            echo        [WARN] Stash conflict - run 'git stash pop' manually
        ) else (
            echo        [OK] Local changes restored
        )
    )
)
cd ..

echo.
echo [3/3] Backend update...
cd trend-video-backend
if %FORCE_MODE%==1 (
    git fetch origin 2>nul
    git reset --hard origin/master 2>nul
    echo        [OK] Reset to origin/master
) else (
    for /f %%i in ('git stash list 2^>nul ^| find /c "stash@"') do set BACKEND_BEFORE=%%i
    git stash -q 2>nul
    for /f %%i in ('git stash list 2^>nul ^| find /c "stash@"') do set BACKEND_AFTER=%%i
    for /f "delims=" %%r in ('git pull 2^>^&1') do set GIT_RESULT=%%r
    if "!GIT_RESULT!"=="Already up to date." (
        echo        [OK] Already up to date
    ) else (
        echo        [OK] !GIT_RESULT!
    )
    if !BACKEND_AFTER! GTR !BACKEND_BEFORE! (
        git stash pop -q 2>nul
        if !errorlevel! NEQ 0 (
            echo        [WARN] Stash conflict - run 'git stash pop' manually
        ) else (
            echo        [OK] Local changes restored
        )
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
echo  HTTP=%TREND_HTTP_PORT% HTTPS=%TREND_HTTPS_PORT% DB=%TREND_DB_HOST%:%TREND_DB_PORT%
echo ============================================================
echo [0] Restart ALL
echo [1] Restart Frontend
echo [2] Restart MCP Debugger
echo [3] Restart Log Monitor
echo [4] Restart Spawning Pool
echo [5] Restart UI Test Loop
echo [6] Restart Build Monitor
echo [7] Run UI Test (once)
echo [8] Stop ALL
echo [9] Exit
echo [S] Settings (서버/DB 설정)
echo ============================================================
set /p choice="Select (0-9, S, Enter=0): "

if "%choice%"=="" set choice=0

if "%choice%"=="0" goto RESTART_ALL
if "%choice%"=="1" goto RESTART_FRONTEND
if "%choice%"=="2" goto RESTART_MCP
if "%choice%"=="3" goto RESTART_LOG_MONITOR
if "%choice%"=="4" goto RESTART_SPAWNING_POOL
if "%choice%"=="5" goto RESTART_UI_LOOP
if "%choice%"=="6" goto RESTART_BUILD_MONITOR
if "%choice%"=="7" goto RUN_TEST
if "%choice%"=="8" goto STOP_ALL
if "%choice%"=="9" goto END
if /i "%choice%"=="S" goto MENU_SETTINGS
if /i "%choice%"=="P" goto MENU_SETTINGS

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
powershell -Command "Get-NetTCPConnection -LocalPort %TREND_HTTP_PORT% -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }"
timeout /t 2 /nobreak >nul
cd /d "%~dp0trend-video-frontend"
REM BTS-3060: cmd /k 없이 직접 실행 (창 제목으로 식별)
REM 환경변수 PORT 설정하여 Next.js에 전달
set PORT=%TREND_HTTP_PORT%
start "Trend Video Frontend" cmd /c "set PORT=%TREND_HTTP_PORT% && npm run dev"
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

:RESTART_BUILD_MONITOR
echo.
echo Restarting Build Monitor...
echo ============================================================
taskkill /FI "WINDOWTITLE eq Build Monitor*" /F >nul 2>&1
timeout /t 1 /nobreak >nul
start "Build Monitor" "%~dp0automation\build-monitor.bat"
echo Build Monitor restarted.
goto MENU

:RUN_TEST
echo.
echo Running UI test (once)...
echo ============================================================
node automation/auto-suite.js --url http://localhost:%TREND_HTTP_PORT% --name az-smoke --worker az
echo.
pause
goto MENU

:MENU_SETTINGS
echo.
echo ============================================================
echo   서버/DB 설정
echo ============================================================
echo.
echo   현재 설정:
echo   [1] HTTP  포트 : %TREND_HTTP_PORT%
echo   [2] HTTPS 포트 : %TREND_HTTPS_PORT%
echo   [3] DB 호스트  : %TREND_DB_HOST%
echo   [4] DB 포트    : %TREND_DB_PORT%
echo.
echo   [A] 전체 수정
echo   [0] 돌아가기
echo ============================================================
set /p SETTING_CHOICE="수정할 항목 선택 (1-4, A, 0): "

if "!SETTING_CHOICE!"=="0" goto MENU
if "!SETTING_CHOICE!"=="" goto MENU

if "!SETTING_CHOICE!"=="1" (
    set /p NEW_VAL="새 HTTP 포트: "
    if not "!NEW_VAL!"=="" (
        setx TREND_HTTP_PORT !NEW_VAL! >nul 2>&1
        set TREND_HTTP_PORT=!NEW_VAL!
        echo   [OK] HTTP 포트 = !NEW_VAL!
    )
)
if "!SETTING_CHOICE!"=="2" (
    set /p NEW_VAL="새 HTTPS 포트: "
    if not "!NEW_VAL!"=="" (
        setx TREND_HTTPS_PORT !NEW_VAL! >nul 2>&1
        set TREND_HTTPS_PORT=!NEW_VAL!
        echo   [OK] HTTPS 포트 = !NEW_VAL!
    )
)
if "!SETTING_CHOICE!"=="3" (
    set /p NEW_VAL="새 DB 호스트 (127.0.0.1 또는 192.168.0.30): "
    if not "!NEW_VAL!"=="" (
        setx TREND_DB_HOST !NEW_VAL! >nul 2>&1
        set TREND_DB_HOST=!NEW_VAL!
        echo   [OK] DB 호스트 = !NEW_VAL!
    )
)
if "!SETTING_CHOICE!"=="4" (
    set /p NEW_VAL="새 DB 포트: "
    if not "!NEW_VAL!"=="" (
        setx TREND_DB_PORT !NEW_VAL! >nul 2>&1
        set TREND_DB_PORT=!NEW_VAL!
        echo   [OK] DB 포트 = !NEW_VAL!
    )
)
if /i "!SETTING_CHOICE!"=="A" (
    set /p NEW_HTTP="HTTP 포트 [%TREND_HTTP_PORT%]: "
    if "!NEW_HTTP!"=="" set NEW_HTTP=%TREND_HTTP_PORT%
    set /p NEW_HTTPS="HTTPS 포트 [%TREND_HTTPS_PORT%]: "
    if "!NEW_HTTPS!"=="" set NEW_HTTPS=%TREND_HTTPS_PORT%
    set /p NEW_DB_HOST="DB 호스트 [%TREND_DB_HOST%]: "
    if "!NEW_DB_HOST!"=="" set NEW_DB_HOST=%TREND_DB_HOST%
    set /p NEW_DB_PORT="DB 포트 [%TREND_DB_PORT%]: "
    if "!NEW_DB_PORT!"=="" set NEW_DB_PORT=%TREND_DB_PORT%

    setx TREND_HTTP_PORT !NEW_HTTP! >nul 2>&1
    setx TREND_HTTPS_PORT !NEW_HTTPS! >nul 2>&1
    setx TREND_DB_HOST !NEW_DB_HOST! >nul 2>&1
    setx TREND_DB_PORT !NEW_DB_PORT! >nul 2>&1

    set TREND_HTTP_PORT=!NEW_HTTP!
    set TREND_HTTPS_PORT=!NEW_HTTPS!
    set TREND_DB_HOST=!NEW_DB_HOST!
    set TREND_DB_PORT=!NEW_DB_PORT!

    echo.
    echo   [OK] 전체 설정 저장 완료
)

echo.
echo   * 서버 재시작 시 새 설정이 적용됩니다.
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
taskkill /FI "WINDOWTITLE eq Frontend Watchdog*" /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq MCP Debugger*" /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq Log Monitor*" /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq Spawning Pool*" /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq UI Test Loop*" /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq Build Monitor*" /F >nul 2>&1
powershell -Command "Get-NetTCPConnection -LocalPort %TREND_HTTP_PORT% -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }"
timeout /t 2 /nobreak >nul
goto :eof

:START_SERVER
echo.
echo Starting server...
echo ============================================================

REM --- Step 1: 기존 프로세스 종료 ---
echo [1/8] Kill port %TREND_HTTP_PORT%...
echo        - 포트 %TREND_HTTP_PORT% 사용 중인 프로세스 강제 종료
powershell -Command "Get-NetTCPConnection -LocalPort %TREND_HTTP_PORT% -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }"
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
echo [3/9] Start Frontend, Unified Worker...
echo        - 실행: npm run dev (http://localhost:%TREND_HTTP_PORT%)
echo        - Next.js 개발 서버 + API 라우트 + 백그라운드 워커
cd /d "%~dp0trend-video-frontend"
REM BTS-3060: cmd /k 없이 직접 실행 (창 제목으로 식별)
REM 환경변수 PORT 설정하여 Next.js에 전달
start "Trend Video Frontend" cmd /c "set PORT=%TREND_HTTP_PORT% && npm run dev"
cd /d "%~dp0"

REM --- Step 4: Frontend Watchdog 시작 (SPEC-3462) ---
echo [4/9] Start Frontend Watchdog...
echo        - 실행: frontend-watchdog.bat
echo        - 역할: 5분 간격 헬스체크, 서버 다운 시 자동 재시작
start "Frontend Watchdog" "%~dp0automation\frontend-watchdog.bat"

REM --- Step 5: MCP Debugger 시작 ---
echo [5/9] Start MCP Debugger...
echo        - 실행: npm run start
echo        - MCP 프로토콜 서버 + 버그 API (/api/bugs)
cd /d "%~dp0mcp-debugger"
REM BTS-3060: cmd /k 제거 (창 제목으로 식별)
start "MCP Debugger" npm run start
cd /d "%~dp0"

REM --- Step 6: TypeScript 빌드 ---
echo [6/9] Build MCP Debugger TypeScript...
echo        - 실행: npx tsc
echo        - src/*.ts -> dist/*.js 컴파일
cd /d "%~dp0mcp-debugger"
call npx tsc >nul 2>&1
cd /d "%~dp0"

REM --- Step 7: Log Monitor 시작 (BTS-3007) ---
echo [7/9] Start Log Monitor...
echo        - 실행: node dist/log-monitor.js
echo        - 역할: 로그 파일 실시간 감시 (chokidar)
echo        - 감지: 에러 패턴 발견 시 bugs 테이블에 INSERT
cd /d "%~dp0mcp-debugger"
REM BTS-3060: cmd /k 없이 직접 실행 (process.title로 식별)
start "Log Monitor" node dist/log-monitor.js
cd /d "%~dp0"

REM --- Step 8: Spawning Pool 시작 (BTS-3055: Python 버전) ---
echo [8/9] Start Spawning Pool (Python)...
echo        - python spawning-pool.py
echo        - Claude CLI 직접 호출, 결과 처리
echo        - 성공시 resolved, 실패시 open 롤백
cd /d "%~dp0mcp-debugger"
REM BTS-3060: cmd /k 제거 (창 제목으로 식별)
start "Spawning Pool" python spawning-pool.py
cd /d "%~dp0"

REM --- Step 9: UI 자동화 테스트 ---
echo [9/10] Run UI test, Start loop...
echo        - node automation/auto-suite.js
echo        - Playwright smoke test
echo        - Loop: every 10 minutes
timeout /t 5 /nobreak >nul
REM BTS-3055: 테스트 실패해도 배치 종료 방지
node automation/auto-suite.js --url http://localhost:%TREND_HTTP_PORT% --name az-smoke --worker az 2>&1
call :START_UI_TEST_LOOP

REM --- Step 10: Build Monitor 시작 (BTS-14862) ---
echo [10/10] Start Build Monitor...
echo        - build-monitor.bat (30분 간격)
echo        - 빌드 에러 감지 시 버그 등록 + 서버 재시작
start "Build Monitor" "%~dp0automation\build-monitor.bat"

echo.
echo ============================================================
echo   All servers started!
echo ============================================================
echo.
echo   [프로세스 목록]
echo   --------------------------------------------------------
echo   1. Frontend      : http://localhost:%TREND_HTTP_PORT%
echo      - npm run dev (Next.js + Unified Worker)
echo.
echo   2. Frontend Watchdog : frontend-watchdog.bat (5분 간격)
echo      - 헬스체크 + 서버 다운 시 자동 재시작
echo.
echo   3. MCP Debugger  : npm run start
echo      - 에러 큐 관리 + 버그 API
echo.
echo   4. Log Monitor   : node dist/log-monitor.js
echo      - 로그 감시 -> 에러 발견 시 bugs 테이블 INSERT
echo.
echo   5. Spawning Pool : python spawning-pool.py
echo      - bugs 조회 -> Claude/Codex/Gemini 워커 스폰
echo.
echo   6. UI Test Loop  : auto-suite.js (10분 간격)
echo      - Playwright 스모크 테스트 자동 반복
echo.
echo   7. Build Monitor : build-monitor.bat (30분 간격)
echo      - 빌드 에러 감지 시 버그 등록 + 서버 재시작
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

REM ============================================================
REM 포트 초기 설정 (환경변수 미설정 시)
REM ============================================================

:INITIAL_PORT_SETUP
echo.
echo ============================================================
echo   환경변수가 설정되지 않았습니다!
echo   서버 시작 전 설정을 완료해주세요.
echo ============================================================
echo.
echo   현재 환경변수:
if defined TREND_HTTP_PORT (echo     TREND_HTTP_PORT  = %TREND_HTTP_PORT%) else (echo     TREND_HTTP_PORT  = [미설정])
if defined TREND_HTTPS_PORT (echo     TREND_HTTPS_PORT = %TREND_HTTPS_PORT%) else (echo     TREND_HTTPS_PORT = [미설정])
if defined TREND_DB_HOST (echo     TREND_DB_HOST    = %TREND_DB_HOST%) else (echo     TREND_DB_HOST    = [미설정])
if defined TREND_DB_PORT (echo     TREND_DB_PORT    = %TREND_DB_PORT%) else (echo     TREND_DB_PORT    = [미설정])
echo.

echo [서버 포트 설정]
set /p INIT_HTTP="HTTP 포트 (기본값 2000): "
if "!INIT_HTTP!"=="" set INIT_HTTP=2000

set /p INIT_HTTPS="HTTPS 포트 (기본값 2443): "
if "!INIT_HTTPS!"=="" set INIT_HTTPS=2443

echo.
echo [MySQL 설정]
set /p INIT_DB_HOST="DB 호스트 (기본값 127.0.0.1, alpha=192.168.0.30): "
if "!INIT_DB_HOST!"=="" set INIT_DB_HOST=127.0.0.1

set /p INIT_DB_PORT="DB 포트 (기본값 3306): "
if "!INIT_DB_PORT!"=="" set INIT_DB_PORT=3306

echo.
echo   설정 내용:
echo     HTTP  포트 = !INIT_HTTP!
echo     HTTPS 포트 = !INIT_HTTPS!
echo     DB 호스트  = !INIT_DB_HOST!
echo     DB 포트    = !INIT_DB_PORT!
echo.

REM 영구 저장 (사용자 환경변수)
setx TREND_HTTP_PORT !INIT_HTTP! >nul 2>&1
setx TREND_HTTPS_PORT !INIT_HTTPS! >nul 2>&1
setx TREND_DB_HOST !INIT_DB_HOST! >nul 2>&1
setx TREND_DB_PORT !INIT_DB_PORT! >nul 2>&1

REM 현재 세션에도 적용
set TREND_HTTP_PORT=!INIT_HTTP!
set TREND_HTTPS_PORT=!INIT_HTTPS!
set TREND_DB_HOST=!INIT_DB_HOST!
set TREND_DB_PORT=!INIT_DB_PORT!

echo   [OK] 설정이 영구 저장되었습니다.
echo   [OK] 서버를 시작합니다...
echo ============================================================
echo.

REM 설정 완료 후 일반 흐름으로 계속
goto AFTER_PORT_CHECK

REM ============================================================
REM 포트 설정 기능 (메뉴/명령줄)
REM ============================================================

:SET_PORT
echo.
echo ============================================================
echo   포트 설정
echo ============================================================
echo.

REM 현재 값 표시
echo 현재 설정:
echo   HTTP  포트: %TREND_HTTP_PORT%
echo   HTTPS 포트: %TREND_HTTPS_PORT%
echo.

REM 인자 확인
if "%2"=="" (
    echo 사용법: az.bat --port [HTTP_PORT] [HTTPS_PORT]
    echo 예시:   az.bat --port 3000
    echo         az.bat --port 3000 3443
    echo.
    set /p NEW_HTTP="새 HTTP 포트 (Enter=취소): "
    if "!NEW_HTTP!"=="" goto END
) else (
    set NEW_HTTP=%2
)

if "%3"=="" (
    set /p NEW_HTTPS="새 HTTPS 포트 (Enter=%TREND_HTTPS_PORT%): "
    if "!NEW_HTTPS!"=="" set NEW_HTTPS=%TREND_HTTPS_PORT%
) else (
    set NEW_HTTPS=%3
)

echo.
echo 새 설정:
echo   HTTP  포트: !NEW_HTTP!
echo   HTTPS 포트: !NEW_HTTPS!
echo.

set /p CONFIRM="영구 저장하시겠습니까? (Y/N): "
if /i "!CONFIRM!" NEQ "Y" (
    echo 취소되었습니다.
    goto END
)

REM 시스템 환경변수에 영구 저장 (사용자 레벨)
setx TREND_HTTP_PORT !NEW_HTTP! >nul 2>&1
setx TREND_HTTPS_PORT !NEW_HTTPS! >nul 2>&1

REM 현재 세션에도 적용
set TREND_HTTP_PORT=!NEW_HTTP!
set TREND_HTTPS_PORT=!NEW_HTTPS!

echo.
echo ============================================================
echo   포트 설정 완료!
echo ============================================================
echo   HTTP  포트: !NEW_HTTP!
echo   HTTPS 포트: !NEW_HTTPS!
echo.
echo   * 환경변수가 영구 저장되었습니다.
echo   * 새 터미널에서도 이 설정이 유지됩니다.
echo   * 서버 재시작 시 새 포트가 적용됩니다.
echo ============================================================
echo.
pause
goto END

:SHOW_PORT
echo.
echo ============================================================
echo   현재 포트 설정
echo ============================================================
echo.
echo   HTTP  포트: %TREND_HTTP_PORT%
echo   HTTPS 포트: %TREND_HTTPS_PORT%
echo.
echo   포트 변경: az.bat --port [HTTP_PORT] [HTTPS_PORT]
echo ============================================================
echo.
goto END
