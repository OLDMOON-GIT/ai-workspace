param([string]$TimestampFile)

if (Test-Path $TimestampFile) {
    $diff = (Get-Date) - (Get-Item $TimestampFile).LastWriteTime
    if ($diff.TotalMinutes -lt 60) {
        Write-Output "SKIP"
        exit 0
    }
}
Write-Output "RUN"
