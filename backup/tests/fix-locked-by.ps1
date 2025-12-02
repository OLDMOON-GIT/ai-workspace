# locked_by를 제거하고 worker_pid/lock_task_id로 변경하는 스크립트

$files = @(
    "trend-video-frontend\src\app\api\automation\cleanup\route.ts",
    "trend-video-frontend\src\app\api\automation\retry\route.ts",
    "trend-video-frontend\src\app\api\automation\titles\route.ts",
    "trend-video-frontend\src\app\api\automation\stop\route.ts",
    "trend-video-frontend\src\lib\automation.ts",
    "trend-video-frontend\src\lib\automation-scheduler.ts"
)

foreach ($file in $files) {
    $fullPath = Join-Path $PSScriptRoot $file
    if (Test-Path $fullPath) {
        Write-Host "Processing: $file"

        $content = Get-Content $fullPath -Raw -Encoding UTF8

        # locked_by = task_id → lock_task_id = task_id
        $content = $content -replace 'locked_by = \?', 'lock_task_id = ?'
        $content = $content -replace 'locked_by = ''', 'lock_task_id = '''
        $content = $content -replace 'locked_by = NULL', 'lock_task_id = NULL'

        # WHERE locked_by = ? → WHERE lock_task_id = ?
        $content = $content -replace 'WHERE locked_by = \?', 'WHERE lock_task_id = ?'
        $content = $content -replace 'WHERE locked_by IS NOT NULL', 'WHERE worker_pid IS NOT NULL'

        # SET locked_by = NULL → SET lock_task_id = NULL
        $content = $content -replace 'SET locked_by = NULL', 'SET lock_task_id = NULL'

        # SELECT locked_by → SELECT worker_pid
        $content = $content -replace 'SELECT locked_by,', 'SELECT worker_pid,'
        $content = $content -replace 'locked_by: string', 'worker_pid: number'
        $content = $content -replace 'lock\.locked_by', 'lock.worker_pid'

        # INSERT INTO task_lock (..., locked_by, ...) → (..., lock_task_id, ...)
        $content = $content -replace '\(task_type, locked_by, locked_at, worker_pid\)', '(task_type, lock_task_id, locked_at, worker_pid)'
        $content = $content -replace 'INSERT INTO task_lock \(task_type, locked_by,', 'INSERT INTO task_lock (task_type, lock_task_id,'
        $content = $content -replace 'locked_by = VALUES\(locked_by\)', 'lock_task_id = VALUES(lock_task_id)'

        # Comments
        $content = $content -replace 'locked_by = task_id', 'lock_task_id = task_id'
        $content = $content -replace 'locked_by → NULL', 'lock_task_id → NULL'

        Set-Content $fullPath $content -Encoding UTF8 -NoNewline
        Write-Host "  ✅ Updated"
    } else {
        Write-Host "  ⚠️ File not found: $fullPath"
    }
}

Write-Host "`n✅ All files processed!"
