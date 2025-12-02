@echo off
chcp 65001 >nul
title MySQL Sync: Remote -> Local

set MYSQL_PATH="C:\Program Files\MySQL\MySQL Server 8.0\bin"
set REMOTE_HOST=192.168.0.30
set LOCAL_HOST=127.0.0.1
set USER=root
set REMOTE_PASS=trend2024!
set LOCAL_PASS=trend2024!
set PASS=trend2024!
set DB=trend_video
set DUMP_FILE=%TEMP%\trend_video_dump.sql

:: 로컬 비밀번호가 다르면 여기서 변경하세요
:: set LOCAL_PASS=다른비밀번호

echo ========================================
echo   MySQL Sync: %REMOTE_HOST% -> %LOCAL_HOST%
echo ========================================
echo.

:: 1. 원격 서버에서 덤프
echo [1/3] 원격 서버에서 데이터 덤프 중...
%MYSQL_PATH%\mysqldump.exe -h %REMOTE_HOST% -u %USER% -p%PASS% --single-transaction --routines --triggers %DB% > "%DUMP_FILE%" 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] 원격 서버 덤프 실패!
    type "%DUMP_FILE%"
    pause
    exit /b 1
)
echo       OK - 덤프 완료 (%DUMP_FILE%)

:: 2. 로컬 DB 초기화 (기존 데이터 삭제)
echo [2/3] 로컬 DB 초기화...
%MYSQL_PATH%\mysql.exe -h %LOCAL_HOST% -u %USER% -p%PASS% -e "DROP DATABASE IF EXISTS %DB%; CREATE DATABASE %DB% CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;" 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] 로컬 DB 초기화 실패!
    pause
    exit /b 1
)
echo       OK - DB 초기화 완료

:: 3. 덤프 파일 임포트
echo [3/3] 로컬 서버로 데이터 임포트 중...
%MYSQL_PATH%\mysql.exe -h %LOCAL_HOST% -u %USER% -p%PASS% %DB% < "%DUMP_FILE%" 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] 임포트 실패!
    pause
    exit /b 1
)
echo       OK - 임포트 완료

:: 정리
del "%DUMP_FILE%" 2>nul

echo.
echo ========================================
echo   동기화 완료!
echo ========================================
echo.
pause
