# 셸 확장 분석 스크립트
# 컨텍스트 메뉴를 느리게 만드는 원인 찾기

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "   셸 확장 프로그램 상세 분석" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 레지스트리 경로들
$registryPaths = @(
    "Registry::HKEY_CLASSES_ROOT\*\shellex\ContextMenuHandlers",
    "Registry::HKEY_CLASSES_ROOT\AllFilesystemObjects\shellex\ContextMenuHandlers",
    "Registry::HKEY_CLASSES_ROOT\Directory\shellex\ContextMenuHandlers",
    "Registry::HKEY_CLASSES_ROOT\Directory\Background\shellex\ContextMenuHandlers",
    "Registry::HKEY_CLASSES_ROOT\Folder\shellex\ContextMenuHandlers"
)

$shellExtensions = @()

Write-Host "[1] 등록된 컨텍스트 메뉴 핸들러 수집 중..." -ForegroundColor Yellow

foreach ($path in $registryPaths) {
    if (Test-Path $path) {
        $handlers = Get-ChildItem -Path $path -ErrorAction SilentlyContinue

        foreach ($handler in $handlers) {
            $handlerName = $handler.PSChildName
            $clsid = (Get-ItemProperty -Path $handler.PSPath -ErrorAction SilentlyContinue).'(default)'

            if ($clsid -and $clsid -match '\{.*\}') {
                # CLSID로 DLL 경로 찾기
                $clsidPath = "Registry::HKEY_CLASSES_ROOT\CLSID\$clsid\InprocServer32"
                $dllPath = ""

                if (Test-Path $clsidPath) {
                    $dllPath = (Get-ItemProperty -Path $clsidPath -ErrorAction SilentlyContinue).'(default)'
                }

                $shellExtensions += [PSCustomObject]@{
                    Name = $handlerName
                    CLSID = $clsid
                    DLL = $dllPath
                    Location = $path
                }
            }
        }
    }
}

Write-Host "   찾은 핸들러: $($shellExtensions.Count)개" -ForegroundColor Green
Write-Host ""

# 의심되는 느린 확장 프로그램 찾기
Write-Host "[2] 의심되는 느린 확장 프로그램 분석..." -ForegroundColor Yellow
Write-Host ""

$suspiciousKeywords = @(
    "OneDrive", "Dropbox", "Google", "Drive", "Cloud", "Sync",
    "Tortoise", "Git", "SVN", "Antivirus", "Defender",
    "WinRAR", "7-Zip", "WinZip", "Archive"
)

$suspiciousExtensions = $shellExtensions | Where-Object {
    $ext = $_
    $suspiciousKeywords | Where-Object { $ext.DLL -like "*$_*" -or $ext.Name -like "*$_*" }
}

if ($suspiciousExtensions.Count -gt 0) {
    Write-Host "⚠️  의심되는 확장 프로그램 ($($suspiciousExtensions.Count)개):" -ForegroundColor Red
    Write-Host ""

    foreach ($ext in $suspiciousExtensions) {
        Write-Host "  📦 $($ext.Name)" -ForegroundColor Yellow
        Write-Host "     CLSID: $($ext.CLSID)" -ForegroundColor Gray
        Write-Host "     DLL: $($ext.DLL)" -ForegroundColor Gray
        Write-Host ""
    }
} else {
    Write-Host "✓ 의심되는 확장 프로그램이 발견되지 않았습니다." -ForegroundColor Green
    Write-Host ""
}

# DLL 파일 크기 및 서명 확인
Write-Host "[3] DLL 파일 분석 (크기/서명)..." -ForegroundColor Yellow
Write-Host ""

$dllAnalysis = @()

foreach ($ext in $suspiciousExtensions) {
    $dllPath = [System.Environment]::ExpandEnvironmentVariables($ext.DLL)

    if (Test-Path $dllPath) {
        $file = Get-Item $dllPath
        $signature = Get-AuthenticodeSignature $dllPath -ErrorAction SilentlyContinue

        $dllAnalysis += [PSCustomObject]@{
            Name = $ext.Name
            Path = $dllPath
            Size = "{0:N2} MB" -f ($file.Length / 1MB)
            Signed = $signature.Status -eq 'Valid'
            Signer = $signature.SignerCertificate.Subject
        }
    }
}

$dllAnalysis | Format-Table -AutoSize

# 실행 중인 관련 프로세스
Write-Host "[4] 실행 중인 관련 프로세스..." -ForegroundColor Yellow
Write-Host ""

$relatedProcesses = Get-Process | Where-Object {
    $_.ProcessName -match 'OneDrive|Dropbox|Google|Cloud|Sync|Tortoise'
} | Select-Object ProcessName, CPU, WorkingSet, Company

if ($relatedProcesses.Count -gt 0) {
    $relatedProcesses | Format-Table -AutoSize
} else {
    Write-Host "✓ 관련 프로세스가 실행 중이지 않습니다." -ForegroundColor Green
    Write-Host ""
}

# 추천 해결 방법
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "   추천 해결 방법" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "1. 자동 수정 스크립트 실행:" -ForegroundColor Yellow
Write-Host "   fix-context-menu.bat" -ForegroundColor White
Write-Host ""

Write-Host "2. ShellExView 도구 사용:" -ForegroundColor Yellow
Write-Host "   https://www.nirsoft.net/utils/shexview.html" -ForegroundColor White
Write-Host "   - 다운로드 후 실행" -ForegroundColor Gray
Write-Host "   - 핑크색 항목들이 비-MS 확장" -ForegroundColor Gray
Write-Host "   - 느린 확장을 찾아 비활성화" -ForegroundColor Gray
Write-Host ""

Write-Host "3. 수동 비활성화 (레지스트리):" -ForegroundColor Yellow
Write-Host "   의심되는 CLSID를 아래 경로에서 삭제/이름변경" -ForegroundColor Gray
Write-Host "   - HKCR\*\shellex\ContextMenuHandlers" -ForegroundColor Gray
Write-Host "   - HKCR\AllFilesystemObjects\shellex\ContextMenuHandlers" -ForegroundColor Gray
Write-Host ""

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "분석 완료!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 결과를 파일로 저장
$reportFile = "shell-extension-analysis.txt"
$shellExtensions | Out-File -FilePath $reportFile -Encoding UTF8
Write-Host "📝 상세 리포트가 저장되었습니다: $reportFile" -ForegroundColor Cyan
Write-Host ""

pause
