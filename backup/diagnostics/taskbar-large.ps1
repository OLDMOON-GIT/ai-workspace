# Set Taskbar Icons to Large Size

Write-Host "========================================" -ForegroundColor Green
Write-Host "  Set Taskbar Icons to Large" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""

# Get Windows build number
$build = (Get-ItemProperty -Path "HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion" -Name CurrentBuild).CurrentBuild
Write-Host "Windows Build: $build" -ForegroundColor Cyan
Write-Host ""

try {
    if ([int]$build -ge 22000) {
        # Windows 11: 0=small, 1=medium, 2=large
        Write-Host "[Windows 11 Detected] Setting TaskbarSi to 2..." -ForegroundColor Yellow
        Set-ItemProperty -Path "HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\Advanced" -Name "TaskbarSi" -Value 2 -Type DWord -Force
    } else {
        # Windows 10: 0=large, 1=small
        Write-Host "[Windows 10 Detected] Setting TaskbarSmallIcons to 0..." -ForegroundColor Yellow
        Set-ItemProperty -Path "HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\Advanced" -Name "TaskbarSmallIcons" -Value 0 -Type DWord -Force
    }

    Write-Host ""
    Write-Host "[Complete] Taskbar icon size set to 'Large'" -ForegroundColor Green
    Write-Host ""
    Write-Host "Restarting Explorer..." -ForegroundColor Cyan
    Write-Host ""

    # Restart Explorer
    Stop-Process -Name explorer -Force
    Start-Sleep -Seconds 2
    Start-Process explorer.exe

    Write-Host ""
    Write-Host "[Complete] Taskbar restarted with new settings" -ForegroundColor Green
    Write-Host "If changes don't apply immediately, log out and log back in." -ForegroundColor Yellow
    Write-Host ""

} catch {
    Write-Host "[ERROR] Failed to change registry: $($_.Exception.Message)" -ForegroundColor Red
}

pause
