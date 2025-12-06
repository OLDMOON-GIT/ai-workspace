import mysql from 'mysql2/promise';

const conn = await mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: 'trend2024',
  database: 'trend_video'
});

// Get next bug ID
const [rows] = await conn.query(`
  SELECT MAX(CAST(SUBSTRING(id, 5) AS UNSIGNED)) as max_seq
  FROM bugs
  WHERE id REGEXP '^BTS-0[0-9]{6}$'
`);
const maxSeq = rows[0]?.max_seq || 0;
const bugId = 'BTS-' + String(maxSeq + 1).padStart(7, '0');

// Insert bug
await conn.execute(`
  INSERT INTO bugs (id, title, summary, status, log_path, created_at, updated_at, assigned_to, metadata)
  VALUES (?, ?, ?, 'open', 'user-report', NOW(), NOW(), 'auto', ?)
`, [
  bugId,
  '완료탭 YouTube 삭제 시 "로그인이 필요합니다" 에러',
  `내 콘텐츠 > 완료 탭에서 YouTube 삭제 시 "삭제 실패: 로그인이 필요합니다" 에러 발생.

예상 원인: YouTube 삭제 API에서 인증 처리가 누락되었거나 getCurrentUser 호출 실패`,
  JSON.stringify({
    type: 'auth-error',
    source: 'user-report',
    page: 'my-content',
    tab: 'completed'
  })
]);

console.log('버그 등록 완료:', bugId);
await conn.end();
