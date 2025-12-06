@echo off
setlocal
cd /d "%~dp0"

if not exist "abc-choice" (
  echo [abc-root] abc-choice directory not found.
  exit /b 1
)

pushd "abc-choice"
echo [abc-root] launching abc-choice bot...
call abc.bat
set "ABC_EXIT=%errorlevel%"
popd

if not "%ABC_EXIT%"=="0" (
  echo [abc-root] abc-choice failed with exit code %ABC_EXIT%.
  exit /b %ABC_EXIT%
)

echo [abc-root] abc-choice completed.
exit /b 0
