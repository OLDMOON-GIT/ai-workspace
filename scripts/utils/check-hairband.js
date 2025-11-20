const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'trend-video-frontend', 'data', 'database.sqlite');
const db = new Database(dbPath);

console.log('=== 헤어밴드 상품 확인 ===\n');

// 1. video_titles 확인
const title = db.prepare(`
  SELECT id, title, type, product_data, created_at
  FROM video_titles
  WHERE id = 'title_1763300968675_786xtl9wj'
`).get();

console.log('1. Video Title:');
console.log('   ID:', title.id);
console.log('   제목:', title.title);
console.log('   타입:', title.type);
console.log('   product_data:', title.product_data || 'NULL');
console.log('   생성시간:', title.created_at);
console.log('');

// 2. 스크립트 확인
const scripts = db.prepare(`
  SELECT id, title, type, created_at, LENGTH(content) as len,
         SUBSTR(content, 1, 200) as preview
  FROM contents
  WHERE title LIKE '%탐사%헤어밴드%'
  ORDER BY created_at DESC
  LIMIT 3
`).all();

console.log('2. 관련 스크립트:');
if (scripts.length === 0) {
  console.log('   ❌ 스크립트 없음!');
} else {
  scripts.forEach((s, idx) => {
    console.log(`   ${idx + 1}. ${s.title}`);
    console.log(`      타입: ${s.type}, 길이: ${s.len}`);
    console.log(`      생성: ${s.created_at}`);
    if (s.preview.includes('{thumbnail}')) console.log('      ⚠️ 플레이스홀더 포함!');
    console.log('');
  });
}

// 3. product-info 스크립트 확인
const productInfoScript = db.prepare(`
  SELECT id, title, created_at, LENGTH(content) as len,
         SUBSTR(content, 1, 300) as preview
  FROM contents
  WHERE title = ?
  ORDER BY created_at DESC
  LIMIT 1
`).get('[광고] 탐사 고탄력 헤어밴드 2종 세트 - 상품 기입 정보');

console.log('3. Product-Info 스크립트:');
if (productInfoScript) {
  console.log('   ✅ 있음:', productInfoScript.title);
  console.log('   길이:', productInfoScript.len);
  console.log('   생성:', productInfoScript.created_at);
  console.log('   미리보기:', productInfoScript.preview);
} else {
  console.log('   ❌ 없음!');
}

db.close();
