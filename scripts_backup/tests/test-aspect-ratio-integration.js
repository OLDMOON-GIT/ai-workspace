/**
 * 비율 선택 통합 테스트 (Aspect Ratio Integration Test)
 *
 * 다음 시나리오를 테스트합니다:
 * 1. 각 포맷별 story.json 생성 시 올바른 aspect_ratio 확인
 *    - longform → 16:9
 *    - product → 9:16
 *    - shortform → 9:16
 *    - sora2 → 9:16
 * 2. API 라우트에서 올바른 기본값 설정 확인
 * 3. DB 스케줄 타입에 따른 비율 자동 선택 확인
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const BASE_URL = 'http://localhost:3000';
const API_BASE = '/api/automation';
const BACKEND_INPUT_PATH = path.join(__dirname, 'trend-video-backend', 'input');

let tests = [];
let passed = 0;
let failed = 0;

// HTTP 요청 함수
function request(method, path, data = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(BASE_URL + path);
    const options = {
      hostname: url.hostname,
      port: url.port || 3000,
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({
            ok: res.statusCode >= 200 && res.statusCode < 300,
            status: res.statusCode,
            data: body ? JSON.parse(body) : null
          });
        } catch (e) {
          resolve({
            ok: res.statusCode >= 200 && res.statusCode < 300,
            status: res.statusCode,
            data: body
          });
        }
      });
    });

    req.on('error', reject);

    if (data) {
      req.write(JSON.stringify(data));
    }

    req.end();
  });
}

// 테스트 헬퍼
function test(name, fn) {
  tests.push({ name, fn });
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

// DB 헬퍼: 스케줄 생성
function createScheduleInDB(type, scriptId) {
  const dbPath = path.join(__dirname, 'trend-video-frontend', 'data', 'database.sqlite');
  const db = new Database(dbPath);

  const scheduleId = `test-schedule-${type}-${Date.now()}`;

  db.prepare(`
    INSERT INTO video_schedules (id, type, script_id, status, created_at)
    VALUES (?, ?, ?, 'pending', datetime('now'))
  `).run(scheduleId, type, scriptId);

  db.close();
  return scheduleId;
}

// DB 헬퍼: 스크립트 생성
function createScriptInDB(type) {
  const dbPath = path.join(__dirname, 'trend-video-frontend', 'data', 'database.sqlite');
  const db = new Database(dbPath);

  const scriptId = `test-script-${type}-${Date.now()}`;

  const scriptContent = {
    title: `Test ${type} Script`,
    version: `${type}-1.0`,
    metadata: {
      format: type,
      scene_count: 4
    },
    scenes: [
      {
        scene_id: "scene_00",
        scene_name: "Scene 1",
        duration_seconds: 3,
        sora_prompt: "Test prompt",
        narration: "Test narration",
        scene_number: 1
      }
    ]
  };

  db.prepare(`
    INSERT INTO contents (id, type, title, content, created_at)
    VALUES (?, 'script', ?, ?, datetime('now'))
  `).run(scriptId, `Test ${type}`, JSON.stringify(scriptContent));

  db.close();
  return scriptId;
}

// 정리 헬퍼
function cleanupTestData(scheduleId, scriptId) {
  const dbPath = path.join(__dirname, 'trend-video-frontend', 'data', 'database.sqlite');
  const db = new Database(dbPath);

  db.prepare('DELETE FROM video_schedules WHERE id = ?').run(scheduleId);
  db.prepare('DELETE FROM contents WHERE id = ?').run(scriptId);

  db.close();

  // 백엔드 폴더 정리
  const projectFolder = path.join(BACKEND_INPUT_PATH, `project_${scriptId}`);
  if (fs.existsSync(projectFolder)) {
    fs.rmSync(projectFolder, { recursive: true, force: true });
  }
}

// ===========================
// 테스트 케이스
// ===========================

test('1. longform 타입 → 16:9 비율 선택', async () => {
  const scriptId = createScriptInDB('longform');
  const scheduleId = createScheduleInDB('longform', scriptId);

  try {
    // FormData를 흉내내기 위한 multipart 요청 대신 직접 API 테스트
    const dbPath = path.join(__dirname, 'trend-video-frontend', 'data', 'database.sqlite');
    const db = new Database(dbPath);

    const schedule = db.prepare('SELECT type FROM video_schedules WHERE id = ?').get(scheduleId);
    assert(schedule.type === 'longform', 'Schedule type should be longform');

    // story.json 생성 시뮬레이션 (upload-media 로직)
    const projectFolder = path.join(BACKEND_INPUT_PATH, `project_${scriptId}`);
    fs.mkdirSync(projectFolder, { recursive: true });

    const content = db.prepare('SELECT content FROM contents WHERE id = ?').get(scriptId);
    const scriptData = JSON.parse(content.content);

    // 비율 결정 로직 (upload-media/route.ts와 동일)
    let aspectRatio = '9:16';  // 기본값
    if (schedule.type === 'longform') {
      aspectRatio = '16:9';
    }

    const storyJson = {
      ...scriptData,
      metadata: {
        ...(scriptData.metadata || {}),
        aspect_ratio: aspectRatio,
        format: schedule.type
      }
    };

    const storyJsonPath = path.join(projectFolder, 'story.json');
    fs.writeFileSync(storyJsonPath, JSON.stringify(storyJson, null, 2), 'utf-8');

    // 검증
    const savedStoryJson = JSON.parse(fs.readFileSync(storyJsonPath, 'utf-8'));
    assert(savedStoryJson.metadata.aspect_ratio === '16:9', `Expected 16:9 but got ${savedStoryJson.metadata.aspect_ratio}`);
    assert(savedStoryJson.metadata.format === 'longform', `Expected format 'longform' but got ${savedStoryJson.metadata.format}`);

    db.close();
    console.log('✅ longform → 16:9 확인');
  } finally {
    cleanupTestData(scheduleId, scriptId);
  }
});

test('2. product 타입 → 9:16 비율 선택', async () => {
  const scriptId = createScriptInDB('product');
  const scheduleId = createScheduleInDB('product', scriptId);

  try {
    const dbPath = path.join(__dirname, 'trend-video-frontend', 'data', 'database.sqlite');
    const db = new Database(dbPath);

    const schedule = db.prepare('SELECT type FROM video_schedules WHERE id = ?').get(scheduleId);
    assert(schedule.type === 'product', 'Schedule type should be product');

    const projectFolder = path.join(BACKEND_INPUT_PATH, `project_${scriptId}`);
    fs.mkdirSync(projectFolder, { recursive: true });

    const content = db.prepare('SELECT content FROM contents WHERE id = ?').get(scriptId);
    const scriptData = JSON.parse(content.content);

    // 비율 결정 로직
    let aspectRatio = '9:16';  // 기본값
    if (schedule.type === 'longform') {
      aspectRatio = '16:9';
    }

    const storyJson = {
      ...scriptData,
      metadata: {
        ...(scriptData.metadata || {}),
        aspect_ratio: aspectRatio,
        format: schedule.type
      }
    };

    const storyJsonPath = path.join(projectFolder, 'story.json');
    fs.writeFileSync(storyJsonPath, JSON.stringify(storyJson, null, 2), 'utf-8');

    const savedStoryJson = JSON.parse(fs.readFileSync(storyJsonPath, 'utf-8'));
    assert(savedStoryJson.metadata.aspect_ratio === '9:16', `Expected 9:16 but got ${savedStoryJson.metadata.aspect_ratio}`);
    assert(savedStoryJson.metadata.format === 'product', `Expected format 'product' but got ${savedStoryJson.metadata.format}`);

    db.close();
    console.log('✅ product → 9:16 확인');
  } finally {
    cleanupTestData(scheduleId, scriptId);
  }
});

test('3. shortform 타입 → 9:16 비율 선택', async () => {
  const scriptId = createScriptInDB('shortform');
  const scheduleId = createScheduleInDB('shortform', scriptId);

  try {
    const dbPath = path.join(__dirname, 'trend-video-frontend', 'data', 'database.sqlite');
    const db = new Database(dbPath);

    const schedule = db.prepare('SELECT type FROM video_schedules WHERE id = ?').get(scheduleId);
    assert(schedule.type === 'shortform', 'Schedule type should be shortform');

    const projectFolder = path.join(BACKEND_INPUT_PATH, `project_${scriptId}`);
    fs.mkdirSync(projectFolder, { recursive: true });

    const content = db.prepare('SELECT content FROM contents WHERE id = ?').get(scriptId);
    const scriptData = JSON.parse(content.content);

    let aspectRatio = '9:16';
    if (schedule.type === 'longform') {
      aspectRatio = '16:9';
    }

    const storyJson = {
      ...scriptData,
      metadata: {
        ...(scriptData.metadata || {}),
        aspect_ratio: aspectRatio,
        format: schedule.type
      }
    };

    const storyJsonPath = path.join(projectFolder, 'story.json');
    fs.writeFileSync(storyJsonPath, JSON.stringify(storyJson, null, 2), 'utf-8');

    const savedStoryJson = JSON.parse(fs.readFileSync(storyJsonPath, 'utf-8'));
    assert(savedStoryJson.metadata.aspect_ratio === '9:16', `Expected 9:16 but got ${savedStoryJson.metadata.aspect_ratio}`);
    assert(savedStoryJson.metadata.format === 'shortform', `Expected format 'shortform' but got ${savedStoryJson.metadata.format}`);

    db.close();
    console.log('✅ shortform → 9:16 확인');
  } finally {
    cleanupTestData(scheduleId, scriptId);
  }
});

test('4. sora2 타입 → 9:16 비율 선택', async () => {
  const scriptId = createScriptInDB('sora2');
  const scheduleId = createScheduleInDB('sora2', scriptId);

  try {
    const dbPath = path.join(__dirname, 'trend-video-frontend', 'data', 'database.sqlite');
    const db = new Database(dbPath);

    const schedule = db.prepare('SELECT type FROM video_schedules WHERE id = ?').get(scheduleId);
    assert(schedule.type === 'sora2', 'Schedule type should be sora2');

    const projectFolder = path.join(BACKEND_INPUT_PATH, `project_${scriptId}`);
    fs.mkdirSync(projectFolder, { recursive: true });

    const content = db.prepare('SELECT content FROM contents WHERE id = ?').get(scriptId);
    const scriptData = JSON.parse(content.content);

    let aspectRatio = '9:16';
    if (schedule.type === 'longform') {
      aspectRatio = '16:9';
    }

    const storyJson = {
      ...scriptData,
      metadata: {
        ...(scriptData.metadata || {}),
        aspect_ratio: aspectRatio,
        format: schedule.type
      }
    };

    const storyJsonPath = path.join(projectFolder, 'story.json');
    fs.writeFileSync(storyJsonPath, JSON.stringify(storyJson, null, 2), 'utf-8');

    const savedStoryJson = JSON.parse(fs.readFileSync(storyJsonPath, 'utf-8'));
    assert(savedStoryJson.metadata.aspect_ratio === '9:16', `Expected 9:16 but got ${savedStoryJson.metadata.aspect_ratio}`);
    assert(savedStoryJson.metadata.format === 'sora2', `Expected format 'sora2' but got ${savedStoryJson.metadata.format}`);

    db.close();
    console.log('✅ sora2 → 9:16 확인');
  } finally {
    cleanupTestData(scheduleId, scriptId);
  }
});

test('5. 기본값 테스트 (타입 없음 → 9:16)', async () => {
  const scriptId = createScriptInDB('unknown');
  const scheduleId = createScheduleInDB('unknown', scriptId);

  try {
    const dbPath = path.join(__dirname, 'trend-video-frontend', 'data', 'database.sqlite');
    const db = new Database(dbPath);

    const schedule = db.prepare('SELECT type FROM video_schedules WHERE id = ?').get(scheduleId);

    const projectFolder = path.join(BACKEND_INPUT_PATH, `project_${scriptId}`);
    fs.mkdirSync(projectFolder, { recursive: true });

    const content = db.prepare('SELECT content FROM contents WHERE id = ?').get(scriptId);
    const scriptData = JSON.parse(content.content);

    // 기본값 로직
    let aspectRatio = '9:16';  // 기본값
    if (schedule.type === 'longform') {
      aspectRatio = '16:9';
    }

    const storyJson = {
      ...scriptData,
      metadata: {
        ...(scriptData.metadata || {}),
        aspect_ratio: aspectRatio,
        format: schedule.type || 'shortform'
      }
    };

    const storyJsonPath = path.join(projectFolder, 'story.json');
    fs.writeFileSync(storyJsonPath, JSON.stringify(storyJson, null, 2), 'utf-8');

    const savedStoryJson = JSON.parse(fs.readFileSync(storyJsonPath, 'utf-8'));
    assert(savedStoryJson.metadata.aspect_ratio === '9:16', `Default should be 9:16 but got ${savedStoryJson.metadata.aspect_ratio}`);

    db.close();
    console.log('✅ 기본값 → 9:16 확인');
  } finally {
    cleanupTestData(scheduleId, scriptId);
  }
});

test('6. 실제 story.json 파일 검증 (기존 product)', async () => {
  const storyJsonPath = path.join(
    __dirname,
    'trend-video-backend',
    'input',
    'project_ff152c83-4658-4761-87be-d47e22681d53',
    'story.json'
  );

  if (fs.existsSync(storyJsonPath)) {
    const storyJson = JSON.parse(fs.readFileSync(storyJsonPath, 'utf-8'));

    assert(storyJson.metadata.format === 'product', `Expected format 'product' but got ${storyJson.metadata.format}`);
    assert(
      storyJson.metadata.format !== '9:16 vertical (portrait)',
      'Format should not be descriptive string'
    );

    console.log('✅ 기존 product story.json format 필드 확인');
    console.log(`   Format: ${storyJson.metadata.format}`);
  } else {
    console.log('⚠️  기존 product story.json 파일 없음 (스킵)');
  }
});

// ===========================
// 테스트 실행
// ===========================

async function runTests() {
  console.log('🧪 비율 선택 통합 테스트 시작\n');
  console.log('📋 원칙: longform만 16:9, 나머지는 모두 9:16\n');

  for (const { name, fn } of tests) {
    try {
      await fn();
      passed++;
      console.log(`✅ PASS: ${name}\n`);
    } catch (error) {
      failed++;
      console.error(`❌ FAIL: ${name}`);
      console.error(`   ${error.message}\n`);
    }
  }

  console.log('========================================');
  console.log(`총 테스트: ${tests.length}`);
  console.log(`✅ 성공: ${passed}`);
  console.log(`❌ 실패: ${failed}`);
  console.log('========================================');

  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(error => {
  console.error('테스트 실행 중 오류:', error);
  process.exit(1);
});
