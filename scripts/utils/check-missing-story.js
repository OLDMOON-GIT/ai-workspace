const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, 'trend-video-frontend', 'data', 'database.sqlite');
const db = new Database(dbPath);

const scriptId = 'f1f34a3a-f9e3-4b71-9bb7-c9755138a07b';

console.log('=== Script 정보 ===\n');

// 스크립트 조회
const script = db.prepare(`
  SELECT id, title, type, created_at, LENGTH(content) as len
  FROM contents
  WHERE id = ?
`).get(scriptId);

if (!script) {
  console.log('❌ 스크립트를 찾을 수 없습니다.');
  db.close();
  process.exit(1);
}

console.log('제목:', script.title);
console.log('타입:', script.type);
console.log('길이:', script.len, 'chars');
console.log('생성:', script.created_at);
console.log('');

// 스케줄 조회
const schedule = db.prepare(`
  SELECT
    s.id,
    s.title_id,
    s.status,
    t.title,
    t.media_mode,
    t.status as title_status
  FROM video_schedules s
  LEFT JOIN video_titles t ON s.title_id = t.id
  WHERE s.script_id = ?
`).get(scriptId);

if (schedule) {
  console.log('=== 스케줄 정보 ===\n');
  console.log('스케줄 ID:', schedule.id);
  console.log('제목:', schedule.title);
  console.log('media_mode:', schedule.media_mode);
  console.log('스케줄 상태:', schedule.status);
  console.log('타이틀 상태:', schedule.title_status);
  console.log('');
}

// 폴더 및 파일 확인
const projectPath = path.join(__dirname, 'trend-video-backend', 'input', `project_${scriptId}`);
console.log('=== 프로젝트 폴더 확인 ===\n');
console.log('경로:', projectPath);

if (fs.existsSync(projectPath)) {
  console.log('✅ 폴더 존재');
  const files = fs.readdirSync(projectPath);
  console.log('파일 목록:');
  files.forEach(f => console.log(`  - ${f}`));
} else {
  console.log('❌ 폴더 없음');
}

console.log('');

// 스크립트 content 파싱 테스트
const fullScript = db.prepare(`
  SELECT content
  FROM contents
  WHERE id = ?
`).get(scriptId);

if (fullScript) {
  console.log('=== 스크립트 파싱 테스트 ===\n');

  const contentStr = typeof fullScript.content === 'string' ? fullScript.content : JSON.stringify(fullScript.content);

  let testStr = contentStr.trim();
  if (testStr.startsWith('JSON')) {
    testStr = testStr.substring(4).trim();
  }
  const jsonStart = testStr.indexOf('{');
  if (jsonStart > 0) {
    testStr = testStr.substring(jsonStart);
  }

  try {
    const parsed = JSON.parse(testStr);
    console.log('✅ JSON 파싱 성공');
    console.log('씬 개수:', parsed.scenes?.length || 0);

    // story.json 생성
    const storyPath = path.join(projectPath, 'story.json');
    if (!fs.existsSync(projectPath)) {
      fs.mkdirSync(projectPath, { recursive: true });
      console.log('✅ 프로젝트 폴더 생성');
    }

    fs.writeFileSync(storyPath, JSON.stringify(parsed, null, 2), 'utf-8');
    console.log(`✅ story.json 생성: ${storyPath}`);

  } catch (e) {
    console.log('❌ JSON 파싱 실패:', e.message);

    const errorPos = parseInt(e.message.match(/position (\d+)/)?.[1] || '0');
    if (errorPos > 0) {
      const start = Math.max(0, errorPos - 100);
      const end = Math.min(testStr.length, errorPos + 100);
      console.log('에러 위치 주변:');
      console.log(testStr.substring(start, end));
      console.log(' '.repeat(errorPos - start) + '^');
    }
  }
}

db.close();
