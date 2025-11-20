const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'trend-video-frontend', 'data', 'database.sqlite');
const db = new Database(dbPath);

const jobs = db.prepare(`
  SELECT id, title, source_content_id, created_at
  FROM jobs
  WHERE id IN ('auto_1763292759202_8c0f6tqqw', 'auto_1763292313294_5vufpfe5c', 'auto_1763292082367_hnxbdcobn')
  ORDER BY created_at
`).all();

console.log('=== Job 생성 시간 ===\n');
jobs.forEach(job => {
  const date = new Date(job.created_at);
  console.log(job.title);
  console.log('  ID:', job.id);
  console.log('  source_content_id:', job.source_content_id || 'NULL');
  console.log('  created:', date.toLocaleString('ko-KR', {timeZone: 'Asia/Seoul'}));
  console.log('');
});

db.close();
