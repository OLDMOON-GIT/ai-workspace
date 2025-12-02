@echo off
chcp 65001 >nul
echo ========================================
echo   컨텍스트 메뉴 응답 개선 도구
echo ========================================
echo.
echo 이 스크립트는 다음 작업을 수행합니다:
echo.
echo 1. NVIDIA 데스크탑 컨텍스트 메뉴 비활성화
echo 2. OneDrive 컨텍스트 메뉴 비활성화
echo 3. Dropbox 컨텍스트 메뉴 비활성화
echo 4. 썸네일 캐시 정리
echo 5. 탐색기 최적화 설정
echo.
echo ※ Google Drive는 유지됩니다
echo.
echo 계속하려면 아무 키나 누르세요...
pause >nul
echo.

:: 관리자 권한 확인
net session >nul 2>&1
if errorlevel 1 (
    echo [경고] 관리자 권한이 필요합니다.
    echo 이 파일을 마우스 오른쪽 클릭 후 '관리자 권한으로 실행'을 선택하세요.
    pause
    exit /b 1
)

echo [1/6] NVIDIA 데스크탑 컨텍스트 메뉴 비활성화...
reg add "HKEY_LOCAL_MACHINE\SOFTWARE\Classes\Directory\Background\shellex\ContextMenuHandlers\NvCplDesktopContext.disabled" /ve /t REG_SZ /d "{3D1975AF-48C6-4f8e-A182-BE0E08FA86A9}" /f >nul 2>&1
reg delete "HKEY_LOCAL_MACHINE\SOFTWARE\Classes\Directory\Background\shellex\ContextMenuHandlers\NvCplDesktopContext" /f >nul 2>&1
echo    ✓ 완료

echo [2/6] OneDrive 컨텍스트 메뉴 비활성화...
reg add "HKEY_CLASSES_ROOT\CLSID\{CB3D0F55-BC2C-4C1A-85ED-23ED75B5106B}" /v System.IsPinnedToNameSpaceTree /t REG_DWORD /d 0 /f >nul 2>&1
reg delete "HKEY_CLASSES_ROOT\AllFilesystemObjects\shellex\ContextMenuHandlers\{CB3D0F55-BC2C-4C1A-85ED-23ED75B5106B}" /f >nul 2>&1
echo    ✓ 완료

echo [3/6] Dropbox 컨텍스트 메뉴 비활성화...
reg delete "HKEY_CLASSES_ROOT\*\shellex\ContextMenuHandlers\DropboxExt" /f >nul 2>&1
reg delete "HKEY_CLASSES_ROOT\Directory\shellex\ContextMenuHandlers\DropboxExt" /f >nul 2>&1
echo    ✓ 완료

echo [4/6] 썸네일 캐시 정리...
taskkill /f /im explorer.exe >nul 2>&1
del /f /s /q /a "%LocalAppData%\Microsoft\Windows\Explorer\thumbcache_*.db" >nul 2>&1
del /f /s /q /a "%LocalAppData%\Microsoft\Windows\Explorer\iconcache_*.db" >nul 2>&1
echo    ✓ 완료

echo [5/6] 탐색기 최적화 설정 적용...
:: 자동 폴더 타입 검색 비활성화 (느려지는 원인)
reg add "HKEY_CURRENT_USER\Software\Classes\Local Settings\Software\Microsoft\Windows\Shell\Bags\AllFolders\Shell" /v FolderType /t REG_SZ /d NotSpecified /f >nul
:: 빠른 액세스 추적 비활성화
reg add "HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\Explorer" /v ShowFrequent /t REG_DWORD /d 0 /f >nul
reg add "HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\Explorer" /v ShowRecent /t REG_DWORD /d 0 /f >nul
echo    ✓ 완료

echo [6/6] 탐색기 재시작...
timeout /t 2 /nobreak >nul
start explorer.exe
timeout /t 3 /nobreak >nul
echo    ✓ 완료

echo.
echo ========================================
echo   작업 완료!
echo ========================================
echo.
echo 탐색기가 재시작되었습니다.
echo 파일을 오른쪽 클릭하여 개선되었는지 확인하세요.
echo.
echo 문제가 계속되면:
echo 1. PC를 재시작하세요
echo 2. ShellExView 도구로 추가 셸 확장을 비활성화하세요
echo    https://www.nirsoft.net/utils/shexview.html
echo.
pause
