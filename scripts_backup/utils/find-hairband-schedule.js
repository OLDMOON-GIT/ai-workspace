const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'trend-video-frontend', 'data', 'database.sqlite');
const db = new Database(dbPath);

console.log('=== 헤어밴드 관련 모든 스케줄 ===\n');

// 헤어밴드 title_id로 스케줄 찾기
const schedules = db.prepare(`
  SELECT
    s.id,
    s.title_id,
    s.status,
    s.script_id,
    s.video_id,
    s.created_at,
    s.updated_at,
    t.title
  FROM video_schedules s
  LEFT JOIN video_titles t ON s.title_id = t.id
  WHERE t.title LIKE '%헤어밴드%'
  ORDER BY s.created_at DESC
`).all();

if (schedules.length === 0) {
  console.log('❌ 헤어밴드 스케줄을 찾을 수 없습니다.');
} else {
  schedules.forEach((s, idx) => {
    console.log(`${idx + 1}. ${s.title}`);
    console.log(`   schedule_id: ${s.id}`);
    console.log(`   title_id: ${s.title_id}`);
    console.log(`   status: ${s.status}`);
    console.log(`   script_id: ${s.script_id || 'NULL'}`);
    console.log(`   video_id: ${s.video_id || 'NULL'}`);
    console.log(`   created: ${s.created_at}`);
    console.log(`   updated: ${s.updated_at}`);
    console.log('');
  });
}

// video_titles도 확인
console.log('=== 헤어밴드 video_titles ===\n');

const titles = db.prepare(`
  SELECT id, title, status, created_at
  FROM video_titles
  WHERE title LIKE '%헤어밴드%'
  ORDER BY created_at DESC
`).all();

titles.forEach((t, idx) => {
  console.log(`${idx + 1}. ${t.title}`);
  console.log(`   id: ${t.id}`);
  console.log(`   status: ${t.status}`);
  console.log(`   created: ${t.created_at}`);
  console.log('');
});

db.close();
