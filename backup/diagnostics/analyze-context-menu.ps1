# Context Menu Analyzer
Write-Host "=== Analyzing Windows Context Menu Performance ===" -ForegroundColor Green

# 1. Check recent Application Hang events
Write-Host "`n[1] Checking Application Hang Events..." -ForegroundColor Yellow
try {
    $hangEvents = Get-WinEvent -FilterHashtable @{
        LogName='Application'
        ProviderName='Application Hang'
        StartTime=(Get-Date).AddDays(-7)
    } -ErrorAction SilentlyContinue | Where-Object { $_.Message -like '*explorer*' }

    if ($hangEvents) {
        Write-Host "Found $($hangEvents.Count) explorer hang events:" -ForegroundColor Red
        $hangEvents | Select-Object -First 5 TimeCreated, Message | Format-List
    } else {
        Write-Host "No explorer hang events found in last 7 days" -ForegroundColor Green
    }
} catch {
    Write-Host "No hang events found" -ForegroundColor Gray
}

# 2. List all Context Menu Handlers
Write-Host "`n[2] Background Context Menu Handlers:" -ForegroundColor Yellow
Get-ItemProperty 'HKLM:\SOFTWARE\Classes\Directory\Background\shellex\ContextMenuHandlers\*' -ErrorAction SilentlyContinue |
    Select-Object PSChildName, '(default)' | Format-Table -AutoSize

# 3. List all file context menu handlers
Write-Host "`n[3] All File Context Menu Handlers:" -ForegroundColor Yellow
Get-ItemProperty 'HKLM:\SOFTWARE\Classes\AllFilesystemObjects\shellex\ContextMenuHandlers\*' -ErrorAction SilentlyContinue |
    Select-Object PSChildName, '(default)' | Format-Table -AutoSize

# 4. Check Shell Extensions with known slow CLSIDs
Write-Host "`n[4] Checking for Known Slow Shell Extensions:" -ForegroundColor Yellow
$knownSlow = @{
    '{EE15C2BD-CECB-49F8-A113-CA1BFC528F5B}' = 'Google Drive File Stream (DriveFS)'
    '{3D1975AF-48C6-4f8e-A182-BE0E08FA86A9}' = 'NVIDIA Desktop Context Menu'
    '{596AB062-B4D2-4215-9F74-E9109B0A8153}' = 'Dropbox'
    '{FB314ED9-A251-47B7-93E1-CDD82E34AF8B}' = 'Dropbox'
    '{FB314EDA-A251-47B7-93E1-CDD82E34AF8B}' = 'Dropbox'
}

foreach ($clsid in $knownSlow.Keys) {
    $found = Get-ChildItem -Path 'HKLM:\SOFTWARE\Classes\*\shellex\ContextMenuHandlers' -Recurse -ErrorAction SilentlyContinue |
        ForEach-Object { Get-ItemProperty -Path "Registry::$($_.Name)" -ErrorAction SilentlyContinue } |
        Where-Object { $_.'(default)' -eq $clsid }

    if ($found) {
        Write-Host "  FOUND: $($knownSlow[$clsid]) - $clsid" -ForegroundColor Red
    }
}

# 5. Check explorer.exe processes
Write-Host "`n[5] Explorer.exe Process Status:" -ForegroundColor Yellow
Get-Process explorer | Select-Object Id, CPU, @{N='Memory(MB)';E={[math]::Round($_.WorkingSet/1MB,2)}}, Threads, HandleCount | Format-Table -AutoSize

# 6. Check for Windows Error Reporting crashes
Write-Host "`n[6] Recent Explorer Crashes (Windows Error Reporting):" -ForegroundColor Yellow
try {
    $crashes = Get-WinEvent -FilterHashtable @{
        LogName='Application'
        ProviderName='Windows Error Reporting'
        StartTime=(Get-Date).AddDays(-7)
    } -ErrorAction SilentlyContinue | Where-Object { $_.Message -like '*explorer*' }

    if ($crashes) {
        Write-Host "Found $($crashes.Count) explorer crash events:" -ForegroundColor Red
        $crashes | Select-Object -First 3 TimeCreated, Message | Format-List
    } else {
        Write-Host "No explorer crash events found in last 7 days" -ForegroundColor Green
    }
} catch {
    Write-Host "No crash events found" -ForegroundColor Gray
}

Write-Host "`n=== Analysis Complete ===" -ForegroundColor Green
