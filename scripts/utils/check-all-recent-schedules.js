const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'trend-video-frontend', 'data', 'database.sqlite');
console.log('DB 경로:', dbPath);

const db = new Database(dbPath);

console.log('\n=== 최근 video_schedules (5개) ===\n');

const schedules = db.prepare(`
  SELECT id, title_id, status, script_id, video_id, created_at
  FROM video_schedules
  ORDER BY created_at DESC
  LIMIT 5
`).all();

schedules.forEach((s, idx) => {
  console.log(`${idx + 1}.`);
  console.log(`   id: ${s.id}`);
  console.log(`   title_id: ${s.title_id}`);
  console.log(`   status: ${s.status}`);
  console.log(`   script_id: ${s.script_id || 'NULL'}`);
  console.log(`   video_id: ${s.video_id || 'NULL'}`);
  console.log(`   created: ${s.created_at}`);
  console.log('');
});

console.log('=== 최근 video_titles (10개) ===\n');

const titles = db.prepare(`
  SELECT id, title, status, type, created_at
  FROM video_titles
  ORDER BY created_at DESC
  LIMIT 10
`).all();

titles.forEach((t, idx) => {
  console.log(`${idx + 1}. ${t.title}`);
  console.log(`   id: ${t.id}`);
  console.log(`   type: ${t.type}`);
  console.log(`   status: ${t.status}`);
  console.log(`   created: ${t.created_at}`);
  console.log('');
});

console.log('=== processing 상태 스케줄 ===\n');

const processing = db.prepare(`
  SELECT
    s.id,
    s.title_id,
    s.status,
    s.video_id,
    t.title
  FROM video_schedules s
  LEFT JOIN video_titles t ON s.title_id = t.id
  WHERE s.status = 'processing'
  ORDER BY s.created_at DESC
  LIMIT 5
`).all();

if (processing.length > 0) {
  processing.forEach((p, idx) => {
    console.log(`${idx + 1}. ${p.title || '(no title)'}`);
    console.log(`   schedule_id: ${p.id}`);
    console.log(`   title_id: ${p.title_id}`);
    console.log(`   video_id: ${p.video_id || 'NULL'}`);
    console.log('');
  });
} else {
  console.log('없음');
}

db.close();
