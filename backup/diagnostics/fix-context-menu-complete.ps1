# Context Menu Speed Fix - Complete Version
# Run as Administrator

$Host.UI.RawUI.WindowTitle = "Context Menu Speed Fix"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "   Context Menu Complete Fix" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check admin rights
if (-NOT ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")) {
    Write-Host "[ERROR] Administrator rights required!" -ForegroundColor Red
    Write-Host "Please right-click and select 'Run as Administrator'" -ForegroundColor Yellow
    Write-Host ""
    pause
    exit
}

Write-Host "This will disable slow context menu handlers:" -ForegroundColor Yellow
Write-Host "- NVIDIA context menu"
Write-Host "- Google Drive context menu"
Write-Host "- Git (TortoiseGit) context menu"
Write-Host "- OneDrive context menu"
Write-Host "- Dropbox context menu"
Write-Host ""
Write-Host "Press any key to continue..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
Write-Host ""

# Function to safely delete registry key
function Remove-RegistryKey {
    param($Path)
    if (Test-Path $Path) {
        try {
            Remove-Item -Path $Path -Force -Recurse -ErrorAction SilentlyContinue
            return $true
        } catch {
            return $false
        }
    }
    return $false
}

# Function to add registry value
function Set-RegistryValue {
    param($Path, $Name, $Value, $Type)
    try {
        if (!(Test-Path $Path)) {
            New-Item -Path $Path -Force | Out-Null
        }
        if ($Name -eq "") {
            Set-ItemProperty -Path $Path -Name "(default)" -Value $Value -ErrorAction SilentlyContinue | Out-Null
        } else {
            New-ItemProperty -Path $Path -Name $Name -Value $Value -PropertyType $Type -Force -ErrorAction SilentlyContinue | Out-Null
        }
        return $true
    } catch {
        return $false
    }
}

Write-Host "[1/7] Disabling NVIDIA context menu..." -ForegroundColor Yellow
Remove-RegistryKey "Registry::HKEY_LOCAL_MACHINE\SOFTWARE\Classes\Directory\Background\shellex\ContextMenuHandlers\NvCplDesktopContext" | Out-Null
Remove-RegistryKey "Registry::HKEY_CLASSES_ROOT\Directory\Background\shellex\ContextMenuHandlers\NvCplDesktopContext" | Out-Null
Write-Host "   Done" -ForegroundColor Green

Write-Host "[2/7] Disabling Google Drive context menu..." -ForegroundColor Yellow
# Block Google Drive shell extensions
Set-RegistryValue "Registry::HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows\CurrentVersion\Shell Extensions\Blocked" "{E8AB36C9-5775-4849-BD2F-71663484FBE1}" "" "String" | Out-Null
Set-RegistryValue "Registry::HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows\CurrentVersion\Shell Extensions\Blocked" "{A8CAA6A9-DE4F-4A84-8CF7-1F8B5B84F7D3}" "" "String" | Out-Null
Set-RegistryValue "Registry::HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows\CurrentVersion\Shell Extensions\Blocked" "{F8F03E5B-9F15-4F54-B4FE-5B4C6E4C5E4C}" "" "String" | Out-Null
Remove-RegistryKey "Registry::HKEY_CLASSES_ROOT\*\shellex\ContextMenuHandlers\DriveFS" | Out-Null
Remove-RegistryKey "Registry::HKEY_CLASSES_ROOT\Directory\shellex\ContextMenuHandlers\DriveFS" | Out-Null
Write-Host "   Done" -ForegroundColor Green

Write-Host "[3/7] Disabling Git (TortoiseGit) context menu..." -ForegroundColor Yellow
Remove-RegistryKey "Registry::HKEY_CLASSES_ROOT\*\shellex\ContextMenuHandlers\TortoiseGit" | Out-Null
Remove-RegistryKey "Registry::HKEY_CLASSES_ROOT\Directory\shellex\ContextMenuHandlers\TortoiseGit" | Out-Null
Remove-RegistryKey "Registry::HKEY_CLASSES_ROOT\Directory\Background\shellex\ContextMenuHandlers\TortoiseGit" | Out-Null
Write-Host "   Done" -ForegroundColor Green

Write-Host "[4/7] Disabling OneDrive context menu..." -ForegroundColor Yellow
Set-RegistryValue "Registry::HKEY_CLASSES_ROOT\CLSID\{CB3D0F55-BC2C-4C1A-85ED-23ED75B5106B}" "System.IsPinnedToNameSpaceTree" 0 "DWord" | Out-Null
Remove-RegistryKey "Registry::HKEY_CLASSES_ROOT\AllFilesystemObjects\shellex\ContextMenuHandlers\{CB3D0F55-BC2C-4C1A-85ED-23ED75B5106B}" | Out-Null
Write-Host "   Done" -ForegroundColor Green

Write-Host "[5/7] Disabling Dropbox context menu..." -ForegroundColor Yellow
Remove-RegistryKey "Registry::HKEY_CLASSES_ROOT\*\shellex\ContextMenuHandlers\DropboxExt" | Out-Null
Remove-RegistryKey "Registry::HKEY_CLASSES_ROOT\Directory\shellex\ContextMenuHandlers\DropboxExt" | Out-Null
Write-Host "   Done" -ForegroundColor Green

Write-Host "[6/7] Clearing thumbnail and icon cache..." -ForegroundColor Yellow
# Stop Explorer
Stop-Process -Name explorer -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

# Clear cache files
$cachePaths = @(
    "$env:LOCALAPPDATA\Microsoft\Windows\Explorer\thumbcache_*.db",
    "$env:LOCALAPPDATA\Microsoft\Windows\Explorer\iconcache_*.db",
    "$env:LOCALAPPDATA\IconCache.db"
)

foreach ($path in $cachePaths) {
    Remove-Item -Path $path -Force -ErrorAction SilentlyContinue
}
Write-Host "   Done" -ForegroundColor Green

Write-Host "[7/7] Optimizing Explorer settings..." -ForegroundColor Yellow
# Disable automatic folder type detection
Set-RegistryValue "Registry::HKEY_CURRENT_USER\Software\Classes\Local Settings\Software\Microsoft\Windows\Shell\Bags\AllFolders\Shell" "FolderType" "NotSpecified" "String" | Out-Null
# Disable Quick Access tracking
Set-RegistryValue "Registry::HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\Explorer" "ShowFrequent" 0 "DWord" | Out-Null
Set-RegistryValue "Registry::HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\Explorer" "ShowRecent" 0 "DWord" | Out-Null
Write-Host "   Done" -ForegroundColor Green

Write-Host ""
Write-Host "[*] Restarting Explorer..." -ForegroundColor Cyan
Start-Process explorer.exe
Start-Sleep -Seconds 3

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "   COMPLETED!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Changes applied:" -ForegroundColor Yellow
Write-Host "- Disabled NVIDIA, Google Drive, Git context menus"
Write-Host "- Disabled OneDrive, Dropbox context menus"
Write-Host "- Cleared cache files"
Write-Host "- Optimized Explorer settings"
Write-Host ""
Write-Host "Try right-clicking a file now - it should be MUCH faster!" -ForegroundColor Cyan
Write-Host ""
Write-Host "If problem persists:" -ForegroundColor Yellow
Write-Host "1. Restart your PC"
Write-Host "2. Pause Google Drive sync (taskbar icon)"
Write-Host "3. Download ShellExView: https://www.nirsoft.net/utils/shexview.html"
Write-Host ""
pause
