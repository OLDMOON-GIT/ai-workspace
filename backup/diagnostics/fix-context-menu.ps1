# Fix Context Menu Performance Issues
# 관리자 권한 필요

Write-Host "=== Context Menu Performance Fix ===" -ForegroundColor Green
Write-Host "이 스크립트는 느린 컨텍스트 메뉴 확장을 비활성화합니다." -ForegroundColor Yellow
Write-Host ""

# 관리자 권한 체크
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "ERROR: 이 스크립트는 관리자 권한이 필요합니다!" -ForegroundColor Red
    Write-Host "PowerShell을 관리자 권한으로 실행한 후 다시 시도하세요." -ForegroundColor Yellow
    pause
    exit 1
}

# 백업 디렉토리 생성
$backupDir = "C:\Users\oldmoon\workspace\context-menu-backup"
if (-not (Test-Path $backupDir)) {
    New-Item -ItemType Directory -Path $backupDir | Out-Null
}

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupFile = "$backupDir\backup-$timestamp.reg"

Write-Host "[1] 레지스트리 백업 생성 중..." -ForegroundColor Cyan
# DriveFS 백업
reg export "HKEY_LOCAL_MACHINE\SOFTWARE\Classes\Directory\Background\shellex\ContextMenuHandlers\DriveFS 28 or later" $backupFile /y 2>$null
# NVIDIA 백업
reg export "HKEY_LOCAL_MACHINE\SOFTWARE\Classes\Directory\Background\shellex\ContextMenuHandlers\NvCplDesktopContext" "$backupFile.nvidia.reg" /y 2>$null
Write-Host "백업 완료: $backupFile" -ForegroundColor Green

Write-Host ""
Write-Host "[2] 문제 확장 비활성화:" -ForegroundColor Cyan

# DriveFS (Google Drive) 비활성화
$driveFsPath = "HKLM:\SOFTWARE\Classes\Directory\Background\shellex\ContextMenuHandlers\DriveFS 28 or later"
if (Test-Path $driveFsPath) {
    Write-Host "  - Google Drive (DriveFS) 컨텍스트 메뉴 비활성화..." -ForegroundColor Yellow
    try {
        Rename-Item -Path $driveFsPath -NewName "DriveFS 28 or later.disabled" -ErrorAction Stop
        Write-Host "    ✓ 비활성화 완료" -ForegroundColor Green
    } catch {
        Write-Host "    ✗ 실패: $($_.Exception.Message)" -ForegroundColor Red
    }
} else {
    Write-Host "  - Google Drive 확장을 찾을 수 없음 (이미 비활성화됨)" -ForegroundColor Gray
}

# NVIDIA 컨텍스트 메뉴 비활성화
$nvPath = "HKLM:\SOFTWARE\Classes\Directory\Background\shellex\ContextMenuHandlers\NvCplDesktopContext"
if (Test-Path $nvPath) {
    Write-Host "  - NVIDIA 데스크탑 컨텍스트 메뉴 비활성화..." -ForegroundColor Yellow
    try {
        Rename-Item -Path $nvPath -NewName "NvCplDesktopContext.disabled" -ErrorAction Stop
        Write-Host "    ✓ 비활성화 완료" -ForegroundColor Green
    } catch {
        Write-Host "    ✗ 실패: $($_.Exception.Message)" -ForegroundColor Red
    }
} else {
    Write-Host "  - NVIDIA 확장을 찾을 수 없음 (이미 비활성화됨)" -ForegroundColor Gray
}

Write-Host ""
Write-Host "[3] Explorer.exe 재시작 중..." -ForegroundColor Cyan
Stop-Process -Name explorer -Force
Start-Sleep -Seconds 2
Write-Host "Explorer 재시작 완료" -ForegroundColor Green

Write-Host ""
Write-Host "=== 완료 ===" -ForegroundColor Green
Write-Host ""
Write-Host "이제 파일 탐색기에서 오른쪽 클릭을 테스트해보세요." -ForegroundColor Yellow
Write-Host ""
Write-Host "복원하려면:" -ForegroundColor Cyan
Write-Host "  1. 레지스트리 편집기(regedit) 실행" -ForegroundColor Gray
Write-Host "  2. 파일 > 가져오기 > $backupFile 선택" -ForegroundColor Gray
Write-Host ""
pause
