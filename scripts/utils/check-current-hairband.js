const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'trend-video-frontend', 'data', 'database.sqlite');
const db = new Database(dbPath);

const scriptId = '72caf9c6-5d4d-4b5d-8204-074059a6d3f9';

console.log('=== 현재 헤어밴드 상태 ===\n');

// 스케줄 조회
const schedule = db.prepare(`
  SELECT
    s.id,
    s.title_id,
    s.status as schedule_status,
    s.script_id,
    s.video_id,
    s.youtube_url,
    s.updated_at,
    t.title,
    t.status as title_status,
    t.media_mode
  FROM video_schedules s
  LEFT JOIN video_titles t ON s.title_id = t.id
  WHERE s.script_id = ?
`).get(scriptId);

if (!schedule) {
  console.log('❌ 스케줄을 찾을 수 없습니다.');
  db.close();
  process.exit(1);
}

console.log('제목:', schedule.title);
console.log('media_mode:', schedule.media_mode);
console.log('\nSchedule:');
console.log('  id:', schedule.id);
console.log('  status:', schedule.schedule_status);
console.log('  script_id:', schedule.script_id);
console.log('  video_id:', schedule.video_id || 'NULL');
console.log('  youtube_url:', schedule.youtube_url || 'NULL');
console.log('  updated_at:', schedule.updated_at);

console.log('\nTitle:');
console.log('  id:', schedule.title_id);
console.log('  status:', schedule.title_status);

// Job 조회
console.log('\n=== 관련 Job ===\n');
const job = db.prepare(`
  SELECT id, title, status, source_content_id, created_at
  FROM jobs
  WHERE id = ?
`).get(schedule.video_id);

if (job) {
  console.log('Job ID:', job.id);
  console.log('상태:', job.status);
  console.log('source_content_id:', job.source_content_id || 'NULL');
  console.log('생성:', job.created_at);
} else {
  console.log('Job을 찾을 수 없습니다.');
}

db.close();
