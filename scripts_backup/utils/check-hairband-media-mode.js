const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'trend-video-frontend', 'data', 'database.sqlite');
const db = new Database(dbPath);

console.log('=== 헤어밴드 video_titles 확인 ===\n');

// video_titles 테이블 스키마 확인
const schemaInfo = db.prepare(`PRAGMA table_info(video_titles)`).all();
console.log('video_titles 컬럼:');
schemaInfo.forEach(col => {
  console.log(`  - ${col.name} (${col.type})`);
});

console.log('\n=== 헤어밴드 데이터 ===\n');

// 헤어밴드 데이터 조회
const title = db.prepare(`
  SELECT *
  FROM video_titles
  WHERE id = 'title_1763300968675_786xtl9wj'
`).get();

console.log('Title 데이터:', JSON.stringify(title, null, 2));

console.log('\n=== 다른 상품 샘플 (media_mode 비교) ===\n');

// 다른 상품들의 media_mode 확인
const samples = db.prepare(`
  SELECT id, title, type, media_mode, created_at
  FROM video_titles
  WHERE type = 'product'
  ORDER BY created_at DESC
  LIMIT 5
`).all();

samples.forEach(s => {
  console.log(`${s.title}`);
  console.log(`  media_mode: ${s.media_mode || 'NULL'}`);
  console.log(`  created_at: ${s.created_at}`);
  console.log('');
});

db.close();
