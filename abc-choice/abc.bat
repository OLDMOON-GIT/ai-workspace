@echo off
REM ABC Choice PokerStars Baccarat bot launcher
REM Options:
REM   HEADLESS=1         run headless (default 0)
REM   SAVE_ROADMAP=1     save roadmap screenshots to data/roadmap-*.png
REM Usage: abc.bat

setlocal
cd /d "%~dp0"

REM Install dependencies on first run
if not exist "node_modules" (
  echo [abc] installing dependencies...
  call npm install || goto :error
)

REM Ensure Playwright browser is installed
call npm ls playwright >nul 2>&1
if errorlevel 1 (
  echo [abc] reinstalling npm dependencies ^(playwright missing^)...
  call npm install || goto :error
)

echo [abc] ensuring playwright chromium is installed...
call npx playwright install chromium || goto :error

REM Defaults
if "%HEADLESS%"=="" set HEADLESS=0

echo [abc] running bot (HEADLESS=%HEADLESS% SAVE_ROADMAP=%SAVE_ROADMAP%)
set HEADLESS=%HEADLESS%
set SAVE_ROADMAP=%SAVE_ROADMAP%
if "%HOT_RELOAD%"=="1" (
  echo [abc] hot reload mode (nodemon)
  call npx nodemon --watch src --ext ts --exec "ts-node src/pokerstars-bot.ts" || goto :error
) else (
  call npm run play-pokerstars || goto :error
)

echo [abc] done.
goto :eof

:error
echo [abc] failed. errorlevel=%errorlevel%
goto :eof
