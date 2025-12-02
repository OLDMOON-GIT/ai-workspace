@echo off
echo ========================================
echo   Windows Quick Fix Menu
echo ========================================
echo.
echo 1. Fix Context Menu (right-click slow)
echo 2. Fix Taskbar Icon Size (make larger)
echo 3. Fix Both
echo 4. Exit
echo.
set /p choice="Select (1-4): "

if "%choice%"=="1" goto fix_context
if "%choice%"=="2" goto fix_taskbar
if "%choice%"=="3" goto fix_both
if "%choice%"=="4" exit /b 0

echo Invalid choice
pause
exit /b 1

:fix_context
echo.
echo Starting Context Menu Fix...
echo.
powershell -ExecutionPolicy Bypass -Command "Start-Process powershell -Verb RunAs -ArgumentList '-ExecutionPolicy Bypass -File %~dp0fix-context-menu-simple.ps1'"
echo.
echo Script launched. Check the new PowerShell window.
pause
exit /b 0

:fix_taskbar
echo.
echo Starting Taskbar Size Fix...
echo.
powershell -ExecutionPolicy Bypass -Command "Start-Process powershell -Verb RunAs -ArgumentList '-ExecutionPolicy Bypass -File %~dp0taskbar-large-fix.ps1'"
echo.
echo Script launched. Check the new PowerShell window.
pause
exit /b 0

:fix_both
echo.
echo Launching both fixes...
echo.
powershell -ExecutionPolicy Bypass -Command "Start-Process powershell -Verb RunAs -ArgumentList '-ExecutionPolicy Bypass -File %~dp0fix-context-menu-simple.ps1'"
timeout /t 2 /nobreak >nul
powershell -ExecutionPolicy Bypass -Command "Start-Process powershell -Verb RunAs -ArgumentList '-ExecutionPolicy Bypass -File %~dp0taskbar-large-fix.ps1'"
echo.
echo Both scripts launched. Check the PowerShell windows.
pause
exit /b 0
