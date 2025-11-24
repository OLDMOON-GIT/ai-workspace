const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, 'trend-video-frontend', 'data', 'database.sqlite');
const db = new Database(dbPath);

const scriptId = '72caf9c6-5d4d-4b5d-8204-074059a6d3f9';

const content = db.prepare(`
  SELECT content, title
  FROM contents
  WHERE id = ? AND type = 'script'
`).get(scriptId);

db.close();

if (!content) {
  console.log('❌ 스크립트를 찾을 수 없습니다.');
  process.exit(1);
}

console.log('=== Raw Content (처음 200자) ===\n');
const contentStr = typeof content.content === 'string' ? content.content : JSON.stringify(content.content);
console.log(contentStr.substring(0, 200));
console.log('\n...\n');

console.log('=== Content 정보 ===');
console.log('타입:', typeof content.content);
console.log('길이:', contentStr.length);
console.log('');

// upload-media 로직 재현
console.log('=== upload-media 파싱 로직 재현 ===\n');

let testStr = contentStr.trim();
console.log('1. trim() 후 처음 100자:');
console.log(testStr.substring(0, 100));
console.log('');

if (testStr.startsWith('JSON')) {
  console.log('2. "JSON"으로 시작함, 제거');
  testStr = testStr.substring(4).trim();
  console.log('   제거 후 처음 100자:');
  console.log('   ' + testStr.substring(0, 100));
  console.log('');
}

const jsonStart = testStr.indexOf('{');
console.log('3. 첫 번째 { 위치:', jsonStart);
if (jsonStart > 0) {
  console.log('   앞부분 제거할 텍스트:');
  console.log('   ' + testStr.substring(0, jsonStart));
  testStr = testStr.substring(jsonStart);
}
console.log('');

console.log('4. 최종 파싱할 문자열 처음 200자:');
console.log(testStr.substring(0, 200));
console.log('');

console.log('5. JSON 파싱 시도...');
try {
  const parsed = JSON.parse(testStr);
  console.log('✅ 파싱 성공!');
  console.log('   씬 개수:', parsed.scenes?.length || 0);
} catch (e) {
  console.error('❌ 파싱 실패:', e.message);
  console.error('');

  const errorPos = parseInt(e.message.match(/position (\d+)/)?.[1] || '0');
  if (errorPos > 0) {
    const start = Math.max(0, errorPos - 100);
    const end = Math.min(testStr.length, errorPos + 100);
    console.log('에러 위치 주변:');
    console.log(testStr.substring(start, end));
    console.log(' '.repeat(errorPos - start) + '^');
  }
}
