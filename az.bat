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
REM 실행되는 프로세스 (4개 창):
REM
REM   1. Frontend (npm run dev)
REM      - Next.js 개발 서버 (http://localhost:TREND_HTTP_PORT)
REM
REM   2. MCP Debugger (npm run start)
REM      - 버그 API 서버
REM
REM   3. Spawning Pool (python spawning-pool.py)
REM      - 버그 처리 워커 스폰 (별도 창 필수!)
REM
REM   4. Monitoring (services-combined.bat) - 3개 서비스 통합
REM      - Log Monitor: 로그 실시간 감시, 에러 자동 등록
REM      - Build Monitor: 빌드 에러 감지 (30분 간격)
REM      - UI Test Loop: Playwright 스모크 테스트 (10분 간격)
REM
REM 헬스체크:
REM   - 시작 후 15초 대기 → 각 서비스 상태 확인
REM   - 실패 시 빨간색으로 에러 표시
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
echo [3] Restart Spawning Pool
echo [4] Restart Monitoring (Log+Build+UI)
echo [5] Run UI Test (once)
echo [6] DB Sync (Local ^<-^> Remote)
echo [8] Stop ALL
echo [9] Exit
echo [S] Settings
echo ============================================================
set /p choice="Select (0-6, 8-9, S, Enter=0): "

if "%choice%"=="" set choice=0

if "%choice%"=="0" goto RESTART_ALL
if "%choice%"=="1" goto RESTART_FRONTEND
if "%choice%"=="2" goto RESTART_MCP
if "%choice%"=="3" goto RESTART_SPAWNING_POOL
if "%choice%"=="4" goto RESTART_MONITORING
if "%choice%"=="5" goto RUN_TEST
if "%choice%"=="6" goto DB_SYNC
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

:RESTART_SPAWNING_POOL
echo.
echo Restarting Spawning Pool...
echo ============================================================
taskkill /FI "WINDOWTITLE eq Spawning Pool*" /F >nul 2>&1
timeout /t 1 /nobreak >nul
cd /d "%~dp0mcp-debugger"
start "Spawning Pool" python spawning-pool.py
cd /d "%~dp0"
echo Spawning Pool restarted.
goto MENU

:RESTART_MONITORING
echo.
echo Restarting Monitoring Services...
echo ============================================================
taskkill /FI "WINDOWTITLE eq Monitoring*" /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq Log Monitor*" /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq UI Test Loop*" /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq Build Monitor*" /F >nul 2>&1
timeout /t 1 /nobreak >nul
start "Monitoring" "%~dp0automation\services-combined.bat"
echo Monitoring Services restarted (Log + Build + UI Test).
goto MENU

:DB_SYNC
call "%~dp0automation\db-sync.bat"
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
REM 개별 창 종료
taskkill /FI "WINDOWTITLE eq Trend Video Frontend*" /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq MCP Debugger*" /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq Spawning Pool*" /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq Monitoring*" /F >nul 2>&1
REM 레거시 창 (이전 버전 호환)
taskkill /FI "WINDOWTITLE eq Frontend Watchdog*" /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq Log Monitor*" /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq UI Test Loop*" /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq Build Monitor*" /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq Services*" /F >nul 2>&1
REM 포트 정리
powershell -Command "Get-NetTCPConnection -LocalPort %TREND_HTTP_PORT% -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }"
timeout /t 2 /nobreak >nul
goto :eof

:START_SERVER
echo.
echo Starting server...
echo ============================================================

REM ANSI 색상 코드 설정
set "RED=[91m"
set "GREEN=[92m"
set "YELLOW=[93m"
set "RESET=[0m"

REM 에러 카운터 초기화
set ERROR_COUNT=0
set ERROR_LIST=

REM --- Step 1: 기존 프로세스 종료 ---
echo [1/5] Kill port %TREND_HTTP_PORT%...
powershell -Command "Get-NetTCPConnection -LocalPort %TREND_HTTP_PORT% -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }"
timeout /t 2 /nobreak >nul

REM --- Step 2: Next.js 빌드 캐시 삭제 ---
echo [2/5] Delete .next cache...
if exist "%~dp0trend-video-frontend\.next" (
    rmdir /s /q "%~dp0trend-video-frontend\.next"
    echo        %GREEN%[OK]%RESET% .next deleted
) else (
    echo        %YELLOW%[SKIP]%RESET% .next not found
)

REM --- Step 3: Frontend 서버 시작 ---
echo [3/5] Start Frontend (http://localhost:%TREND_HTTP_PORT%)...
cd /d "%~dp0trend-video-frontend"
start "Trend Video Frontend" cmd /c "set PORT=%TREND_HTTP_PORT% && npm run dev"
cd /d "%~dp0"

REM --- Step 4: MCP Debugger 시작 ---
echo [4/5] Start MCP Debugger...
cd /d "%~dp0mcp-debugger"
start "MCP Debugger" npm run start
cd /d "%~dp0"

REM --- Step 5: Spawning Pool 시작 (별도 창 - 분리 필수!) ---
echo [5/6] Start Spawning Pool...
cd /d "%~dp0mcp-debugger"
start "Spawning Pool" python spawning-pool.py
cd /d "%~dp0"

REM --- Step 6: 모니터링 서비스 통합 시작 (Log Monitor + Build Monitor + UI Test) ---
echo [6/6] Start Monitoring Services...
echo        - Log Monitor, Build Monitor, UI Test Loop
start "Monitoring" "%~dp0automation\services-combined.bat"

REM --- 헬스체크 대기 ---
echo.
echo Waiting for servers to start (15 seconds)...
timeout /t 15 /nobreak >nul

REM --- 헬스체크 ---
echo.
echo ============================================================
echo   Health Check
echo ============================================================

REM Frontend 체크
powershell -Command "try { $r = Invoke-WebRequest -Uri 'http://localhost:%TREND_HTTP_PORT%' -TimeoutSec 5 -UseBasicParsing; exit 0 } catch { exit 1 }" >nul 2>&1
if !errorlevel! EQU 0 (
    echo   %GREEN%[OK]%RESET%   Frontend         http://localhost:%TREND_HTTP_PORT%
) else (
    echo   %RED%[FAIL]%RESET% Frontend         http://localhost:%TREND_HTTP_PORT%
    set /a ERROR_COUNT+=1
    set "ERROR_LIST=!ERROR_LIST! Frontend"
)

REM MCP Debugger 체크 (포트 3010)
powershell -Command "try { $r = Invoke-WebRequest -Uri 'http://localhost:3010' -TimeoutSec 5 -UseBasicParsing; exit 0 } catch { exit 1 }" >nul 2>&1
if !errorlevel! EQU 0 (
    echo   %GREEN%[OK]%RESET%   MCP Debugger     http://localhost:3010
) else (
    echo   %RED%[FAIL]%RESET% MCP Debugger     http://localhost:3010
    set /a ERROR_COUNT+=1
    set "ERROR_LIST=!ERROR_LIST! MCP-Debugger"
)

REM Spawning Pool 창 체크
tasklist /FI "WINDOWTITLE eq Spawning Pool*" 2>nul | find "cmd.exe" >nul 2>&1
if !errorlevel! EQU 0 (
    echo   %GREEN%[OK]%RESET%   Spawning Pool    버그 처리 워커 스폰
) else (
    REM Python 프로세스로 체크
    tasklist 2>nul | find "python.exe" >nul 2>&1
    if !errorlevel! EQU 0 (
        echo   %GREEN%[OK]%RESET%   Spawning Pool    버그 처리 워커 스폰
    ) else (
        echo   %RED%[FAIL]%RESET% Spawning Pool    버그 처리 워커 스폰
        set /a ERROR_COUNT+=1
        set "ERROR_LIST=!ERROR_LIST! Spawning-Pool"
    )
)

REM Monitoring 창 체크
tasklist /FI "WINDOWTITLE eq Monitoring*" 2>nul | find "cmd.exe" >nul 2>&1
if !errorlevel! EQU 0 (
    echo   %GREEN%[OK]%RESET%   Monitoring       Log + Build + UI Test
) else (
    echo   %RED%[FAIL]%RESET% Monitoring       Log + Build + UI Test
    set /a ERROR_COUNT+=1
    set "ERROR_LIST=!ERROR_LIST! Monitoring"
)

echo ============================================================

REM 에러 요약
if !ERROR_COUNT! GTR 0 (
    echo.
    echo   %RED%============================================================%RESET%
    echo   %RED%  ERROR: !ERROR_COUNT! service(s) failed to start!%RESET%
    echo   %RED%  Failed:!ERROR_LIST!%RESET%
    echo   %RED%============================================================%RESET%
    echo.
    echo   * Check the windows for error messages
    echo   * Try restarting individual services from menu
) else (
    echo.
    echo   %GREEN%============================================================%RESET%
    echo   %GREEN%  All services started successfully!%RESET%
    echo   %GREEN%============================================================%RESET%
)

echo.
echo   [실행 중인 창] (7개 -> 4개로 통합!)
echo   --------------------------------------------------------
echo   1. Trend Video Frontend  : Next.js 개발 서버
echo   2. MCP Debugger          : 버그 API 서버
echo   3. Spawning Pool         : 버그 처리 워커 스폰
echo   4. Monitoring            : Log + Build + UI Test 통합
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
