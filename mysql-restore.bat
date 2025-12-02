@echo off
chcp 65001 > nul
setlocal enabledelayedexpansion

REM ============================================================
REM MySQL 복원 스크립트
REM 문제 발생 시 최근 백업으로 원복
REM ============================================================

set MYSQL_BIN="C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe"
set MYSQL_USER=root
set MYSQL_PASSWORD=trend2024
set MYSQL_DATABASE=trend_video
set BACKUP_DIR=%~dp0mysql_backup

echo ============================================================
echo MySQL 복원 도구
echo ============================================================
echo.

REM 백업 파일 목록 표시
echo [사용 가능한 백업 파일]
echo.
set COUNT=0
for /f "tokens=*" %%f in ('dir /b /o-d "%BACKUP_DIR%\full_backup_*.sql" 2^>nul') do (
    set /a COUNT+=1
    echo   [!COUNT!] %%f
    set "FILE_!COUNT!=%%f"
    if !COUNT! geq 10 goto SHOW_MENU
)

if %COUNT%==0 (
    echo   백업 파일이 없습니다!
    pause
    exit /b 1
)

:SHOW_MENU
echo.
echo   [0] 취소
echo.
set /p CHOICE="복원할 백업 번호 선택 (1-%COUNT%): "

if "%CHOICE%"=="0" (
    echo 취소되었습니다.
    exit /b 0
)

set "SELECTED_FILE=!FILE_%CHOICE%!"
if "%SELECTED_FILE%"=="" (
    echo 잘못된 선택입니다.
    pause
    exit /b 1
)

echo.
echo 선택된 파일: %SELECTED_FILE%
echo.
set /p CONFIRM="정말 복원하시겠습니까? 현재 데이터가 덮어씌워집니다! (Y/N): "

if /i not "%CONFIRM%"=="Y" (
    echo 취소되었습니다.
    exit /b 0
)

echo.
echo ============================================================
echo 복원 시작...
echo ============================================================

REM 1. 사용자 권한 복원 (같은 날짜의 users 파일 찾기)
set DATE_PART=%SELECTED_FILE:~12,8%
set USERS_FILE=%BACKUP_DIR%\users_%DATE_PART%*.sql
for /f "tokens=*" %%u in ('dir /b /o-d "%USERS_FILE%" 2^>nul') do (
    set USERS_FOUND=%%u
    goto RESTORE_USERS
)
goto SKIP_USERS

:RESTORE_USERS
echo [1/2] 사용자 권한 복원 중... (%USERS_FOUND%)
%MYSQL_BIN% -u %MYSQL_USER% -p%MYSQL_PASSWORD% < "%BACKUP_DIR%\%USERS_FOUND%" 2>nul
echo       완료

:SKIP_USERS
REM 2. 데이터베이스 복원
echo [2/2] 데이터베이스 복원 중... (%SELECTED_FILE%)
%MYSQL_BIN% -u %MYSQL_USER% -p%MYSQL_PASSWORD% -e "DROP DATABASE IF EXISTS %MYSQL_DATABASE%; CREATE DATABASE %MYSQL_DATABASE% CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;" 2>nul
%MYSQL_BIN% -u %MYSQL_USER% -p%MYSQL_PASSWORD% --default-character-set=utf8mb4 %MYSQL_DATABASE% < "%BACKUP_DIR%\%SELECTED_FILE%" 2>nul
if %errorlevel% equ 0 (
    echo       완료!
) else (
    echo       [ERROR] 복원 실패!
    pause
    exit /b 1
)

echo.
echo ============================================================
echo 복원 완료!
echo ============================================================
pause
