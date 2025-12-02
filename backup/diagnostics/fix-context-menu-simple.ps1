# Fix Context Menu Performance - Simple Version
# Must run as Administrator

Write-Host "=== Context Menu Performance Fix ===" -ForegroundColor Green
Write-Host ""

# Check admin rights
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "ERROR: Administrator privileges required!" -ForegroundColor Red
    Write-Host "Please run PowerShell as Administrator and try again." -ForegroundColor Yellow
    pause
    exit 1
}

Write-Host "[1/6] Disabling NVIDIA Desktop Context Menu..." -ForegroundColor Cyan
try {
    # Backup first
    $nvPath = "HKLM:\SOFTWARE\Classes\Directory\Background\shellex\ContextMenuHandlers\NvCplDesktopContext"
    if (Test-Path $nvPath) {
        $clsid = (Get-ItemProperty -Path $nvPath -ErrorAction SilentlyContinue).'(default)'
        if ($clsid) {
            # Create disabled key
            New-Item -Path "HKLM:\SOFTWARE\Classes\Directory\Background\shellex\ContextMenuHandlers\NvCplDesktopContext.disabled" -Force | Out-Null
            Set-ItemProperty -Path "HKLM:\SOFTWARE\Classes\Directory\Background\shellex\ContextMenuHandlers\NvCplDesktopContext.disabled" -Name "(default)" -Value $clsid
            # Remove original
            Remove-Item -Path $nvPath -Force
            Write-Host "  OK - NVIDIA context menu disabled" -ForegroundColor Green
        }
    } else {
        Write-Host "  SKIP - NVIDIA context menu not found" -ForegroundColor Gray
    }
} catch {
    Write-Host "  ERROR: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""
Write-Host "[2/6] Disabling OneDrive Context Menu..." -ForegroundColor Cyan
try {
    Set-ItemProperty -Path "HKLM:\SOFTWARE\Classes\CLSID\{CB3D0F55-BC2C-4C1A-85ED-23ED75B5106B}" -Name "System.IsPinnedToNameSpaceTree" -Value 0 -ErrorAction SilentlyContinue
    Remove-Item -Path "HKLM:\SOFTWARE\Classes\AllFilesystemObjects\shellex\ContextMenuHandlers\{CB3D0F55-BC2C-4C1A-85ED-23ED75B5106B}" -Force -ErrorAction SilentlyContinue
    Write-Host "  OK - OneDrive context menu disabled" -ForegroundColor Green
} catch {
    Write-Host "  SKIP - OneDrive context menu not found" -ForegroundColor Gray
}

Write-Host ""
Write-Host "[3/6] Disabling Dropbox Context Menu..." -ForegroundColor Cyan
try {
    Remove-Item -Path "HKLM:\SOFTWARE\Classes\*\shellex\ContextMenuHandlers\DropboxExt" -Force -ErrorAction SilentlyContinue
    Remove-Item -Path "HKLM:\SOFTWARE\Classes\Directory\shellex\ContextMenuHandlers\DropboxExt" -Force -ErrorAction SilentlyContinue
    Write-Host "  OK - Dropbox context menu disabled" -ForegroundColor Green
} catch {
    Write-Host "  SKIP - Dropbox context menu not found" -ForegroundColor Gray
}

Write-Host ""
Write-Host "[4/6] Cleaning thumbnail cache..." -ForegroundColor Cyan
Stop-Process -Name explorer -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 1
Remove-Item -Path "$env:LOCALAPPDATA\Microsoft\Windows\Explorer\thumbcache_*.db" -Force -ErrorAction SilentlyContinue
Remove-Item -Path "$env:LOCALAPPDATA\Microsoft\Windows\Explorer\iconcache_*.db" -Force -ErrorAction SilentlyContinue
Write-Host "  OK - Thumbnail cache cleaned" -ForegroundColor Green

Write-Host ""
Write-Host "[5/6] Applying Explorer optimizations..." -ForegroundColor Cyan
try {
    New-Item -Path "HKCU:\Software\Classes\Local Settings\Software\Microsoft\Windows\Shell\Bags\AllFolders\Shell" -Force -ErrorAction SilentlyContinue | Out-Null
    Set-ItemProperty -Path "HKCU:\Software\Classes\Local Settings\Software\Microsoft\Windows\Shell\Bags\AllFolders\Shell" -Name "FolderType" -Value "NotSpecified" -ErrorAction SilentlyContinue
    Set-ItemProperty -Path "HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer" -Name "ShowFrequent" -Value 0 -ErrorAction SilentlyContinue
    Set-ItemProperty -Path "HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer" -Name "ShowRecent" -Value 0 -ErrorAction SilentlyContinue
    Write-Host "  OK - Explorer optimizations applied" -ForegroundColor Green
} catch {
    Write-Host "  WARNING: Some optimizations failed" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "[6/6] Restarting Explorer..." -ForegroundColor Cyan
Start-Sleep -Seconds 2
Start-Process explorer.exe
Start-Sleep -Seconds 3
Write-Host "  OK - Explorer restarted" -ForegroundColor Green

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  Complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Explorer has been restarted." -ForegroundColor Yellow
Write-Host "Try right-clicking on a file/folder to test performance." -ForegroundColor Yellow
Write-Host ""
Write-Host "NOTE: Google Drive context menu is preserved." -ForegroundColor Cyan
Write-Host ""
pause
