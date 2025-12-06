@echo off
chcp 65001 >nul
title Trend Video Server

echo ========================================
echo   Trend Video Server
echo ========================================
echo.

:: 1. MySQL 연결 테스트
echo [1/5] MySQL 연결 테스트...
mysql -h 127.0.0.1 -u root -ptrend2024! -e "SELECT 1" >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] MySQL 연결 실패!
    echo.
    echo 확인사항:
    echo   1. MySQL 서버가 실행 중인가?
    echo   2. 비밀번호가 맞는가? (현재: trend2024!)
    echo.
    pause
    exit /b 1
)
echo       OK - MySQL 연결 성공

:: 2. 데이터베이스 생성 (없으면)
echo [2/5] 데이터베이스 확인...
mysql -h 127.0.0.1 -u root -ptrend2024! -e "CREATE DATABASE IF NOT EXISTS trend_video CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;" 2>nul
echo       OK - trend_video

:: 3. 스키마 적용
echo [3/5] 스키마 적용...
if exist schema-mysql.sql (
    mysql -h 127.0.0.1 -u root -ptrend2024! trend_video < schema-mysql.sql 2>nul
    echo       OK - 스키마 적용 완료
) else (
    echo       [SKIP] schema-mysql.sql 없음
)

:: 4. npm install (node_modules 없으면)
echo [4/5] 패키지 확인...
if not exist node_modules (
    echo       패키지 설치 중...
    call npm install
) else (
    echo       OK - node_modules 존재
)

:: 5. 서버 실행
echo [5/5] 서버 시작...
echo.
echo ========================================
echo   http://localhost:3000
echo   종료: Ctrl+C
echo ========================================
echo.

npm run dev
