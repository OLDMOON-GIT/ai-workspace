const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, 'trend-video-frontend', 'data', 'database.sqlite');
const db = new Database(dbPath);

const scriptId = 'f1f34a3a-f9e3-4b71-9bb7-c9755138a07b';

console.log('=== 스크립트 복원 및 수정 ===\n');

// 현재 스크립트 조회
const script = db.prepare(`
  SELECT id, title, content
  FROM contents
  WHERE id = ?
`).get(scriptId);

if (!script) {
  console.log('❌ 스크립트를 찾을 수 없습니다.');
  db.close();
  process.exit(1);
}

console.log('제목:', script.title);

const contentStr = typeof script.content === 'string' ? script.content : JSON.stringify(script.content);

console.log('현재 content 처음 200자:');
console.log(contentStr.substring(0, 200));
console.log('');

// 1단계: 작은따옴표를 큰따옴표로 복원
let fixed = contentStr.replace(/'/g, '"');

console.log('1. 작은따옴표 → 큰따옴표 복원');
console.log('복원 후 처음 200자:');
console.log(fixed.substring(0, 200));
console.log('');

// 2단계: 이제 한글 따옴표를 삭제
fixed = fixed
  .replace(/"/g, '')  // 한글 여는 따옴표 삭제
  .replace(/"/g, ''); // 한글 닫는 따옴표 삭제

console.log('2. 한글 따옴표 삭제');

// 파싱 테스트
console.log('\n=== 파싱 테스트 ===\n');

let testStr = fixed.trim();
if (testStr.startsWith('JSON')) {
  testStr = testStr.substring(4).trim();
}
const jsonStart = testStr.indexOf('{');
if (jsonStart > 0) {
  testStr = testStr.substring(jsonStart);
}

try {
  const parsed = JSON.parse(testStr);
  console.log('✅ JSON 파싱 성공!');
  console.log('씬 개수:', parsed.scenes?.length || 0);

  // DB 업데이트
  db.prepare(`
    UPDATE contents
    SET content = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(fixed, scriptId);

  console.log('✅ DB 업데이트 완료');

  // story.json 생성
  const projectPath = path.join(__dirname, 'trend-video-backend', 'input', `project_${scriptId}`);
  if (!fs.existsSync(projectPath)) {
    fs.mkdirSync(projectPath, { recursive: true });
  }

  const storyPath = path.join(projectPath, 'story.json');
  fs.writeFileSync(storyPath, JSON.stringify(parsed, null, 2), 'utf-8');
  console.log(`✅ story.json 생성: ${storyPath}`);

  console.log('\n✅ 완료! 이제 브라우저에서 다시 업로드를 시도하세요!');

} catch (e) {
  console.log('❌ JSON 파싱 여전히 실패:', e.message);

  const errorPos = parseInt(e.message.match(/position (\d+)/)?.[1] || '0');
  if (errorPos > 0) {
    const start = Math.max(0, errorPos - 100);
    const end = Math.min(testStr.length, errorPos + 100);
    console.log('에러 위치 주변:');
    console.log(testStr.substring(start, end));
    console.log(' '.repeat(errorPos - start) + '^');
  }
}

db.close();
