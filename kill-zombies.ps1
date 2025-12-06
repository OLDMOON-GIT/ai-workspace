# Zombie Node process cleanup (memory < 1MB = zombie)
# Large processes (AI agents, Next.js, etc.) are preserved

$zombies = Get-Process node -ErrorAction SilentlyContinue | Where-Object { $_.WorkingSet -lt 1MB }

Write-Host "=== Zombie Node Processes (memory < 1MB) ===" -ForegroundColor Yellow
Write-Host "Found: $($zombies.Count)" -ForegroundColor Cyan

if ($zombies.Count -gt 0) {
    $zombies | ForEach-Object {
        Write-Host "  Killing: PID $($_.Id) - Memory: $([math]::Round($_.WorkingSet/1KB))KB"
        Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
    }
    Write-Host "`n$($zombies.Count) zombie processes killed!" -ForegroundColor Green
} else {
    Write-Host "No zombie processes to clean up" -ForegroundColor Green
}

# Check remaining processes
$remaining = Get-Process node -ErrorAction SilentlyContinue
Write-Host "`n=== Remaining Node Processes ===" -ForegroundColor Yellow
Write-Host "Total: $($remaining.Count)" -ForegroundColor Cyan
