const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, 'trend-video-frontend', 'data', 'database.sqlite');
const db = new Database(dbPath);

const workingScriptId = '72caf9c6-5d4d-4b5d-8204-074059a6d3f9';  // 작동하는 스크립트
const brokenScriptId = 'f1f34a3a-f9e3-4b71-9bb7-c9755138a07b';  // 깨진 스크립트

console.log('=== 작동하는 스크립트 복사 ===\n');

// 작동하는 스크립트 가져오기
const workingScript = db.prepare(`
  SELECT content, title
  FROM contents
  WHERE id = ?
`).get(workingScriptId);

if (!workingScript) {
  console.log('❌ 작동하는 스크립트를 찾을 수 없습니다.');
  db.close();
  process.exit(1);
}

console.log('원본 스크립트:', workingScript.title);

// 깨진 스크립트 업데이트
db.prepare(`
  UPDATE contents
  SET content = ?,
      updated_at = CURRENT_TIMESTAMP
  WHERE id = ?
`).run(workingScript.content, brokenScriptId);

console.log(`✅ 스크립트 복사 완료: ${brokenScriptId}`);

// story.json 생성
const projectPath = path.join(__dirname, 'trend-video-backend', 'input', `project_${brokenScriptId}`);
if (!fs.existsSync(projectPath)) {
  fs.mkdirSync(projectPath, { recursive: true });
}

const contentStr = typeof workingScript.content === 'string' ? workingScript.content : JSON.stringify(workingScript.content);
const parsed = JSON.parse(contentStr);

const storyPath = path.join(projectPath, 'story.json');
fs.writeFileSync(storyPath, JSON.stringify(parsed, null, 2), 'utf-8');
console.log(`✅ story.json 생성: ${storyPath}`);

console.log('\n✅ 완료! 이제 브라우저에서 다시 업로드를 시도하세요!');

db.close();
