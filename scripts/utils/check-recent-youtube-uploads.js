const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'trend-video-frontend', 'data', 'database.sqlite');
const db = new Database(dbPath);

console.log('=== 최근 완료된 스케줄 (YouTube 업로드 확인) ===\n');

// 최근 completed 스케줄들
const schedules = db.prepare(`
  SELECT
    s.id,
    s.title_id,
    s.script_id,
    s.video_id,
    s.youtube_url,
    s.created_at,
    s.updated_at,
    t.title,
    t.media_mode
  FROM video_schedules s
  LEFT JOIN video_titles t ON s.title_id = t.id
  WHERE s.status = 'completed'
    AND t.type = 'product'
  ORDER BY s.updated_at DESC
  LIMIT 10
`).all();

schedules.forEach((s, idx) => {
  console.log(`${idx + 1}. ${s.title}`);
  console.log(`   media_mode: ${s.media_mode || 'NULL'}`);
  console.log(`   video_id: ${s.video_id || 'NULL'}`);
  console.log(`   youtube_url: ${s.youtube_url ? '✅ 있음' : '❌ 없음'}`);
  console.log(`   updated: ${s.updated_at}`);
  console.log('');
});

// YouTube 업로드 테이블도 확인
console.log('=== 최근 YouTube 업로드 기록 ===\n');

const uploads = db.prepare(`
  SELECT id, title, video_url, created_at
  FROM youtube_uploads
  WHERE title LIKE '%광고%'
  ORDER BY created_at DESC
  LIMIT 5
`).all();

if (uploads.length === 0) {
  console.log('❌ 최근 YouTube 업로드 기록이 없습니다.');
} else {
  uploads.forEach((u, idx) => {
    console.log(`${idx + 1}. ${u.title}`);
    console.log(`   URL: ${u.video_url || 'NULL'}`);
    console.log(`   created: ${u.created_at}`);
    console.log('');
  });
}

db.close();
