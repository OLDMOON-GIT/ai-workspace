# Shell Extension Analyzer
Write-Host "Context Menu Handler Analysis" -ForegroundColor Cyan
Write-Host "==============================" -ForegroundColor Cyan
Write-Host ""

# Collect context menu handlers
$handlers = @()

$paths = @(
    "Registry::HKEY_CLASSES_ROOT\*\shellex\ContextMenuHandlers",
    "Registry::HKEY_CLASSES_ROOT\Directory\shellex\ContextMenuHandlers"
)

foreach ($path in $paths) {
    if (Test-Path $path) {
        Get-ChildItem $path -ErrorAction SilentlyContinue | ForEach-Object {
            $name = $_.PSChildName
            $clsid = (Get-ItemProperty $_.PSPath).'(default)'

            if ($clsid -match '\{.*\}') {
                $dllPath = ""
                $inprocPath = "Registry::HKEY_CLASSES_ROOT\CLSID\$clsid\InprocServer32"

                if (Test-Path $inprocPath) {
                    $dllPath = (Get-ItemProperty $inprocPath -ErrorAction SilentlyContinue).'(default)'
                }

                $handlers += [PSCustomObject]@{
                    Name = $name
                    CLSID = $clsid
                    DLL = $dllPath
                }
            }
        }
    }
}

Write-Host "Total handlers found: $($handlers.Count)" -ForegroundColor Green
Write-Host ""

# Find suspicious ones
$suspicious = $handlers | Where-Object {
    $_.DLL -match '(OneDrive|Dropbox|Google|Cloud|Tortoise|Git|WinRAR|7-Zip)'
}

if ($suspicious) {
    Write-Host "Suspicious handlers (may slow down context menu):" -ForegroundColor Yellow
    Write-Host ""
    $suspicious | Format-Table Name, DLL -AutoSize
} else {
    Write-Host "No suspicious handlers found." -ForegroundColor Green
}

Write-Host ""
Write-Host "Related running processes:" -ForegroundColor Yellow
Get-Process | Where-Object {
    $_.ProcessName -match '(OneDrive|Dropbox|Google|Cloud|Sync)'
} | Format-Table ProcessName, CPU, WorkingSet -AutoSize

Write-Host ""
Write-Host "Recommendation:" -ForegroundColor Cyan
Write-Host "- Run fix-context-menu.bat to disable common slow handlers" -ForegroundColor White
Write-Host "- Use ShellExView tool: https://www.nirsoft.net/utils/shexview.html" -ForegroundColor White
Write-Host ""

# Save to file
$handlers | Export-Csv -Path "context-handlers.csv" -NoTypeInformation -Encoding UTF8
Write-Host "Full report saved to: context-handlers.csv" -ForegroundColor Green

pause
