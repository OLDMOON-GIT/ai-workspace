@echo off
chcp 65001 > nul
setlocal enabledelayedexpansion

echo ============================================================
echo   Auto Update + Server Start
echo ============================================================
echo.

cd /d "%~dp0"

echo Git Pull 시작...
echo ============================================================

echo.
echo [1/3] Workspace 업데이트...
git stash -q 2>nul
git pull
if %errorlevel% neq 0 (
    echo    [WARNING] Pull 실패! 로컬 변경사항 확인 필요
)

echo.
echo [2/3] Frontend 업데이트...
cd trend-video-frontend
git stash -q 2>nul
git pull
if %errorlevel% neq 0 (
    echo    [WARNING] Pull 실패! 로컬 변경사항 확인 필요
)
cd ..

echo.
echo [3/3] Backend 업데이트...
cd trend-video-backend
git stash -q 2>nul
git pull
if %errorlevel% neq 0 (
    echo    [WARNING] Pull 실패! 로컬 변경사항 확인 필요
)
cd ..

echo.
echo Git Pull 완료!
echo.

REM MySQL 초기화
call :INIT_MYSQL

REM 기존 서버 종료 (포트 3000)
echo.
echo 기존 프로세스 정리 중 (포트 3000)...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3000 ^| findstr LISTENING') do taskkill /F /PID %%a 2>nul
timeout /t 2 /nobreak > nul

REM 서버 시작
echo.
echo Frontend 서버 시작 중...
cd /d "%~dp0trend-video-frontend"
start "Trend Video Frontend" cmd /k "npm run dev"
cd /d "%~dp0"

echo.
echo 서버가 시작되었습니다!
echo    Frontend: http://localhost:3000
echo.
pause
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

REM MySQL 연결 테스트
mysql -h 127.0.0.1 -u %MYSQL_USER% -p%MYSQL_PASSWORD% -e "SELECT 1" >nul 2>&1
if %errorlevel% neq 0 (
    echo [WARNING] 로컬 MySQL 연결 실패! 원격에서 복구 시도...
    call :RESTORE_FROM_REMOTE
    if %errorlevel% neq 0 (
        echo [ERROR] 복구 실패!
        goto :eof
    )
)
echo MySQL 연결 OK

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
