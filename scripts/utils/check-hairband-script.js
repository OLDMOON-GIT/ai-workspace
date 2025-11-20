const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, 'trend-video-frontend', 'data', 'database.sqlite');
const db = new Database(dbPath);

const scriptId = '72caf9c6-5d4d-4b5d-8204-074059a6d3f9';

console.log('=== 헤어밴드 스크립트 확인 ===\n');

// DB에서 스크립트 조회
const script = db.prepare(`
  SELECT id, title, type, LENGTH(content) as len, content
  FROM contents
  WHERE id = ?
`).get(scriptId);

if (!script) {
  console.log('❌ 스크립트를 찾을 수 없습니다.');
  db.close();
  process.exit(1);
}

console.log('스크립트 정보:');
console.log('  ID:', script.id);
console.log('  제목:', script.title);
console.log('  타입:', script.type);
console.log('  길이:', script.len, 'chars');
console.log('');

// JSON 파싱 시도
console.log('=== JSON 파싱 테스트 ===\n');

try {
  const parsed = JSON.parse(script.content);
  console.log('✅ JSON 파싱 성공');
  console.log('씬 개수:', parsed.scenes?.length || 0);

  if (parsed.scenes && parsed.scenes.length > 0) {
    console.log('\n첫 번째 씬:');
    console.log(JSON.stringify(parsed.scenes[0], null, 2));
  }
} catch (e) {
  console.error('❌ JSON 파싱 실패:', e.message);
  console.error('');

  // 에러 위치 주변 텍스트 출력
  const errorPos = parseInt(e.message.match(/position (\d+)/)?.[1] || '0');
  if (errorPos > 0) {
    const start = Math.max(0, errorPos - 100);
    const end = Math.min(script.content.length, errorPos + 100);
    console.log('에러 위치 주변 텍스트:');
    console.log('...' + script.content.substring(start, end) + '...');
    console.log(' '.repeat(errorPos - start + 3) + '^');
  }

  // 전체 내용 저장
  const outputPath = path.join(__dirname, 'hairband-script-content.txt');
  fs.writeFileSync(outputPath, script.content, 'utf-8');
  console.log(`\n전체 내용을 파일에 저장: ${outputPath}`);
}

db.close();
