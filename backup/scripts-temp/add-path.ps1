$binPath = "C:\Users\oldmoon\bin"
$currentPath = [Environment]::GetEnvironmentVariable("Path", "User")

if ($currentPath -notlike "*$binPath*") {
    [Environment]::SetEnvironmentVariable("Path", "$currentPath;$binPath", "User")
    Write-Host "Added to PATH: $binPath"
} else {
    Write-Host "Already in PATH: $binPath"
}
