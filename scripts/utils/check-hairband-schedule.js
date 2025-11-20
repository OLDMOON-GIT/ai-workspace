const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'trend-video-frontend', 'data', 'database.sqlite');
const db = new Database(dbPath);

console.log('=== 헤어밴드 스케줄 상세 ===\n');

// 헤어밴드 스케줄 조회
const schedule = db.prepare(`
  SELECT
    vs.*,
    vt.title as video_title,
    vt.status as title_status,
    vt.product_data
  FROM video_schedules vs
  LEFT JOIN video_titles vt ON vs.title_id = vt.id
  WHERE vs.title_id = 'title_1763300968675_786xtl9wj'
`).get();

console.log('Schedule:', {
  id: schedule.id,
  title_id: schedule.title_id,
  video_title: schedule.video_title,
  status: schedule.status,
  title_status: schedule.title_status,
  media_mode: schedule.media_mode,
  script_id: schedule.script_id,
  video_id: schedule.video_id,
  product_data: schedule.product_data,
  created_at: schedule.created_at,
  updated_at: schedule.updated_at
});

console.log('\n=== 관련 Job 조회 ===\n');

// 헤어밴드 관련 job 조회
const jobs = db.prepare(`
  SELECT id, title, status, source_content_id, created_at
  FROM jobs
  WHERE title LIKE '%헤어밴드%'
  ORDER BY created_at DESC
`).all();

jobs.forEach(job => {
  console.log(`- ${job.title}`);
  console.log(`  ID: ${job.id}`);
  console.log(`  status: ${job.status}`);
  console.log(`  source_content_id: ${job.source_content_id || 'NULL'}`);
  console.log(`  created_at: ${job.created_at}`);
  console.log('');
});

console.log('=== Pipeline Logs (최근 20개) ===\n');

// 파이프라인 로그 조회
const pipelineLogs = db.prepare(`
  SELECT created_at, level, message
  FROM pipeline_logs
  WHERE schedule_id = ?
  ORDER BY created_at DESC
  LIMIT 20
`).all(schedule.id);

pipelineLogs.reverse().forEach(log => {
  console.log(`[${log.created_at}] [${log.level}] ${log.message}`);
});

db.close();
