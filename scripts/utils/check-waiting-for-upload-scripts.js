const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'trend-video-frontend', 'data', 'database.sqlite');
const db = new Database(dbPath);

console.log('=== 업로드 대기 중인 스케줄 ===\n');

// waiting_for_upload 상태의 스케줄 조회
const schedules = db.prepare(`
  SELECT
    s.id as schedule_id,
    s.title_id,
    s.script_id,
    s.status as schedule_status,
    t.title,
    t.status as title_status,
    t.media_mode,
    t.type
  FROM video_schedules s
  LEFT JOIN video_titles t ON s.title_id = t.id
  WHERE s.status = 'waiting_for_upload'
  ORDER BY s.created_at DESC
`).all();

if (schedules.length === 0) {
  console.log('❌ 업로드 대기 중인 스케줄이 없습니다.\n');
}

schedules.forEach((sched, idx) => {
  console.log(`${idx + 1}. ${sched.title}`);
  console.log(`   schedule_id: ${sched.schedule_id}`);
  console.log(`   script_id: ${sched.script_id || 'NULL'}`);
  console.log(`   media_mode: ${sched.media_mode}`);
  console.log(`   type: ${sched.type}`);

  if (sched.script_id) {
    // 스크립트 content 확인
    const script = db.prepare(`
      SELECT LENGTH(content) as len
      FROM contents
      WHERE id = ?
    `).get(sched.script_id);

    if (script) {
      console.log(`   script length: ${script.len} chars`);
    }
  }
  console.log('');
});

// 이제 각 스크립트를 파싱 테스트
console.log('=== 스크립트 파싱 테스트 ===\n');

for (const sched of schedules) {
  if (!sched.script_id) continue;

  const script = db.prepare(`
    SELECT content
    FROM contents
    WHERE id = ?
  `).get(sched.script_id);

  if (!script) continue;

  const contentStr = typeof script.content === 'string' ? script.content : JSON.stringify(script.content);

  // upload-media 로직 재현
  let testStr = contentStr.trim();
  if (testStr.startsWith('JSON')) {
    testStr = testStr.substring(4).trim();
  }
  const jsonStart = testStr.indexOf('{');
  if (jsonStart > 0) {
    testStr = testStr.substring(jsonStart);
  }

  try {
    JSON.parse(testStr);
    console.log(`✅ ${sched.title}: 파싱 성공`);
  } catch (e) {
    console.log(`❌ ${sched.title}: 파싱 실패`);
    console.log(`   script_id: ${sched.script_id}`);
    console.log(`   에러: ${e.message}`);

    const errorPos = parseInt(e.message.match(/position (\d+)/)?.[1] || '0');
    if (errorPos > 0) {
      const start = Math.max(0, errorPos - 100);
      const end = Math.min(testStr.length, errorPos + 100);
      console.log(`   에러 위치 주변:`);
      console.log(`   ...${testStr.substring(start, end)}...`);
      console.log(`   ${' '.repeat(errorPos - start + 3)}^`);
    }
    console.log('');
  }
}

db.close();
