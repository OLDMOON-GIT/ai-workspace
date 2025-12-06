@echo off
REM ============================================================
REM db-sync.bat - MySQL 데이터베이스 동기화
REM ============================================================
REM 로컬(127.0.0.1) -> 원격(192.168.0.30) 또는 그 반대로 동기화
REM ============================================================

chcp 65001 >nul
setlocal enabledelayedexpansion

set "MYSQL_BIN=C:\Program Files\MySQL\MySQL Server 8.0\bin"
set "MYSQL_USER=root"
set "MYSQL_PASS=trend2024"
set "DB_NAME=trend_video"
set "DUMP_FILE=%~dp0..\temp\db_sync_dump.sql"

REM ANSI 색상
set "RED=[91m"
set "GREEN=[92m"
set "YELLOW=[93m"
set "RESET=[0m"

echo.
echo ============================================================
echo   MySQL Database Sync
echo ============================================================
echo.
echo   [1] Local -> Remote (127.0.0.1 -> 192.168.0.30)
echo   [2] Remote -> Local (192.168.0.30 -> 127.0.0.1)
echo   [3] Compare tables (show differences)
echo   [0] Cancel
echo.
set /p SYNC_CHOICE="Select (1-3, 0): "

if "!SYNC_CHOICE!"=="0" goto END
if "!SYNC_CHOICE!"=="1" goto LOCAL_TO_REMOTE
if "!SYNC_CHOICE!"=="2" goto REMOTE_TO_LOCAL
if "!SYNC_CHOICE!"=="3" goto COMPARE

echo Invalid choice.
goto END

:LOCAL_TO_REMOTE
echo.
echo %YELLOW%[!] Local(127.0.0.1) -> Remote(192.168.0.30) 동기화%RESET%
echo     원격 서버의 데이터가 로컬 데이터로 덮어씌워집니다!
echo.
set /p CONFIRM="정말 진행하시겠습니까? (Y/N): "
if /i "!CONFIRM!" NEQ "Y" goto END

echo.
echo [1/3] Exporting from localhost...
"%MYSQL_BIN%\mysqldump" -u %MYSQL_USER% -p%MYSQL_PASS% -h 127.0.0.1 %DB_NAME% --routines --triggers 2>nul > "%DUMP_FILE%"
if !errorlevel! NEQ 0 (
    echo %RED%[FAIL] Export failed!%RESET%
    goto END
)
echo %GREEN%[OK]%RESET% Export complete

echo [2/3] Importing to 192.168.0.30...
"%MYSQL_BIN%\mysql" -u %MYSQL_USER% -p%MYSQL_PASS% -h 192.168.0.30 %DB_NAME% 2>nul < "%DUMP_FILE%"
if !errorlevel! NEQ 0 (
    echo %RED%[FAIL] Import failed!%RESET%
    goto END
)
echo %GREEN%[OK]%RESET% Import complete

echo [3/3] Verifying...
for /f %%i in ('"%MYSQL_BIN%\mysql" -u %MYSQL_USER% -p%MYSQL_PASS% -h 192.168.0.30 %DB_NAME% -N -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='%DB_NAME%'" 2^>nul') do set REMOTE_TABLES=%%i
echo %GREEN%[OK]%RESET% Remote has !REMOTE_TABLES! tables

echo.
echo %GREEN%============================================================%RESET%
echo %GREEN%  Sync complete: Local -> Remote%RESET%
echo %GREEN%============================================================%RESET%
goto END

:REMOTE_TO_LOCAL
echo.
echo %YELLOW%[!] Remote(192.168.0.30) -> Local(127.0.0.1) 동기화%RESET%
echo     로컬 데이터가 원격 데이터로 덮어씌워집니다!
echo.
set /p CONFIRM="정말 진행하시겠습니까? (Y/N): "
if /i "!CONFIRM!" NEQ "Y" goto END

echo.
echo [1/3] Exporting from 192.168.0.30...
"%MYSQL_BIN%\mysqldump" -u %MYSQL_USER% -p%MYSQL_PASS% -h 192.168.0.30 %DB_NAME% --routines --triggers 2>nul > "%DUMP_FILE%"
if !errorlevel! NEQ 0 (
    echo %RED%[FAIL] Export failed!%RESET%
    goto END
)
echo %GREEN%[OK]%RESET% Export complete

echo [2/3] Importing to localhost...
"%MYSQL_BIN%\mysql" -u %MYSQL_USER% -p%MYSQL_PASS% -h 127.0.0.1 %DB_NAME% 2>nul < "%DUMP_FILE%"
if !errorlevel! NEQ 0 (
    echo %RED%[FAIL] Import failed!%RESET%
    goto END
)
echo %GREEN%[OK]%RESET% Import complete

echo [3/3] Verifying...
for /f %%i in ('"%MYSQL_BIN%\mysql" -u %MYSQL_USER% -p%MYSQL_PASS% -h 127.0.0.1 %DB_NAME% -N -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='%DB_NAME%'" 2^>nul') do set LOCAL_TABLES=%%i
echo %GREEN%[OK]%RESET% Local has !LOCAL_TABLES! tables

echo.
echo %GREEN%============================================================%RESET%
echo %GREEN%  Sync complete: Remote -> Local%RESET%
echo %GREEN%============================================================%RESET%
goto END

:COMPARE
echo.
echo Comparing tables...
echo.
echo [Local (127.0.0.1)]
"%MYSQL_BIN%\mysql" -u %MYSQL_USER% -p%MYSQL_PASS% -h 127.0.0.1 %DB_NAME% -e "SELECT table_name, table_rows FROM information_schema.tables WHERE table_schema='%DB_NAME%' ORDER BY table_name" 2>nul

echo.
echo [Remote (192.168.0.30)]
"%MYSQL_BIN%\mysql" -u %MYSQL_USER% -p%MYSQL_PASS% -h 192.168.0.30 %DB_NAME% -e "SELECT table_name, table_rows FROM information_schema.tables WHERE table_schema='%DB_NAME%' ORDER BY table_name" 2>nul

echo.
goto END

:END
echo.
pause
exit /b 0
