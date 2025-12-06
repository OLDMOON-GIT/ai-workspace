const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'data', 'database.sqlite');
const db = new Database(dbPath);

// processing 상태이면서 media_mode가 upload인 것들을 crawl로 변경
const result1 = db.prepare(`
  UPDATE video_titles
  SET media_mode = 'crawl'
  WHERE status = 'processing' AND media_mode = 'upload'
`).run();

const result2 = db.prepare(`
  UPDATE task_schedules
  SET media_mode = 'crawl'
  WHERE status = 'processing' AND media_mode = 'upload'
`).run();

console.log(`✅ video_titles 업데이트: ${result1.changes}개`);
console.log(`✅ task_schedules 업데이트: ${result2.changes}개`);

db.close();
console.log('완료!');
