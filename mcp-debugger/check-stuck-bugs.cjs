const mysql = require('mysql2/promise');
const { execSync } = require('child_process');

(async () => {
  const conn = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'trend2024',
    database: 'trend_video'
  });

  const [rows] = await conn.execute('SELECT id, worker_pid, assigned_to FROM bugs WHERE status = "in_progress"');
  console.log(`in_progress 버그: ${rows.length}개`);
  console.log('');

  const deadBugs = [];

  // 각 PID 확인
  for (const bug of rows) {
    try {
      const cmd = `powershell -NoProfile -Command "Get-Process -Id ${bug.worker_pid} -ErrorAction SilentlyContinue | Out-Null; if ($?) { Write-Output running } else { Write-Output dead }"`;
      const result = execSync(cmd, { encoding: 'utf8' }).trim();
      console.log(`BTS-${bug.id}: PID ${bug.worker_pid} (${bug.assigned_to || 'unknown'}) -> ${result}`);
      if (result === 'dead') {
        deadBugs.push(bug.id);
      }
    } catch (e) {
      console.log(`BTS-${bug.id}: PID ${bug.worker_pid} -> error: ${e.message}`);
      deadBugs.push(bug.id);
    }
  }

  console.log('');
  if (deadBugs.length > 0) {
    console.log(`복구 대상 버그 ${deadBugs.length}개: ${deadBugs.join(', ')}`);

    // 복구 실행
    const placeholders = deadBugs.map(() => '?').join(', ');
    await conn.execute(
      `UPDATE bugs SET status = 'open', assigned_to = NULL, worker_pid = NULL, updated_at = NOW() WHERE id IN (${placeholders})`,
      deadBugs
    );
    console.log('복구 완료!');
  } else {
    console.log('복구 대상 없음 (모든 워커 정상)');
  }

  await conn.end();
})();
