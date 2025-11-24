const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'trend-video-frontend', 'data', 'database.sqlite');
const db = new Database(dbPath);

console.log('=== 헤어밴드 스케줄 상태 수정 ===\n');

const scheduleId = 'schedule_1763301798766_2szs9kqfy';
const videoId = 'auto_1763302045037_ytu6o7wgr';
const scriptId = '72caf9c6-5d4d-4b5d-8204-074059a6d3f9';

// script_id로 스케줄 찾기
const schedule = db.prepare(`
  SELECT id, title_id, status, video_id
  FROM video_schedules
  WHERE script_id = ?
`).get(scriptId);

if (!schedule) {
  console.log('❌ 스케줄을 찾을 수 없습니다.');
  db.close();
  process.exit(1);
}

console.log('찾은 스케줄:');
console.log('  id:', schedule.id);
console.log('  title_id:', schedule.title_id);
console.log('  status:', schedule.status);
console.log('  video_id:', schedule.video_id || 'NULL');

// video_id 업데이트 및 상태 completed로 변경
db.prepare(`
  UPDATE video_schedules
  SET video_id = ?,
      status = 'completed',
      updated_at = CURRENT_TIMESTAMP
  WHERE id = ?
`).run(videoId, schedule.id);

// title 상태도 completed로 변경
db.prepare(`
  UPDATE video_titles
  SET status = 'completed',
      updated_at = CURRENT_TIMESTAMP
  WHERE id = ?
`).run(schedule.title_id);

console.log('\n✅ 업데이트 완료:');
console.log('  video_id:', videoId);
console.log('  schedule status: completed');
console.log('  title status: completed');

// 확인
const updated = db.prepare(`
  SELECT s.id, s.status, s.video_id, t.status as title_status
  FROM video_schedules s
  LEFT JOIN video_titles t ON s.title_id = t.id
  WHERE s.id = ?
`).get(schedule.id);

console.log('\n확인:');
console.log('  schedule status:', updated.status);
console.log('  title status:', updated.title_status);
console.log('  video_id:', updated.video_id);

db.close();
