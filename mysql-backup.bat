@echo off
chcp 65001 > nul
setlocal enabledelayedexpansion

REM ============================================================
REM MySQL 일일 백업 스크립트
REM 매일 자동 실행: 작업 스케줄러에 등록
REM ============================================================

set MYSQL_BIN="C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe"
set MYSQLDUMP_BIN="C:\Program Files\MySQL\MySQL Server 8.0\bin\mysqldump.exe"
set MYSQL_USER=root
set MYSQL_PASSWORD=trend2024
set MYSQL_DATABASE=trend_video
set BACKUP_DIR=%~dp0mysql_backup
set DATE_STR=%date:~0,4%%date:~5,2%%date:~8,2%
set TIME_STR=%time:~0,2%%time:~3,2%
set TIME_STR=%TIME_STR: =0%
set BACKUP_FILE=%BACKUP_DIR%\full_backup_%DATE_STR%_%TIME_STR%.sql
set USERS_FILE=%BACKUP_DIR%\users_%DATE_STR%_%TIME_STR%.sql
set KEEP_DAYS=7

if not exist "%BACKUP_DIR%" mkdir "%BACKUP_DIR%"

echo ============================================================
echo MySQL 전체 백업 시작: %DATE% %TIME%
echo ============================================================

REM 1. 사용자/권한 백업
echo [1/3] 사용자 권한 백업 중...
%MYSQL_BIN% -u %MYSQL_USER% -p%MYSQL_PASSWORD% -N -e "SELECT CONCAT('CREATE USER IF NOT EXISTS ''', user, '''@''', host, ''' IDENTIFIED WITH ''', plugin, ''' AS ''', authentication_string, ''';') FROM mysql.user WHERE user='root';" > "%USERS_FILE%" 2>nul
%MYSQL_BIN% -u %MYSQL_USER% -p%MYSQL_PASSWORD% -N -e "SELECT CONCAT('GRANT ALL PRIVILEGES ON *.* TO ''', user, '''@''', host, ''' WITH GRANT OPTION;') FROM mysql.user WHERE user='root';" >> "%USERS_FILE%" 2>nul
echo FLUSH PRIVILEGES; >> "%USERS_FILE%"
echo       완료: %USERS_FILE%

REM 2. 데이터베이스 전체 백업
echo [2/3] 데이터베이스 백업 중...
%MYSQLDUMP_BIN% -u %MYSQL_USER% -p%MYSQL_PASSWORD% --default-character-set=utf8mb4 --routines --triggers --events --single-transaction %MYSQL_DATABASE% > "%BACKUP_FILE%" 2>nul
if %errorlevel% equ 0 (
    echo       완료: %BACKUP_FILE%
) else (
    echo       [ERROR] 백업 실패!
    exit /b 1
)

REM 3. 오래된 백업 삭제 (7일 이상)
echo [3/3] 오래된 백업 정리 중 (%KEEP_DAYS%일 이상)...
forfiles /p "%BACKUP_DIR%" /m "full_backup_*.sql" /d -%KEEP_DAYS% /c "cmd /c del @path" 2>nul
forfiles /p "%BACKUP_DIR%" /m "users_*.sql" /d -%KEEP_DAYS% /c "cmd /c del @path" 2>nul
echo       완료

echo.
echo ============================================================
echo 백업 완료!
echo ============================================================
echo.

REM 최근 백업 목록 표시
echo [최근 백업 파일]
dir /b /o-d "%BACKUP_DIR%\full_backup_*.sql" 2>nul | head -5
echo.
