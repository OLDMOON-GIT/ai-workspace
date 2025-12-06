const mysql = require('mysql2/promise');

async function main() {
  const conn = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'trend2024',
    database: 'trend_video'
  });

  // 다음 버그 번호 생성
  await conn.execute(`UPDATE bug_sequence SET next_number = next_number + 1 WHERE id = 1`);
  const [rows] = await conn.execute(`SELECT next_number FROM bug_sequence WHERE id = 1`);
  const nextNum = rows[0].next_number;
  const bugId = `BTS-${String(nextNum).padStart(7, '0')}`;

  // 버그 등록
  await conn.execute(`
    INSERT INTO bugs (id, title, summary, status, type, priority, metadata, created_at, updated_at)
    VALUES (
      ?,
      'script 작업이 task_lock을 설정하지 않는 버그',
      'script 타입 작업 실행 시 task_lock 테이블에 lock을 걸지 않아 동시에 여러 script 작업이 실행될 수 있음. image/video/youtube 작업은 정상적으로 lock을 설정하지만 script는 누락됨.',
      'open',
      'bug',
      'P0',
      '{"critical": true, "related": ["BTS-0001171"], "component": "task-worker"}',
      NOW(),
      NOW()
    )
  `, [bugId]);

  console.log(`${bugId} 등록 완료 (P0 Critical)`);
  await conn.end();
}

main().catch(console.error);
