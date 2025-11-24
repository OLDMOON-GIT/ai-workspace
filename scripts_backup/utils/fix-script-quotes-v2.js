const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, 'trend-video-frontend', 'data', 'database.sqlite');
const db = new Database(dbPath);

const scriptId = 'f1f34a3a-f9e3-4b71-9bb7-c9755138a07b';

console.log('=== 스크립트 따옴표 수정 v2 ===\n');

// 스크립트 조회
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

// 한글 따옴표를 작은따옴표로 치환 (JSON 문자열 안에서 안전)
const fixed = contentStr
  .replace(/"/g, "'")  // 한글 여는 따옴표 → 작은따옴표
  .replace(/"/g, "'"); // 한글 닫는 따옴표 → 작은따옴표

console.log('\n수정 전 길이:', contentStr.length);
console.log('수정 후 길이:', fixed.length);

// 바뀐 개수 확인
const count1 = (contentStr.match(/"/g) || []).length;
const count2 = (contentStr.match(/"/g) || []).length;
console.log(`한글 따옴표 개수: " ${count1}개, " ${count2}개`);
console.log(`→ 작은따옴표로 변경`);

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

  console.log('\n이제 브라우저에서 다시 업로드를 시도하세요!');

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
