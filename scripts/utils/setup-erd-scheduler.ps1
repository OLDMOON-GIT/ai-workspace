# ERD 자동 업데이트 스케줄러 등록 스크립트
# 관리자 권한으로 실행 필요

Write-Host "📊 ERD 자동 업데이트 스케줄러 설정 중..." -ForegroundColor Cyan

# 스케줄러 작업 이름
$taskName = "ERD Auto Update Daily"
$taskPath = "\TrendVideo\"

# 배치 파일 경로
$batFile = "C:\Users\oldmoon\workspace\scripts\utils\update-erd-daily.bat"

# 기존 작업 삭제 (있으면)
$existingTask = Get-ScheduledTask -TaskName $taskName -TaskPath $taskPath -ErrorAction SilentlyContinue
if ($existingTask) {
    Write-Host "기존 작업 삭제 중..." -ForegroundColor Yellow
    Unregister-ScheduledTask -TaskName $taskName -TaskPath $taskPath -Confirm:$false
}

# 작업 실행 액션
$action = New-ScheduledTaskAction -Execute $batFile

# 트리거: 매일 새벽 6시
$trigger = New-ScheduledTaskTrigger -Daily -At "06:00"

# 설정
$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -RunOnlyIfNetworkAvailable:$false `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 30)

# Principal: 사용자 로그인 여부 무관하게 실행
$principal = New-ScheduledTaskPrincipal `
    -UserId "$env:USERDOMAIN\$env:USERNAME" `
    -LogonType S4U `
    -RunLevel Limited

# 스케줄러 작업 등록
try {
    Register-ScheduledTask `
        -TaskName $taskName `
        -TaskPath $taskPath `
        -Action $action `
        -Trigger $trigger `
        -Settings $settings `
        -Principal $principal `
        -Description "매일 새벽 6시 데이터베이스 ERD 문서 자동 업데이트" `
        -ErrorAction Stop

    Write-Host "✅ 스케줄러 등록 완료!" -ForegroundColor Green
    Write-Host ""
    Write-Host "📋 작업 정보:" -ForegroundColor Cyan
    Write-Host "  - 작업명: $taskName"
    Write-Host "  - 실행 시간: 매일 새벽 6:00"
    Write-Host "  - 스크립트: $batFile"
    Write-Host ""
    Write-Host "🔍 확인 방법:" -ForegroundColor Yellow
    Write-Host "  1. 작업 스케줄러 열기 (taskschd.msc)"
    Write-Host "  2. 작업 스케줄러 라이브러리 > TrendVideo 폴더"
    Write-Host "  3. '$taskName' 작업 확인"
    Write-Host ""
    Write-Host "▶️ 수동 실행 테스트:" -ForegroundColor Yellow
    Write-Host "  Start-ScheduledTask -TaskName '$taskName' -TaskPath '$taskPath'"
    Write-Host ""

    # 즉시 테스트 실행 제안
    $test = Read-Host "지금 바로 테스트 실행하시겠습니까? (Y/N)"
    if ($test -eq "Y" -or $test -eq "y") {
        Write-Host "테스트 실행 중..." -ForegroundColor Cyan
        Start-ScheduledTask -TaskName $taskName -TaskPath $taskPath
        Start-Sleep -Seconds 3
        Write-Host "✅ 테스트 실행 완료. 로그 확인: C:\Users\oldmoon\workspace\logs\erd-update.log" -ForegroundColor Green
    }

} catch {
    Write-Host "❌ 스케줄러 등록 실패: $_" -ForegroundColor Red
    Write-Host ""
    Write-Host "💡 관리자 권한으로 실행했는지 확인하세요:" -ForegroundColor Yellow
    Write-Host "  우클릭 > '관리자 권한으로 실행'"
    exit 1
}
