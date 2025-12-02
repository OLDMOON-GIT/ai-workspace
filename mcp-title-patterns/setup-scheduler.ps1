# MCP 패턴 일일 진화 작업 스케줄러 등록
# 관리자 권한 필요

$taskName = "MCP-Pattern-Daily-Evolve"
$taskPath = "C:\Users\oldmoon\workspace\mcp-title-patterns\daily-evolve.bat"

# 기존 작업 삭제 (있으면)
schtasks /delete /tn $taskName /f 2>$null

# 새 작업 생성 (매일 오전 2시)
schtasks /create /tn $taskName /tr $taskPath /sc daily /st 02:00 /f

Write-Host "작업 스케줄러 등록 완료: $taskName"
Write-Host "실행 시간: 매일 오전 2시"
Write-Host ""
Write-Host "확인하려면: schtasks /query /tn $taskName"
