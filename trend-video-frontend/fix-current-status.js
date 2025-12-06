const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'data', 'database.sqlite');
const db = new Database(dbPath);

// video_processing 상태를 processing으로 변경
const schedule = db.prepare(`
  SELECT id, title_id, status
  FROM task_schedules
  WHERE status = 'video_processing'
  ORDER BY created_at DESC
  LIMIT 1
`).get();

if (schedule) {
  console.log(`현재 스케줄: ${schedule.id}, 상태: ${schedule.status}`);

  // 상태 변경
  db.prepare(`
    UPDATE task_schedules
    SET status = 'processing'
    WHERE id = ?
  `).run(schedule.id);

  console.log(`✅ 상태 변경: video_processing -> processing`);
} else {
  console.log('⚠️ video_processing 상태의 스케줄이 없습니다.');
}

db.close();
