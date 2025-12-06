@echo off
echo ========================================
echo   Night Auto Runner - Starting...
echo ========================================
echo.

REM BTS-3060: cmd /c 없이 직접 실행 (창 제목으로 식별)
echo [1/4] Starting Log Monitor (Debugger)...
cd /d C:Usersoldmoonworkspacemcp-debugger
start "MCP-Debugger" npm run monitor
cd /d C:Usersoldmoonworkspace

echo [2/4] Starting File Watcher (Tester)...
cd /d C:Usersoldmoonworkspacemcp-auto-tester
start "MCP-Tester" npm run watch
cd /d C:Usersoldmoonworkspace

echo [3/4] Starting Auto Fixer (Claude CLI)...
cd /d C:Usersoldmoonworkspacemcp-debugger
start "MCP-AutoFix" npm run auto-fix
cd /d C:Usersoldmoonworkspace

echo [4/4] Starting Test Generator (Claude CLI)...
cd /d C:Usersoldmoonworkspacemcp-debugger
start "MCP-TestGen" npm run gen-test
cd /d C:Usersoldmoonworkspace

echo.
echo ========================================
echo   All 4 services started!
echo.
echo   1. Debugger - Log monitoring + error queue
echo   2. Tester   - File watch + auto test (5min)
echo   3. AutoFix  - Claude CLI auto repair
echo   4. TestGen  - Claude CLI test generation (10min)
echo.
echo   Close this window anytime.
echo   Run report.bat in the morning.
echo ========================================
echo.
pause
