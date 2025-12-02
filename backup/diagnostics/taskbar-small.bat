@echo off
chcp 65001 >nul
echo ========================================
echo   작업 표시줄 아이콘 작게 설정
echo ========================================
echo.

:: Windows 버전 확인
for /f "tokens=4-5 delims=. " %%i in ('ver') do set VERSION=%%i.%%j
echo Windows 버전: %VERSION%
echo.

:: Windows 11 체크 (빌드 번호 22000 이상)
for /f "tokens=3" %%a in ('reg query "HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion" /v CurrentBuild ^| find "CurrentBuild"') do set BUILD=%%a

if %BUILD% GEQ 22000 (
    echo [Windows 11 감지] TaskbarSi 값을 0으로 설정합니다...
    :: Windows 11: 0=small, 1=medium, 2=large
    reg add "HKCU\Software\Microsoft\Windows\CurrentVersion\Explorer\Advanced" /v TaskbarSi /t REG_DWORD /d 0 /f >nul
) else (
    echo [Windows 10 감지] TaskbarSmallIcons 값을 1로 설정합니다...
    :: Windows 10: 0=large, 1=small
    reg add "HKCU\Software\Microsoft\Windows\CurrentVersion\Explorer\Advanced" /v TaskbarSmallIcons /t REG_DWORD /d 1 /f >nul
)

if errorlevel 1 (
    echo [오류] 레지스트리 변경에 실패했습니다.
    pause
    goto :eof
)

echo.
echo [완료] 작업 표시줄 아이콘 크기가 '작게'로 설정되었습니다.
echo.
echo 탐색기를 다시 시작합니다...
echo.

:: 탐색기 강제 종료 및 재시작
taskkill /f /im explorer.exe >nul 2>&1
timeout /t 2 /nobreak >nul
start "" explorer.exe

echo.
echo [완료] 작업 표시줄이 새 설정으로 다시 시작되었습니다.
echo 변경사항이 즉시 적용되지 않으면 로그아웃 후 다시 로그인하세요.
echo.
pause
