# Force Disable Google Drive Context Menu
# Run as Administrator

Write-Host "========================================" -ForegroundColor Red
Write-Host "   FORCE DISABLE GOOGLE DRIVE MENU" -ForegroundColor Red
Write-Host "========================================" -ForegroundColor Red
Write-Host ""

# Check admin
if (-NOT ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")) {
    Write-Host "[ERROR] Admin required!" -ForegroundColor Red
    pause
    exit
}

Write-Host "[1/4] Killing Google Drive processes..." -ForegroundColor Yellow
Stop-Process -Name "GoogleDriveFS" -Force -ErrorAction SilentlyContinue
Stop-Process -Name "GoogleDrive" -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2
Write-Host "   Done" -ForegroundColor Green

Write-Host "[2/4] Blocking Google Drive shell extensions..." -ForegroundColor Yellow

# Known Google Drive CLSIDs
$googleCLSIDs = @(
    "{E8AB36C9-5775-4849-BD2F-71663484FBE1}",
    "{A8CAA6A9-DE4F-4A84-8CF7-1F8B5B84F7D3}",
    "{F8F03E5B-9F15-4F54-B4FE-5B4C6E4C5E4C}",
    "{6B9228DA-9C15-419E-856C-19E768A13BDC}",
    "{0E270DAA-1BE6-48F2-AC49-0819A1AEBC1B}"
)

$blockPath = "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Shell Extensions\Blocked"
if (!(Test-Path $blockPath)) {
    New-Item -Path $blockPath -Force | Out-Null
}

foreach ($clsid in $googleCLSIDs) {
    New-ItemProperty -Path $blockPath -Name $clsid -Value "" -PropertyType String -Force -ErrorAction SilentlyContinue | Out-Null
}
Write-Host "   Done - Blocked $($googleCLSIDs.Count) extensions" -ForegroundColor Green

Write-Host "[3/4] Removing context menu handlers..." -ForegroundColor Yellow

$handlerPaths = @(
    "Registry::HKEY_CLASSES_ROOT\*\shellex\ContextMenuHandlers\DriveFS",
    "Registry::HKEY_CLASSES_ROOT\Directory\shellex\ContextMenuHandlers\DriveFS",
    "Registry::HKEY_CLASSES_ROOT\Directory\Background\shellex\ContextMenuHandlers\DriveFS",
    "Registry::HKEY_CLASSES_ROOT\AllFilesystemObjects\shellex\ContextMenuHandlers\DriveFS"
)

foreach ($path in $handlerPaths) {
    if (Test-Path $path) {
        Remove-Item -Path $path -Force -Recurse -ErrorAction SilentlyContinue
    }
}
Write-Host "   Done" -ForegroundColor Green

Write-Host "[4/4] Restarting Explorer..." -ForegroundColor Yellow
Stop-Process -Name explorer -Force
Start-Sleep -Seconds 3
Start-Process explorer.exe
Start-Sleep -Seconds 2
Write-Host "   Done" -ForegroundColor Green

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "   COMPLETED!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Google Drive context menu has been DISABLED." -ForegroundColor Yellow
Write-Host "Google Drive will still sync files, but won't slow down context menus." -ForegroundColor Cyan
Write-Host ""
Write-Host "Try right-clicking now - it should be FAST!" -ForegroundColor Green
Write-Host ""
pause
