# Fix Context Menu - NVIDIA Only (Fast Version)
# Must run as Administrator

Write-Host "=== Disable NVIDIA Context Menu ===" -ForegroundColor Green
Write-Host ""

# Check admin rights
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "ERROR: Administrator privileges required!" -ForegroundColor Red
    pause
    exit 1
}

Write-Host "[1/2] Disabling NVIDIA Desktop Context Menu..." -ForegroundColor Cyan
$nvPath = "HKLM:\SOFTWARE\Classes\Directory\Background\shellex\ContextMenuHandlers\NvCplDesktopContext"

if (Test-Path $nvPath) {
    try {
        Remove-Item -Path $nvPath -Force -ErrorAction Stop
        Write-Host "  SUCCESS - NVIDIA context menu disabled" -ForegroundColor Green
    } catch {
        Write-Host "  ERROR: $($_.Exception.Message)" -ForegroundColor Red
    }
} else {
    Write-Host "  SKIP - NVIDIA context menu not found (already disabled)" -ForegroundColor Gray
}

Write-Host ""
Write-Host "[2/2] Restarting Explorer..." -ForegroundColor Cyan
Stop-Process -Name explorer -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2
Start-Process explorer.exe
Start-Sleep -Seconds 2
Write-Host "  SUCCESS - Explorer restarted" -ForegroundColor Green

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  Complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "NVIDIA context menu has been disabled." -ForegroundColor Yellow
Write-Host "Try right-clicking to test performance." -ForegroundColor Yellow
Write-Host ""
pause
