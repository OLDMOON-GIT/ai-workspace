@echo off
chcp 65001 >nul
echo ========================================
echo   오른쪽 클릭 컨텍스트 메뉴 진단
echo ========================================
echo.
echo 진단 리포트를 생성합니다...
echo.

set REPORT_FILE=context-menu-report.txt

echo [파일 탐색기 오른쪽 클릭 응답 없음 진단 리포트] > %REPORT_FILE%
echo 생성 시간: %date% %time% >> %REPORT_FILE%
echo ================================================ >> %REPORT_FILE%
echo. >> %REPORT_FILE%

echo [1단계] 셸 확장 프로그램 목록 조회 중...
echo. >> %REPORT_FILE%
echo == 1. 등록된 컨텍스트 메뉴 핸들러 (ContextMenuHandlers) == >> %REPORT_FILE%
echo. >> %REPORT_FILE%

:: 모든 파일 타입에 대한 컨텍스트 메뉴 핸들러 조회
reg query "HKEY_CLASSES_ROOT\*\shellex\ContextMenuHandlers" /s >> %REPORT_FILE% 2>nul
reg query "HKEY_CLASSES_ROOT\AllFilesystemObjects\shellex\ContextMenuHandlers" /s >> %REPORT_FILE% 2>nul
reg query "HKEY_CLASSES_ROOT\Directory\shellex\ContextMenuHandlers" /s >> %REPORT_FILE% 2>nul

echo. >> %REPORT_FILE%
echo == 2. 의심되는 느린 셸 확장 프로그램 == >> %REPORT_FILE%
echo. >> %REPORT_FILE%

:: 흔히 문제를 일으키는 프로그램들
echo [확인 필요] 다음 프로그램들이 설치되어 있는지 확인: >> %REPORT_FILE%
echo - OneDrive >> %REPORT_FILE%
echo - Dropbox >> %REPORT_FILE%
echo - Google Drive >> %REPORT_FILE%
echo - 클라우드 스토리지 프로그램 >> %REPORT_FILE%
echo - 백신 프로그램 (실시간 검사) >> %REPORT_FILE%
echo - 압축 프로그램 (7-Zip, WinRAR 등) >> %REPORT_FILE%
echo - Git (TortoiseGit, GitHub Desktop 등) >> %REPORT_FILE%
echo. >> %REPORT_FILE%

echo [2단계] 설치된 프로그램 확인 중...
echo == 3. 설치된 프로그램 목록 == >> %REPORT_FILE%
echo. >> %REPORT_FILE%
wmic product get name,version 2>nul | findstr /i "OneDrive Dropbox Drive Cloud Tortoise Git 7-Zip WinRAR" >> %REPORT_FILE%

echo. >> %REPORT_FILE%
echo == 4. 실행 중인 관련 프로세스 == >> %REPORT_FILE%
echo. >> %REPORT_FILE%
tasklist | findstr /i "OneDrive Dropbox GoogleDrive sync cloud" >> %REPORT_FILE% 2>nul

echo [3단계] Windows 이벤트 로그 확인 중...
echo. >> %REPORT_FILE%
echo == 5. 최근 탐색기 오류 로그 (최근 10개) == >> %REPORT_FILE%
echo. >> %REPORT_FILE%
powershell -Command "Get-WinEvent -FilterHashtable @{LogName='Application';ProviderName='Application Error'} -MaxEvents 10 | Where-Object {$_.Message -like '*explorer*'} | Format-List TimeCreated,Message" >> %REPORT_FILE% 2>nul

echo.
echo ========================================
echo   진단 완료!
echo ========================================
echo.
echo 리포트 파일: %REPORT_FILE%
echo.
type %REPORT_FILE%
echo.
echo ========================================
echo   해결 방법 제안
echo ========================================
echo.
echo 1. 컨텍스트 메뉴 최적화 도구 다운로드:
echo    ShellExView (NirSoft) - 셸 확장 관리 도구
echo    https://www.nirsoft.net/utils/shexview.html
echo.
echo 2. Windows 빠른 해결 방법:
echo    - OneDrive 컨텍스트 메뉴 비활성화
echo    - 클라우드 드라이브 동기화 일시 중지
echo    - 백신 실시간 검사 제외 폴더 설정
echo.
echo 3. 자동 수정 스크립트 실행:
echo    fix-context-menu.bat 을 실행하세요
echo.
pause
