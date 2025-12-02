@echo off
echo ========================================
echo   Night Auto Runner - Starting...
echo ========================================
echo.

echo [1/4] Starting Log Monitor (Debugger)...
start "MCP-Debugger" cmd /c "cd /d C:\Users\oldmoon\workspace\mcp-debugger && npm run monitor"

echo [2/4] Starting File Watcher (Tester)...
start "MCP-Tester" cmd /c "cd /d C:\Users\oldmoon\workspace\mcp-auto-tester && npm run watch"

echo [3/4] Starting Auto Fixer (Claude CLI)...
start "MCP-AutoFix" cmd /c "cd /d C:\Users\oldmoon\workspace\mcp-debugger && npm run auto-fix"

echo [4/4] Starting Test Generator (Claude CLI)...
start "MCP-TestGen" cmd /c "cd /d C:\Users\oldmoon\workspace\mcp-debugger && npm run gen-test"

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
