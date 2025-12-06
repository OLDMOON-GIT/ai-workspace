import mysql from 'mysql2/promise';

const connection = await mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: 'trend2024',
  database: 'trend_video',
  charset: 'utf8mb4'
});

const bugId = `BUG-${Date.now()}`;

await connection.execute(`
  INSERT INTO bugs (
    id,
    title,
    summary,
    status,
    metadata,
    created_at,
    updated_at
  ) VALUES (?, ?, ?, ?, ?, NOW(), NOW())
`, [
  bugId,
  '롱폼 완료 시 숏폼 자동생성이 실행되지 않음',
  `근본 원인:
- youtube/upload/route.ts Line 677-680: task 테이블에서 auto_create_shortform 조회
- 하지만 auto_create_shortform은 content_setting 테이블에 있음!
- task 테이블에는 auto_create_shortform 컬럼이 없어서 항상 null/undefined
- 결과: Line 693 조건문이 false가 되어 숏폼 변환 API 호출 안됨

잘못된 쿼리:
SELECT prompt_format, auto_create_shortform, title, category, channel, user_id
FROM task WHERE task_id = ?

올바른 쿼리:
SELECT c.prompt_format, cs.auto_create_shortform, c.title, c.category, c.youtube_channel as channel, c.user_id
FROM content c
LEFT JOIN content_setting cs ON c.content_id = cs.content_id
WHERE c.content_id = ?

영향:
- 롱폼 영상 업로드 완료해도 숏폼 자동생성 안됨
- auto_create_shortform=1로 설정해도 무시됨

테스트 케이스:
- content_id: eb5d80b0-d411-4d08-80fb-ccbbb2736e88
- auto_create_shortform: 1
- YouTube 업로드 완료: https://youtu.be/t2LgXBwrUlQ
- 결과: 숏폼 생성 안됨 (source_content_id로 조회해도 없음)`,
  'open',
  JSON.stringify({
    affected_files: ['trend-video-frontend/src/app/api/youtube/upload/route.ts'],
    affected_lines: [677, 678, 679, 680, 693],
    type: 'wrong_table_query',
    severity: 'critical',
    test_case: 'eb5d80b0-d411-4d08-80fb-ccbbb2736e88'
  })
]);

console.log(`✅ Bug registered: ${bugId}`);

await connection.end();
