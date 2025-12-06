@echo off
setlocal

REM --- Main Project Sync ---
echo [1/1] Syncing Main Project...

echo.
echo    - Staging all files...
git add .
if errorlevel 1 (
    echo [ERROR] 'git add' failed. Aborting script.
    goto :error
)

echo    - Committing changes...
git commit -m "Automated update via up.bat" --allow-empty
if errorlevel 1 (
    echo [ERROR] 'git commit' failed. Aborting script.
    goto :error
)

echo    - Pushing to remote...
git push
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