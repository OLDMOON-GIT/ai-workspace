const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'trend-video-frontend', 'data', 'database.sqlite');
const db = new Database(dbPath);

console.log('=== 최근 waiting_for_upload 스케줄 ===\n');

// script_id로 찾기
const schedule = db.prepare(`
  SELECT
    s.id,
    s.title_id,
    s.status,
    s.script_id,
    s.created_at,
    s.updated_at,
    t.title,
    t.media_mode,
    t.type
  FROM video_schedules s
  LEFT JOIN video_titles t ON s.title_id = t.id
  WHERE s.script_id = '72caf9c6-5d4d-4b5d-8204-074059a6d3f9'
`).get();

if (schedule) {
  console.log('제목:', schedule.title);
  console.log('타입:', schedule.type);
  console.log('media_mode:', schedule.media_mode);
  console.log('status:', schedule.status);
  console.log('script_id:', schedule.script_id);
  console.log('created:', schedule.created_at);
  console.log('updated:', schedule.updated_at);
} else {
  console.log('스케줄을 찾을 수 없습니다.');
}

db.close();
