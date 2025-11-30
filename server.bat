@echo off
chcp 65001 > nul
setlocal enabledelayedexpansion

echo ============================================================
echo   Trend Video Server Manager (서버 관리만)
echo   Git Pull은 az.bat을 사용하세요
echo ============================================================
echo.

cd /d "%~dp0"

:MENU
echo [1] 서버 시작
echo [2] 서버 중지
echo [3] 서버 상태 확인
echo [4] 종료
echo.
set /p choice="선택하세요 (1-4): "

if "%choice%"=="1" goto START_SERVER
if "%choice%"=="2" goto STOP_SERVER
if "%choice%"=="3" goto CHECK_STATUS
if "%choice%"=="4" goto END

echo 잘못된 선택입니다.
goto MENU

:START_SERVER
echo.
echo 서버 시작...
echo ============================================================

REM 기존 서버 종료 (포트 3000만)
echo [1/2] 기존 프로세스 정리 중 (포트 3000)...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3000 ^| findstr LISTENING') do taskkill /F /PID %%a 2>nul
timeout /t 2 /nobreak > nul

call :INIT_MYSQL

echo [2/2] Frontend 서버 시작 중...
cd /d "%~dp0trend-video-frontend"
start "Trend Video Frontend" cmd /k "npm run dev"
cd /d "%~dp0"

echo.
echo 서버가 시작되었습니다!
echo    Frontend: http://localhost:3000
echo.
pause
goto MENU

:STOP_SERVER
echo.
echo 서버 중지...
echo ============================================================
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3000 ^| findstr LISTENING') do taskkill /F /PID %%a 2>nul
echo 포트 3000 서버가 종료되었습니다.
echo.
pause
goto MENU

:CHECK_STATUS
echo.
echo 서버 상태 확인...
echo ============================================================
echo.
echo 실행 중인 Node.js 프로세스:
tasklist /FI "IMAGENAME eq node.exe" 2>nul | find "node.exe" > nul
if %errorlevel%==0 (
    tasklist /FI "IMAGENAME eq node.exe"
    echo.
    echo 포트 3000 사용 상태:
    netstat -ano | findstr :3000
) else (
    echo    실행 중인 Node.js 프로세스가 없습니다.
)
echo.
pause
goto MENU

:END
echo.
echo 종료합니다.
exit /b 0

REM ============================================================
REM 서브루틴: MySQL 초기화 (서비스 시작 + 스키마 적용)
REM ============================================================
:INIT_MYSQL
set MYSQL_USER=root
set MYSQL_PASSWORD=trend2024!
set MYSQL_DATABASE=trend_video
set SCHEMA_FILE=%~dp0trend-video-frontend\schema-mysql.sql
set HASH_FILE=%~dp0.schema_hash

REM MySQL 서비스 확인 및 시작
sc query MySQL80 | find "RUNNING" >nul 2>&1
if %errorlevel% neq 0 (
    echo MySQL 서비스 시작 중...
    net start MySQL80 >nul 2>&1
    timeout /t 3 /nobreak >nul
)

REM MySQL 연결 테스트 (최대 10회 재시도)
echo MySQL 연결 테스트 중...
set RETRY_COUNT=0
:MYSQL_RETRY
mysql -h 127.0.0.1 -u %MYSQL_USER% -p%MYSQL_PASSWORD% -e "SELECT 1" >nul 2>&1
if %errorlevel% equ 0 (
    echo    MySQL 연결 OK
    goto MYSQL_CONNECTED
)

set /a RETRY_COUNT+=1
if %RETRY_COUNT% lss 10 (
    echo    연결 실패, 재시도 중... (%RETRY_COUNT%/10^)
    timeout /t 1 /nobreak >nul
    goto MYSQL_RETRY
)

REM 10번 재시도 후에도 실패하면 에러
echo.
echo [ERROR] MySQL 연결 실패!
echo    - MySQL 서비스가 실행 중인지 확인하세요
echo    - 비밀번호(trend2024!^)가 맞는지 확인하세요
echo    - MySQL Workbench로 직접 접속을 시도해보세요
echo.
echo 서버 시작을 중단합니다.
pause
exit /b 1

:MYSQL_CONNECTED

REM 스키마 파일 없으면 스킵
if not exist "%SCHEMA_FILE%" (
    echo MySQL [SKIP] schema-mysql.sql 없음
    goto :eof
)

REM 스키마 파일 해시 계산
for /f %%i in ('certutil -hashfile "%SCHEMA_FILE%" MD5 ^| findstr /v "hash"') do set NEW_HASH=%%i

REM 이전 해시와 비교
set OLD_HASH=
if exist "%HASH_FILE%" (
    set /p OLD_HASH=<"%HASH_FILE%"
)

if "%NEW_HASH%"=="%OLD_HASH%" (
    echo MySQL 스키마 변경 없음 [SKIP]
    goto :eof
)

echo.
echo MySQL 스키마 적용 중...

REM DB 생성
mysql -u %MYSQL_USER% -p%MYSQL_PASSWORD% -e "CREATE DATABASE IF NOT EXISTS %MYSQL_DATABASE% CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;" 2>nul

REM 스키마 적용
mysql -u %MYSQL_USER% -p%MYSQL_PASSWORD% %MYSQL_DATABASE% < "%SCHEMA_FILE%" 2>nul
echo    스키마 적용 완료
echo %NEW_HASH%> "%HASH_FILE%"
goto :eof

REM ============================================================
REM 서브루틴: 원격 MySQL(192.168.0.30)에서 복구
REM ============================================================
:RESTORE_FROM_REMOTE
set REMOTE_HOST=192.168.0.30
set DUMP_FILE=%~dp0remote_dump.sql
set USER_BACKUP=%~dp0mysql_backup\users.sql

echo.
echo [1/5] 원격 MySQL 연결 테스트 중 (%REMOTE_HOST%)...
mysql -h %REMOTE_HOST% -u %MYSQL_USER% -p%MYSQL_PASSWORD% -e "SELECT 1" >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] 원격 MySQL 연결 실패!
    exit /b 1
)
echo       OK

echo [2/5] 원격에서 데이터 덤프 중...
mysqldump -h %REMOTE_HOST% -u %MYSQL_USER% -p%MYSQL_PASSWORD% --default-character-set=utf8mb4 %MYSQL_DATABASE% > "%DUMP_FILE%" 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] 덤프 실패!
    exit /b 1
)
echo       OK

echo [3/5] 로컬 DB 생성 중...
mysql -h 127.0.0.1 -u %MYSQL_USER% -p%MYSQL_PASSWORD% -e "CREATE DATABASE IF NOT EXISTS %MYSQL_DATABASE% CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;" 2>nul
echo       OK

echo [4/5] 로컬 사용자/권한 복원 중...
if exist "%USER_BACKUP%" (
    mysql -h 127.0.0.1 -u %MYSQL_USER% -p%MYSQL_PASSWORD% < "%USER_BACKUP%" 2>nul
    echo       OK
) else (
    echo       [SKIP] users.sql 없음
)

echo [5/5] 로컬에 데이터 복원 중...
mysql -h 127.0.0.1 -u %MYSQL_USER% -p%MYSQL_PASSWORD% --default-character-set=utf8mb4 %MYSQL_DATABASE% < "%DUMP_FILE%" 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] 복원 실패!
    exit /b 1
)
echo       OK

del "%DUMP_FILE%" 2>nul
echo.
echo 복구 완료!
exit /b 0
