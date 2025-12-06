const mysql = require('mysql2/promise');

async function main() {
  const conn = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'trend2024',
    database: 'trend_video'
  });

  // task_lock 현재 상태
  const [locks] = await conn.execute('SELECT * FROM task_lock');
  console.log('=== task_lock 현재 상태 ===');
  locks.forEach(l => {
    console.log(JSON.stringify(l));
  });

  // 해당 task 상태 확인
  const [task] = await conn.execute("SELECT task_id, type, status, created_at FROM task_queue WHERE task_id = 'c630bdf5-12f6-4947-95e8-cabbe9c12010'");
  console.log('\n=== 해당 task 상태 ===');
  console.log(task[0] || 'task not found');

  // BTS-0001171 등록
  await conn.execute(`
    INSERT INTO bugs (id, title, summary, status, type, metadata, created_at, updated_at)
    VALUES (
      'BTS-0001171',
      'task_lock이 해제되지 않는 크리티컬 버그',
      'task_lock 테이블에 c630bdf5-12f6-4947-95e8-cabbe9c12010이 계속 남아있음. 작업 완료/실패 후에도 lock이 해제되지 않음',
      'open',
      'bug',
      '{"priority": "P0", "critical": true, "related": ["BTS-0001168", "BTS-0001169"], "task_id": "c630bdf5-12f6-4947-95e8-cabbe9c12010"}',
      NOW(),
      NOW()
    )
  `);

  console.log('\nBTS-0001171 등록 완료 (크리티컬)');
  await conn.end();
}

main().catch(console.error);
