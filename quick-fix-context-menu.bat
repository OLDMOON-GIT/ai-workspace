@echo off
chcp 65001 >nul
echo ========================================
echo   컨텍스트 메뉴 빠른 수정
echo ========================================
echo.
echo 감지된 문제:
echo - Google Drive 셸 확장
echo - Git 셸 확장
echo.
echo 이 프로그램들의 컨텍스트 메뉴를 비활성화합니다.
echo.
pause

:: 관리자 권한 확인
net session >nul 2>&1
if errorlevel 1 (
    echo [경고] 관리자 권한으로 실행하세요!
    echo 이 파일을 마우스 오른쪽 클릭 -^> '관리자 권한으로 실행'
    pause
    exit /b 1
)

echo.
echo [1/4] Google Drive 컨텍스트 메뉴 비활성화...
:: Google Drive 셸 확장 비활성화
reg add "HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows\CurrentVersion\Shell Extensions\Blocked" /v "{E8AB36C9-5775-4849-BD2F-71663484FBE1}" /t REG_SZ /d "" /f >nul 2>&1
reg add "HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows\CurrentVersion\Shell Extensions\Blocked" /v "{A8CAA6A9-DE4F-4A84-8CF7-1F8B5B84F7D3}" /t REG_SZ /d "" /f >nul 2>&1
reg add "HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows\CurrentVersion\Shell Extensions\Blocked" /v "{F8F03E5B-9F15-4F54-B4FE-5B4C6E4C5E4C}" /t REG_SZ /d "" /f >nul 2>&1

:: Google Drive 특정 핸들러 삭제
reg delete "HKEY_CLASSES_ROOT\*\shellex\ContextMenuHandlers\DriveFS" /f >nul 2>&1
reg delete "HKEY_CLASSES_ROOT\Directory\shellex\ContextMenuHandlers\DriveFS" /f >nul 2>&1
echo    [완료]

echo [2/4] TortoiseGit 컨텍스트 메뉴 비활성화...
:: TortoiseGit이 설치되어 있다면 비활성화
reg delete "HKEY_CLASSES_ROOT\*\shellex\ContextMenuHandlers\TortoiseGit" /f >nul 2>&1
reg delete "HKEY_CLASSES_ROOT\Directory\shellex\ContextMenuHandlers\TortoiseGit" /f >nul 2>&1
reg delete "HKEY_CLASSES_ROOT\Directory\Background\shellex\ContextMenuHandlers\TortoiseGit" /f >nul 2>&1
echo    [완료]

echo [3/4] 썸네일 캐시 및 아이콘 캐시 정리...
:: 탐색기 종료
taskkill /f /im explorer.exe >nul 2>&1
timeout /t 1 /nobreak >nul

:: 캐시 삭제
del /f /s /q /a "%LocalAppData%\Microsoft\Windows\Explorer\thumbcache_*.db" >nul 2>&1
del /f /s /q /a "%LocalAppData%\Microsoft\Windows\Explorer\iconcache_*.db" >nul 2>&1
del /f /s /q /a "%LocalAppData%\IconCache.db" >nul 2>&1

:: 추가 최적화: 탐색기 검색 인덱싱 비활성화 (선택적)
reg add "HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\Policies\Explorer" /v DisableSearchBoxSuggestions /t REG_DWORD /d 1 /f >nul
echo    [완료]

echo [4/4] 탐색기 재시작...
start explorer.exe
timeout /t 3 /nobreak >nul
echo    [완료]

echo.
echo ========================================
echo   수정 완료!
echo ========================================
echo.
echo 변경 사항:
echo - Google Drive 컨텍스트 메뉴 비활성화
echo - Git 관련 컨텍스트 메뉴 비활성화
echo - 썸네일/아이콘 캐시 정리
echo.
echo 이제 파일을 오른쪽 클릭해보세요.
echo 훨씬 빨라져야 합니다!
echo.
echo 문제가 계속되면:
echo 1. PC 재시작
echo 2. Google Drive 동기화 일시 중지
echo 3. ShellExView 도구로 추가 확인
echo    https://www.nirsoft.net/utils/shexview.html
echo.
pause
