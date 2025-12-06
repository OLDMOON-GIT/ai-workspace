const mysql = require('mysql2/promise');

async function run() {
  const conn = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'trend2024',
    database: 'trend_video'
  });

  const title = 'spawning-pool 활성 워커 체크 실패로 무한 스폰 발생';
  const summary = `## 증상
- 스폰 완료 후에도 "활성 워커: 0/4"로 표시됨
- 활성 워커 체크가 안 되어 계속 새로운 워커를 스폰함
- 무한 스폰 -> 리소스 고갈 위험

## 원인 추정
- spawning-pool의 활성 워커 카운팅 로직 오류
- 또는 워커 프로세스 감지 실패

## 재현
1. notification-worker.cjs 실행
2. 버그 할당으로 워커 스폰
3. 스폰 완료 후에도 활성 워커가 0으로 유지됨
4. 동일 버그에 대해 계속 스폰 시도

## 우선순위
P0 - 크리티컬 (무한 루프/리소스 고갈)`;

  // id는 auto_increment이므로 생략, priority는 'P0' 문자열로
  await conn.execute(
    'INSERT INTO bugs (title, summary, status, priority, type, metadata, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())',
    [title, summary, 'open', 'P0', 'bug', '{}']
  );

  const [result] = await conn.execute('SELECT LAST_INSERT_ID() as id');
  console.log('버그 등록 완료: BTS-' + result[0].id);
  await conn.end();
}

run().catch(console.error);
