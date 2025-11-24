const path = require('path');
const Database = require(path.join(__dirname, 'trend-video-frontend', 'node_modules', 'better-sqlite3'));

const dbPath = path.join(__dirname, 'trend-video-frontend', 'data', 'database.sqlite');
const db = new Database(dbPath);

console.log('=== 전체 상태 확인 ===\n');

// 전체 쿼리 (getAllVideoTitles와 동일)
const titles = db.prepare(`
  SELECT
    t.id,
    t.title,
    t.status as title_status,
    COALESCE(s.status, t.status) as status,
    s.id as schedule_id,
    s.status as schedule_status
  FROM video_titles t
  LEFT JOIN (
    SELECT title_id, id, status,
           ROW_NUMBER() OVER (PARTITION BY title_id ORDER BY created_at DESC) as rn
    FROM video_schedules
  ) s ON t.id = s.title_id AND s.rn = 1
`).all();

console.log('총 titles 수:', titles.length);

const statusCounts = {};
titles.forEach(t => {
  statusCounts[t.status] = (statusCounts[t.status] || 0) + 1;
});

console.log('\n=== COALESCE(s.status, t.status) 기준 카운트 ===');
Object.entries(statusCounts).sort((a, b) => b[1] - a[1]).forEach(([status, count]) => {
  console.log(`${status}: ${count}`);
});

console.log('\n=== title_status 기준 카운트 ===');
const titleStatusCounts = {};
titles.forEach(t => {
  titleStatusCounts[t.title_status] = (titleStatusCounts[t.title_status] || 0) + 1;
});
Object.entries(titleStatusCounts).sort((a, b) => b[1] - a[1]).forEach(([status, count]) => {
  console.log(`${status}: ${count}`);
});

console.log('\n=== processing 상태 상세 ===');
const processing = titles.filter(t => t.status === 'processing');
console.log('Processing count:', processing.length);
processing.forEach(t => {
  console.log(`- ${t.title.substring(0, 50)}`);
  console.log(`  title_status: ${t.title_status}`);
  console.log(`  schedule_status: ${t.schedule_status}`);
  console.log(`  COALESCE status: ${t.status}`);
});

console.log('\n=== waiting_for_upload 상태 상세 ===');
const waiting = titles.filter(t => t.status === 'waiting_for_upload');
console.log('Waiting count:', waiting.length);
waiting.slice(0, 3).forEach(t => {
  console.log(`- ${t.title.substring(0, 50)}`);
  console.log(`  title_status: ${t.title_status}`);
  console.log(`  schedule_status: ${t.schedule_status || 'NULL'}`);
  console.log(`  COALESCE status: ${t.status}`);
});

db.close();
