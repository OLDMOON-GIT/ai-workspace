const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'trend-video-frontend', 'data', 'database.sqlite');
const db = new Database(dbPath);

console.log('=== 헤어밴드 YouTube 업로드 트리거 ===\n');

const scheduleId = 'schedule_1763301798346_u53izn00d';
const videoId = 'auto_1763302045037_ytu6o7wgr';

// 스케줄 상태를 다시 processing으로 변경하여 YouTube 업로드 재시도
db.prepare(`
  UPDATE video_schedules
  SET status = 'processing',
      updated_at = CURRENT_TIMESTAMP
  WHERE id = ?
`).run(scheduleId);

// Title 상태도 processing으로 변경
db.prepare(`
  UPDATE video_titles
  SET status = 'processing',
      updated_at = CURRENT_TIMESTAMP
  WHERE id = (SELECT title_id FROM video_schedules WHERE id = ?)
`).run(scheduleId);

console.log('✅ 스케줄 상태를 processing으로 변경했습니다.');
console.log('⚠️ 하지만 이것만으로는 YouTube 업로드가 자동으로 진행되지 않습니다.');
console.log('');
console.log('📌 해결 방법:');
console.log('1. "내 콘텐츠" 페이지에서 video_id를 찾아 수동으로 YouTube 업로드');
console.log(`   Video ID: ${videoId}`);
console.log('');
console.log('또는');
console.log('');
console.log('2. YouTube 업로드 API를 직접 호출 (코드 작성 필요)');

db.close();
