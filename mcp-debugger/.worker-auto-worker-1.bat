@echo off
chcp 65001 >nul
cd /d "C:\Users\oldmoon\workspace\mcp-debugger"
echo.
echo ========================================
echo BTS-0002364 버그
echo ========================================
type "C:\Users\oldmoon\workspace\mcp-debugger\.prompt-auto-worker-1.txt"
echo.
echo ----------------------------------------
claude --dangerously-skip-permissions < "C:\Users\oldmoon\workspace\mcp-debugger\.prompt-auto-worker-1.txt"
del "C:\Users\oldmoon\workspace\mcp-debugger\.prompt-auto-worker-1.txt" 2>nul
