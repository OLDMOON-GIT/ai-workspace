const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'trend-video-frontend', 'data', 'database.sqlite');
const db = new Database(dbPath);

console.log('=== YouTube 업로드 확인 ===\n');

// 최근 YouTube 업로드 조회
const uploads = db.prepare(`
  SELECT
    yu.id,
    yu.title,
    yu.job_id,
    yu.description,
    yu.created_at,
    j.source_content_id
  FROM youtube_uploads yu
  LEFT JOIN jobs j ON yu.job_id = j.id
  WHERE yu.title LIKE '%광고%'
  ORDER BY yu.created_at DESC
  LIMIT 3
`).all();

uploads.forEach((upload, idx) => {
  console.log(`${idx + 1}. ${upload.title}`);
  console.log(`   job_id: ${upload.job_id || 'NULL'}`);
  console.log(`   source_content_id: ${upload.source_content_id || 'NULL'}`);
  console.log(`   description: ${upload.description ? upload.description.substring(0, 100) : 'EMPTY/NULL'}`);
  console.log(`   created_at: ${upload.created_at}`);
  console.log('');
});

// product-info 스크립트 확인
console.log('=== Product-Info 스크립트 확인 ===\n');
const productInfoScripts = db.prepare(`
  SELECT id, title, type, created_at, LENGTH(content) as len
  FROM contents
  WHERE title LIKE '%상품 기입 정보%'
  ORDER BY created_at DESC
  LIMIT 5
`).all();

if (productInfoScripts.length === 0) {
  console.log('❌ product-info 스크립트가 하나도 없음!');
} else {
  productInfoScripts.forEach((script, idx) => {
    console.log(`${idx + 1}. ${script.title}`);
    console.log(`   type: ${script.type}`);
    console.log(`   length: ${script.len} chars`);
    console.log(`   created: ${script.created_at}`);
    console.log('');
  });
}

db.close();
