@echo off
echo ========================================
echo   Context Menu Speed Fix
echo ========================================
echo.
echo This will:
echo 1. Disable NVIDIA context menu
echo 2. Disable OneDrive context menu
echo 3. Disable Dropbox context menu
echo 4. Disable Google Drive context menu
echo 5. Disable Git context menu
echo 6. Clear thumbnail cache
echo 7. Optimize Explorer settings
echo.
pause

:: Check admin rights
net session >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Admin rights required!
    echo Right-click this file and select "Run as administrator"
    pause
    exit /b 1
)

echo.
echo [1/7] Disabling NVIDIA context menu...
reg delete "HKEY_LOCAL_MACHINE\SOFTWARE\Classes\Directory\Background\shellex\ContextMenuHandlers\NvCplDesktopContext" /f >nul 2>&1
reg add "HKEY_CLASSES_ROOT\Directory\Background\shellex\ContextMenuHandlers\NvCplDesktopContext" /v "" /t REG_SZ /d "" /f >nul 2>&1
reg add "HKEY_CLASSES_ROOT\Directory\Background\shellex\ContextMenuHandlers\NvCplDesktopContext" /f >nul 2>&1
for /f %%a in ('reg query "HKEY_CLASSES_ROOT\Directory\Background\shellex\ContextMenuHandlers\NvCplDesktopContext" 2^>nul') do (
    reg add "HKEY_LOCAL_MACHINE\SOFTWARE\Classes\Directory\Background\shellex\ContextMenuHandlers\NvCplDesktopContext.bak" /ve /d "%%a" /f >nul 2>&1
    reg delete "HKEY_CLASSES_ROOT\Directory\Background\shellex\ContextMenuHandlers\NvCplDesktopContext" /f >nul 2>&1
)
echo    Done

echo [2/7] Disabling OneDrive context menu...
reg add "HKEY_CLASSES_ROOT\CLSID\{CB3D0F55-BC2C-4C1A-85ED-23ED75B5106B}" /v System.IsPinnedToNameSpaceTree /t REG_DWORD /d 0 /f >nul 2>&1
reg delete "HKEY_CLASSES_ROOT\AllFilesystemObjects\shellex\ContextMenuHandlers\{CB3D0F55-BC2C-4C1A-85ED-23ED75B5106B}" /f >nul 2>&1
echo    Done

echo [3/7] Disabling Dropbox context menu...
reg delete "HKEY_CLASSES_ROOT\*\shellex\ContextMenuHandlers\DropboxExt" /f >nul 2>&1
reg delete "HKEY_CLASSES_ROOT\Directory\shellex\ContextMenuHandlers\DropboxExt" /f >nul 2>&1
echo    Done

echo [4/7] Disabling Google Drive context menu...
reg add "HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows\CurrentVersion\Shell Extensions\Blocked" /v "{E8AB36C9-5775-4849-BD2F-71663484FBE1}" /t REG_SZ /d "" /f >nul 2>&1
reg add "HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows\CurrentVersion\Shell Extensions\Blocked" /v "{A8CAA6A9-DE4F-4A84-8CF7-1F8B5B84F7D3}" /t REG_SZ /d "" /f >nul 2>&1
reg delete "HKEY_CLASSES_ROOT\*\shellex\ContextMenuHandlers\DriveFS" /f >nul 2>&1
reg delete "HKEY_CLASSES_ROOT\Directory\shellex\ContextMenuHandlers\DriveFS" /f >nul 2>&1
echo    Done

echo [5/7] Disabling Git context menu (TortoiseGit)...
reg delete "HKEY_CLASSES_ROOT\*\shellex\ContextMenuHandlers\TortoiseGit" /f >nul 2>&1
reg delete "HKEY_CLASSES_ROOT\Directory\shellex\ContextMenuHandlers\TortoiseGit" /f >nul 2>&1
reg delete "HKEY_CLASSES_ROOT\Directory\Background\shellex\ContextMenuHandlers\TortoiseGit" /f >nul 2>&1
echo    Done

echo [6/7] Clearing thumbnail and icon cache...
taskkill /f /im explorer.exe >nul 2>&1
timeout /t 2 /nobreak >nul
del /f /s /q /a "%LocalAppData%\Microsoft\Windows\Explorer\thumbcache_*.db" >nul 2>&1
del /f /s /q /a "%LocalAppData%\Microsoft\Windows\Explorer\iconcache_*.db" >nul 2>&1
del /f /s /q /a "%LocalAppData%\IconCache.db" >nul 2>&1
echo    Done

echo [7/7] Optimizing Explorer settings...
reg add "HKEY_CURRENT_USER\Software\Classes\Local Settings\Software\Microsoft\Windows\Shell\Bags\AllFolders\Shell" /v FolderType /t REG_SZ /d NotSpecified /f >nul
reg add "HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\Explorer" /v ShowFrequent /t REG_DWORD /d 0 /f >nul
reg add "HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\Explorer" /v ShowRecent /t REG_DWORD /d 0 /f >nul
echo    Done

echo.
echo [*] Restarting Explorer...
start explorer.exe
timeout /t 3 /nobreak >nul

echo.
echo ========================================
echo   DONE!
echo ========================================
echo.
echo Changes applied:
echo - Disabled NVIDIA, OneDrive, Dropbox context menus
echo - Disabled Google Drive and Git context menus
echo - Cleared cache files
echo - Optimized Explorer settings
echo.
echo Try right-clicking a file now. It should be faster!
echo.
echo If problem persists:
echo 1. Restart your PC
echo 2. Pause Google Drive sync temporarily
echo 3. Use ShellExView tool:
echo    https://www.nirsoft.net/utils/shexview.html
echo.
pause
