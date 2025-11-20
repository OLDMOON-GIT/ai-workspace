const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'trend-video-frontend', 'data', 'database.sqlite');
const db = new Database(dbPath);

console.log('=== 헤어밴드 스케줄 상태 수정 ===\n');

// 현재 상태 확인
const before = db.prepare(`
  SELECT id, status, video_id, script_id
  FROM video_schedules
  WHERE id = 'schedule_1763300968701_nbqnxwpr6'
`).get();

console.log('수정 전:', before);

// 상태를 waiting_for_upload로 변경
db.prepare(`
  UPDATE video_schedules
  SET status = 'waiting_for_upload',
      updated_at = CURRENT_TIMESTAMP
  WHERE id = 'schedule_1763300968701_nbqnxwpr6'
`).run();

// 수정 후 확인
const after = db.prepare(`
  SELECT id, status, video_id, script_id, updated_at
  FROM video_schedules
  WHERE id = 'schedule_1763300968701_nbqnxwpr6'
`).get();

console.log('\n수정 후:', after);

db.close();

console.log('\n✅ 헤어밴드 스케줄 상태가 waiting_for_upload로 변경되었습니다.');
console.log('이제 스케줄러가 다음 실행 시 유튜브 업로드를 시작할 것입니다.');
