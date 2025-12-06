const mysql = require('mysql2/promise');

async function run() {
  const conn = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'trend2024',
    database: 'trend_video'
  });

  const title = '영상 제작 실패 - task 1181b4a0-6c6a-47d6-8b2c-f0383baf8f27';
  const summary = `## 증상
- 태스크 ID: 1181b4a0-6c6a-47d6-8b2c-f0383baf8f27
- 경로: C:/Users/oldmoon/workspace/trend-video-backend/tasks/1181b4a0-6c6a-47d6-8b2c-f0383baf8f27
- 영상 제작이 진행되지 않음

## 확인 필요
- story.json 존재 여부
- 이미지 생성 상태
- video.mp4 생성 여부
- 에러 로그 확인`;

  await conn.execute(
    'INSERT INTO bugs (title, summary, status, priority, type, metadata, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())',
    [title, summary, 'open', 'P1', 'bug', '{}']
  );

  const [result] = await conn.execute('SELECT LAST_INSERT_ID() as id');
  console.log('버그 등록 완료: BTS-' + result[0].id);
  await conn.end();
}

run().catch(console.error);
