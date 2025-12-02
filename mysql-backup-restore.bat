@echo off
chcp 65001 > nul
setlocal enabledelayedexpansion

echo ============================================================
echo   MySQL 사용자/권한 백업 및 복원
echo ============================================================
echo.

set MYSQL_USER=root
set MYSQL_PASSWORD=trend2024!
set BACKUP_DIR=%~dp0mysql_backup
set USER_BACKUP=%BACKUP_DIR%\users.sql
set GRANTS_BACKUP=%BACKUP_DIR%\grants.sql
set DATA_BACKUP=%BACKUP_DIR%\trend_video.sql

if not exist "%BACKUP_DIR%" mkdir "%BACKUP_DIR%"

:MENU
echo [1] 백업 (사용자 + 권한 + 데이터)
echo [2] 복원 (사용자 + 권한 + 데이터)
echo [3] 사용자/권한만 백업
echo [4] 사용자/권한만 복원
echo [5] 종료
echo.
set /p choice="선택하세요 (1-5): "

if "%choice%"=="1" goto BACKUP_ALL
if "%choice%"=="2" goto RESTORE_ALL
if "%choice%"=="3" goto BACKUP_USERS
if "%choice%"=="4" goto RESTORE_USERS
if "%choice%"=="5" goto END

echo 잘못된 선택입니다.
goto MENU

:BACKUP_ALL
echo.
echo 전체 백업 시작...
call :DO_BACKUP_USERS
call :DO_BACKUP_DATA
echo.
echo 백업 완료! 위치: %BACKUP_DIR%
echo.
pause
goto MENU

:RESTORE_ALL
echo.
echo 전체 복원 시작...
call :DO_RESTORE_USERS
call :DO_RESTORE_DATA
echo.
echo 복원 완료!
echo.
pause
goto MENU

:BACKUP_USERS
echo.
call :DO_BACKUP_USERS
echo.
echo 사용자/권한 백업 완료!
echo.
pause
goto MENU

:RESTORE_USERS
echo.
call :DO_RESTORE_USERS
echo.
echo 사용자/권한 복원 완료!
echo.
pause
goto MENU

:END
exit /b 0

REM ============================================================
REM 사용자/권한 백업
REM ============================================================
:DO_BACKUP_USERS
echo [1/2] 사용자 정보 백업 중...

REM 사용자 생성 SQL 추출
echo -- MySQL Users Backup > "%USER_BACKUP%"
echo -- Generated: %date% %time% >> "%USER_BACKUP%"
echo. >> "%USER_BACKUP%"

for /f "tokens=1,2 delims=	" %%a in ('mysql -h 127.0.0.1 -u %MYSQL_USER% -p%MYSQL_PASSWORD% -N -e "SELECT user, host FROM mysql.user WHERE user NOT IN ('mysql.infoschema','mysql.session','mysql.sys','root')" 2^>nul') do (
    echo CREATE USER IF NOT EXISTS '%%a'@'%%b' IDENTIFIED BY '%MYSQL_PASSWORD%'; >> "%USER_BACKUP%"
)

echo [2/2] 권한 정보 백업 중...
echo. >> "%USER_BACKUP%"
echo -- Grants >> "%USER_BACKUP%"

for /f "tokens=1,2 delims=	" %%a in ('mysql -h 127.0.0.1 -u %MYSQL_USER% -p%MYSQL_PASSWORD% -N -e "SELECT user, host FROM mysql.user" 2^>nul') do (
    for /f "delims=" %%g in ('mysql -h 127.0.0.1 -u %MYSQL_USER% -p%MYSQL_PASSWORD% -N -e "SHOW GRANTS FOR '%%a'@'%%b'" 2^>nul') do (
        echo %%g; >> "%USER_BACKUP%"
    )
)

echo FLUSH PRIVILEGES; >> "%USER_BACKUP%"
echo    사용자/권한 백업: %USER_BACKUP%
goto :eof

REM ============================================================
REM 데이터 백업
REM ============================================================
:DO_BACKUP_DATA
echo [추가] 데이터베이스 백업 중...
mysqldump -h 127.0.0.1 -u %MYSQL_USER% -p%MYSQL_PASSWORD% --default-character-set=utf8mb4 --single-transaction trend_video > "%DATA_BACKUP%" 2>nul
echo    데이터 백업: %DATA_BACKUP%
goto :eof

REM ============================================================
REM 사용자/권한 복원
REM ============================================================
:DO_RESTORE_USERS
if not exist "%USER_BACKUP%" (
    echo [ERROR] 백업 파일 없음: %USER_BACKUP%
    goto :eof
)

echo 사용자/권한 복원 중...
mysql -h 127.0.0.1 -u %MYSQL_USER% -p%MYSQL_PASSWORD% < "%USER_BACKUP%" 2>nul
echo    복원 완료
goto :eof

REM ============================================================
REM 데이터 복원
REM ============================================================
:DO_RESTORE_DATA
if not exist "%DATA_BACKUP%" (
    echo [ERROR] 백업 파일 없음: %DATA_BACKUP%
    goto :eof
)

echo 데이터베이스 복원 중...
mysql -h 127.0.0.1 -u %MYSQL_USER% -p%MYSQL_PASSWORD% -e "CREATE DATABASE IF NOT EXISTS trend_video CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;" 2>nul
mysql -h 127.0.0.1 -u %MYSQL_USER% -p%MYSQL_PASSWORD% --default-character-set=utf8mb4 trend_video < "%DATA_BACKUP%" 2>nul
echo    복원 완료
goto :eof
