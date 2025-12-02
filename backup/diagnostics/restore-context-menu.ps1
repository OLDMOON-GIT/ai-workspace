# Restore Context Menu Extensions
# 관리자 권한 필요

Write-Host "=== Context Menu Extensions 복원 ===" -ForegroundColor Green
Write-Host ""

# 관리자 권한 체크
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "ERROR: 이 스크립트는 관리자 권한이 필요합니다!" -ForegroundColor Red
    Write-Host "PowerShell을 관리자 권한으로 실행한 후 다시 시도하세요." -ForegroundColor Yellow
    pause
    exit 1
}

Write-Host "[1] 비활성화된 확장 복원:" -ForegroundColor Cyan

# DriveFS (Google Drive) 복원
$driveFsPathDisabled = "HKLM:\SOFTWARE\Classes\Directory\Background\shellex\ContextMenuHandlers\DriveFS 28 or later.disabled"
if (Test-Path $driveFsPathDisabled) {
    Write-Host "  - Google Drive (DriveFS) 컨텍스트 메뉴 복원..." -ForegroundColor Yellow
    try {
        Rename-Item -Path $driveFsPathDisabled -NewName "DriveFS 28 or later" -ErrorAction Stop
        Write-Host "    ✓ 복원 완료" -ForegroundColor Green
    } catch {
        Write-Host "    ✗ 실패: $($_.Exception.Message)" -ForegroundColor Red
    }
} else {
    Write-Host "  - Google Drive 비활성화 항목 없음" -ForegroundColor Gray
}

# NVIDIA 컨텍스트 메뉴 복원
$nvPathDisabled = "HKLM:\SOFTWARE\Classes\Directory\Background\shellex\ContextMenuHandlers\NvCplDesktopContext.disabled"
if (Test-Path $nvPathDisabled) {
    Write-Host "  - NVIDIA 데스크탑 컨텍스트 메뉴 복원..." -ForegroundColor Yellow
    try {
        Rename-Item -Path $nvPathDisabled -NewName "NvCplDesktopContext" -ErrorAction Stop
        Write-Host "    ✓ 복원 완료" -ForegroundColor Green
    } catch {
        Write-Host "    ✗ 실패: $($_.Exception.Message)" -ForegroundColor Red
    }
} else {
    Write-Host "  - NVIDIA 비활성화 항목 없음" -ForegroundColor Gray
}

Write-Host ""
Write-Host "[2] Explorer.exe 재시작 중..." -ForegroundColor Cyan
Stop-Process -Name explorer -Force
Start-Sleep -Seconds 2
Write-Host "Explorer 재시작 완료" -ForegroundColor Green

Write-Host ""
Write-Host "=== 복원 완료 ===" -ForegroundColor Green
Write-Host ""
pause
