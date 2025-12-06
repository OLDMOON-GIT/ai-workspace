@echo off
setlocal

REM --- Main Project Sync (Pull) ---
echo [1/1] Syncing Main Project (Pulling changes)...

echo.
echo    - Fetching and merging changes...
git pull
if errorlevel 1 (
    echo [ERROR] 'git pull' failed. Please check your connection and remote repository.
    goto :error
)

echo.
echo --- Task Completed Successfully ---
goto :end

:error
echo.
echo ### An error occurred. The script has been stopped. ###

:end
pause
