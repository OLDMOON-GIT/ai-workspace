# Taskbar Size Fix for Windows 11
# Run as Administrator

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "   Taskbar Icon Size Fix" -ForegroundColor Cyan
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

# Check Windows version
$build = [System.Environment]::OSVersion.Version.Build
Write-Host "Windows Build: $build" -ForegroundColor Yellow

if ($build -ge 22000) {
    Write-Host "Windows 11 detected" -ForegroundColor Green
    Write-Host ""
    Write-Host "Setting TaskbarSi to 2 (Large icons)..." -ForegroundColor Yellow

    # Windows 11: 0=small, 1=medium, 2=large
    Set-ItemProperty -Path "HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\Advanced" -Name "TaskbarSi" -Value 2 -Type DWord -Force

    Write-Host "Done!" -ForegroundColor Green
} else {
    Write-Host "Windows 10 detected" -ForegroundColor Green
    Write-Host ""
    Write-Host "Setting TaskbarSmallIcons to 0 (Large icons)..." -ForegroundColor Yellow

    # Windows 10: 0=large, 1=small
    Set-ItemProperty -Path "HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\Advanced" -Name "TaskbarSmallIcons" -Value 0 -Type DWord -Force

    Write-Host "Done!" -ForegroundColor Green
}

Write-Host ""
Write-Host "Restarting Explorer..." -ForegroundColor Cyan

# Stop Explorer
Stop-Process -Name explorer -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

# Start Explorer
Start-Process explorer.exe
Start-Sleep -Seconds 3

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "   COMPLETED!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Taskbar icon size has been changed to LARGE." -ForegroundColor Yellow
Write-Host ""
Write-Host "If changes are not visible:" -ForegroundColor Yellow
Write-Host "1. Log out and log back in"
Write-Host "2. Restart your PC"
Write-Host "3. Check Settings > Personalization > Taskbar"
Write-Host ""
pause
