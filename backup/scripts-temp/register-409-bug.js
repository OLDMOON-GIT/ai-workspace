const mysql = require('mysql2/promise');

(async () => {
  const conn = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'trend2024',
    database: 'trend_video'
  });

  // 다음 ID 확인
  const [rows] = await conn.query('SELECT MAX(id) as maxId FROM bugs');
  const nextId = (rows[0].maxId || 0) + 1;

  await conn.query(`
    INSERT INTO bugs (id, title, summary, status, type, priority, metadata, created_at, updated_at)
    VALUES (?, ?, ?, 'open', 'bug', 'P1', '{}', NOW(), NOW())
  `, [
    nextId,
    '자동 대본 생성 409 에러 무한 반복',
    '자동화 스케줄러에서 대본 생성 API 호출 시 409 에러(다른 대본이 생성 중입니다)가 계속 반복됨. taskId: 3b47a71f-699b-4f19-9e1f-2288c636c1f1. 이미 생성 중인 task가 있을 때 새로운 대본 생성 요청 시 409를 받지만 재시도 로직이 무한 반복. 대기 후 재시도하거나 스킵하는 로직 필요.'
  ]);

  console.log('버그 등록 완료: BTS-' + nextId);
  await conn.end();
})();
