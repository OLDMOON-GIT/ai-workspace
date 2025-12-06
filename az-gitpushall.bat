@echo off
setlocal

REM --- Main Project Sync (Push) ---
echo [1/1] Syncing Main Project...

echo.
echo    - Current Directory: %CD%
git rev-parse --show-toplevel
echo    - PATH: %PATH%

echo.
echo    - Staging all files...
git add .
if errorlevel 1 (
    echo [ERROR] 'git add' failed. Aborting script.
    goto :error
)

echo    - Committing changes...
git commit -m "Automated update via az-gitpushall.bat" --allow-empty
if errorlevel 1 (
    echo [ERROR] 'git commit' failed. Aborting script.
    goto :error
)

echo    - Pushing to remote...
git push origin master
if errorlevel 1 (
    echo [ERROR] 'git push' failed. Please check your connection and remote repository.
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
