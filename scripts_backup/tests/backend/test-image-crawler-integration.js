/**
 * 이미지 크롤러 통합 테스트
 *
 * 테스트 시나리오:
 * 1. 테스트용 씬 데이터 생성 (8개 씬)
 * 2. 큐에 이미지 크롤링 작업 등록
 * 3. 워커가 작업을 처리하도록 대기
 * 4. 모든 씬에 대해 이미지가 저장되었는지 검증
 *
 * 예상 결과:
 * - 8개 씬 → 8개 이미지 파일 생성
 * - 파일명: scene_01.png, scene_02.png, ..., scene_08.png
 * - 모든 파일이 project_test_TIMESTAMP 폴더에 저장
 */

const path = require('path');
const fs = require('fs');

// 경로 설정
const WORKSPACE_PATH = path.join(__dirname, '..', '..', '..');
const FRONTEND_PATH = path.join(WORKSPACE_PATH, 'trend-video-frontend');
const BACKEND_PATH = path.join(WORKSPACE_PATH, 'trend-video-backend');
const DB_PATH = path.join(FRONTEND_PATH, 'data', 'database.sqlite');

// better-sqlite3를 프론트엔드 node_modules에서 로드
const Database = require(path.join(FRONTEND_PATH, 'node_modules', 'better-sqlite3'));

// 테스트 결과
let testResults = {
  passed: 0,
  failed: 0,
  tests: []
};

function addTestResult(name, passed, message) {
  testResults.tests.push({ name, passed, message });
  if (passed) {
    testResults.passed++;
    console.log(`✅ ${name}: ${message}`);
  } else {
    testResults.failed++;
    console.error(`❌ ${name}: ${message}`);
  }
}

// 테스트 씬 데이터 생성
function generateTestScenes(count = 8) {
  const scenes = [];
  for (let i = 1; i <= count; i++) {
    scenes.push({
      scene_number: i,
      scene_id: `scene_${String(i).padStart(2, '0')}`,
      narration: `씬 ${i}의 나레이션 내용입니다.`,
      image_prompt: `A professional photograph of scene ${i}, high quality, realistic, safe for work`,
      duration: 5.0
    });
  }
  return scenes;
}

// 프로젝트 폴더 생성
function createProjectFolder(scriptId) {
  const projectDir = path.join(BACKEND_PATH, 'input', `project_${scriptId}`);

  // 기존 폴더 삭제
  if (fs.existsSync(projectDir)) {
    fs.rmSync(projectDir, { recursive: true, force: true });
    console.log(`🗑️  기존 프로젝트 폴더 삭제: ${projectDir}`);
  }

  // 새 폴더 생성
  fs.mkdirSync(projectDir, { recursive: true });
  console.log(`📁 프로젝트 폴더 생성: ${projectDir}`);

  return projectDir;
}

// story.json 생성
function createStoryJson(projectDir, scenes) {
  const storyJson = {
    title: "이미지 크롤러 통합 테스트",
    metadata: {
      format: "shortform",
      aspect_ratio: "9:16"
    },
    scenes: scenes
  };

  const storyPath = path.join(projectDir, 'story.json');
  fs.writeFileSync(storyPath, JSON.stringify(storyJson, null, 2), 'utf-8');
  console.log(`📝 story.json 생성 완료: ${storyPath}`);

  return storyPath;
}

// 큐에 작업 등록
async function enqueueImageCrawlingTask(scriptId, scenes) {
  console.log(`\n📤 큐에 이미지 크롤링 작업 등록 중...`);

  // QueueManager를 import하여 테이블 초기화
  const QueueManagerPath = path.join(FRONTEND_PATH, 'src', 'lib', 'queue-manager.ts');
  // QueueManager는 TypeScript이므로 직접 require 불가
  // 대신 직접 테이블 생성
  const db = new Database(DB_PATH);

  // queue_tasks 테이블 생성
  db.exec(`
    CREATE TABLE IF NOT EXISTS queue_tasks (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL CHECK(type IN ('script', 'image', 'video')),
      status TEXT NOT NULL CHECK(status IN ('waiting', 'processing', 'completed', 'failed')),
      priority INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      started_at TEXT,
      completed_at TEXT,
      user_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      metadata TEXT,
      logs TEXT,
      error TEXT,
      retry_count INTEGER DEFAULT 0,
      max_retries INTEGER DEFAULT 3
    );

    CREATE TABLE IF NOT EXISTS queue_locks (
      task_type TEXT PRIMARY KEY CHECK(task_type IN ('script', 'image', 'video')),
      locked_by TEXT,
      locked_at TEXT,
      worker_pid INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_queue_tasks_status ON queue_tasks(status);
    CREATE INDEX IF NOT EXISTS idx_queue_tasks_type ON queue_tasks(type);
    CREATE INDEX IF NOT EXISTS idx_queue_tasks_created ON queue_tasks(created_at);
  `);

  const taskId = `task_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
  const now = new Date().toISOString();

  const metadata = JSON.stringify({
    scenes: scenes,
    useImageFX: false,
    scheduleId: `test_schedule_${Date.now()}`,
    titleId: `test_title_${Date.now()}`,
    format: 'shortform'
  });

  db.prepare(`
    INSERT INTO queue_tasks (
      id, type, status, priority, created_at,
      user_id, project_id, metadata, logs, retry_count, max_retries
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    taskId,
    'image',
    'waiting',
    0,
    now,
    'test_user',
    scriptId,
    metadata,
    JSON.stringify([]),
    0,
    3
  );

  db.close();

  console.log(`✅ 큐 작업 등록 완료: ${taskId}`);
  return taskId;
}

// 작업 상태 확인
function checkTaskStatus(taskId) {
  const db = new Database(DB_PATH);

  const task = db.prepare(`
    SELECT id, status, error, completed_at
    FROM queue_tasks
    WHERE id = ?
  `).get(taskId);

  db.close();

  return task;
}

// 작업 완료 대기
async function waitForTaskCompletion(taskId, maxWaitSeconds = 300) {
  console.log(`\n⏳ 작업 완료 대기 중 (최대 ${maxWaitSeconds}초)...`);

  const startTime = Date.now();
  const maxWaitMs = maxWaitSeconds * 1000;

  while (true) {
    const task = checkTaskStatus(taskId);

    if (!task) {
      throw new Error(`작업을 찾을 수 없습니다: ${taskId}`);
    }

    console.log(`   상태: ${task.status}`);

    if (task.status === 'completed') {
      console.log(`✅ 작업 완료! (완료 시각: ${task.completed_at})`);
      return true;
    }

    if (task.status === 'failed') {
      console.error(`❌ 작업 실패: ${task.error || '알 수 없는 오류'}`);
      return false;
    }

    // 타임아웃 체크
    const elapsed = Date.now() - startTime;
    if (elapsed > maxWaitMs) {
      throw new Error(`타임아웃: ${maxWaitSeconds}초 내에 완료되지 않았습니다.`);
    }

    // 5초 대기
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
}

// 이미지 파일 검증
function verifyImages(projectDir, expectedCount) {
  console.log(`\n🔍 이미지 파일 검증 중...`);
  console.log(`   폴더: ${projectDir}`);
  console.log(`   예상 파일 개수: ${expectedCount}개`);

  const results = {
    success: true,
    foundFiles: [],
    missingFiles: [],
    details: []
  };

  // 폴더 존재 확인
  if (!fs.existsSync(projectDir)) {
    results.success = false;
    results.details.push(`❌ 프로젝트 폴더가 존재하지 않습니다: ${projectDir}`);
    return results;
  }

  // 예상 파일명 목록 생성
  const expectedFiles = [];
  for (let i = 1; i <= expectedCount; i++) {
    const sceneNumber = String(i).padStart(2, '0');
    expectedFiles.push(`scene_${sceneNumber}.png`);
    expectedFiles.push(`scene_${sceneNumber}.jpg`);
    expectedFiles.push(`scene_${sceneNumber}.jpeg`);
    expectedFiles.push(`scene_${sceneNumber}.webp`);
  }

  // 실제 이미지 파일 찾기
  const files = fs.readdirSync(projectDir);
  const imageFiles = files.filter(f => /\.(png|jpg|jpeg|webp)$/i.test(f));

  console.log(`   실제 파일 개수: ${imageFiles.length}개`);
  console.log(`   발견된 파일:`);
  imageFiles.forEach(f => {
    const filePath = path.join(projectDir, f);
    const stats = fs.statSync(filePath);
    console.log(`     - ${f} (${stats.size} bytes)`);
  });

  // 씬별로 검증
  for (let i = 1; i <= expectedCount; i++) {
    const sceneNumber = String(i).padStart(2, '0');
    const possibleNames = [
      // 기능목록.md 형식: scene_01_image.png
      `scene_${sceneNumber}_image.png`,
      `scene_${sceneNumber}_image.jpg`,
      `scene_${sceneNumber}_image.jpeg`,
      `scene_${sceneNumber}_image.webp`,
      // scene_01.png 형식
      `scene_${sceneNumber}.png`,
      `scene_${sceneNumber}.jpg`,
      `scene_${sceneNumber}.jpeg`,
      `scene_${sceneNumber}.webp`,
      // 01.png 형식
      `${sceneNumber}.png`,
      `${sceneNumber}.jpg`,
      `${sceneNumber}.jpeg`,
      `${sceneNumber}.webp`,
      // 숫자만: 1.png (scene_number가 정수인 경우)
      `${i}.png`,
      `${i}.jpg`,
      `${i}.jpeg`,
      `${i}.webp`
    ];

    const found = imageFiles.find(f => possibleNames.includes(f));

    if (found) {
      results.foundFiles.push(found);
      results.details.push(`✅ 씬 ${i}: ${found}`);
    } else {
      results.success = false;
      results.missingFiles.push(`scene_${sceneNumber}`);
      results.details.push(`❌ 씬 ${i}: 이미지 없음`);
    }
  }

  return results;
}

// 메인 테스트 실행
async function runIntegrationTest() {
  console.log('🧪 이미지 크롤러 통합 테스트 시작');
  console.log('='.repeat(80));

  const scriptId = `test_${Date.now()}`;
  let projectDir;
  let taskId;

  try {
    // Step 1: 테스트 데이터 생성
    console.log('\n📋 Step 1: 테스트 데이터 생성');
    console.log('-'.repeat(80));

    const scenes = generateTestScenes(8);
    console.log(`✅ 8개 씬 데이터 생성 완료`);
    addTestResult('1-1. 씬 데이터 생성', true, '8개 씬 생성');

    // Step 2: 프로젝트 폴더 및 story.json 생성
    console.log('\n📁 Step 2: 프로젝트 폴더 생성');
    console.log('-'.repeat(80));

    projectDir = createProjectFolder(scriptId);
    createStoryJson(projectDir, scenes);
    addTestResult('2-1. 프로젝트 폴더 생성', true, `project_${scriptId}`);

    // Step 3: 큐에 작업 등록
    console.log('\n📤 Step 3: 큐에 작업 등록');
    console.log('-'.repeat(80));

    taskId = await enqueueImageCrawlingTask(scriptId, scenes);
    addTestResult('3-1. 큐 작업 등록', true, taskId);

    // Step 4: 워커 실행 확인
    console.log('\n🔍 Step 4: 워커 상태 확인');
    console.log('-'.repeat(80));
    console.log('⚠️  워커가 실행 중이어야 합니다!');
    console.log('   실행 명령: npm run worker:image');
    console.log('   또는: node trend-video-frontend/src/workers/image-worker.ts');

    // Step 5: 작업 완료 대기
    console.log('\n⏳ Step 5: 작업 완료 대기');
    console.log('-'.repeat(80));

    const success = await waitForTaskCompletion(taskId, 300);
    addTestResult('5-1. 작업 완료', success, success ? '정상 완료' : '실패');

    if (!success) {
      throw new Error('이미지 크롤링 작업이 실패했습니다.');
    }

    // Step 6: 이미지 파일 검증
    console.log('\n🔍 Step 6: 이미지 파일 검증');
    console.log('-'.repeat(80));

    // 3초 대기 (파일 시스템 동기화)
    await new Promise(resolve => setTimeout(resolve, 3000));

    const verifyResults = verifyImages(projectDir, 8);

    console.log('\n📊 검증 결과:');
    verifyResults.details.forEach(detail => console.log(`   ${detail}`));

    if (verifyResults.success) {
      addTestResult('6-1. 이미지 파일 검증', true, `8개 파일 모두 존재`);
      console.log(`\n✅ 모든 이미지가 정상적으로 저장되었습니다!`);
      console.log(`   저장된 파일: ${verifyResults.foundFiles.join(', ')}`);
    } else {
      addTestResult('6-1. 이미지 파일 검증', false, `${verifyResults.missingFiles.length}개 파일 누락`);
      console.error(`\n❌ 일부 이미지가 누락되었습니다!`);
      console.error(`   누락된 씬: ${verifyResults.missingFiles.join(', ')}`);
    }

  } catch (error) {
    console.error(`\n❌ 테스트 실행 중 오류 발생:`, error);
    addTestResult('테스트 실행', false, error.message);
  }

  // 결과 요약
  console.log('\n' + '='.repeat(80));
  console.log('📊 테스트 결과 요약');
  console.log('='.repeat(80));
  console.log(`✅ 통과: ${testResults.passed}/${testResults.tests.length}`);
  console.log(`❌ 실패: ${testResults.failed}/${testResults.tests.length}`);

  const percentage = ((testResults.passed / testResults.tests.length) * 100).toFixed(1);
  console.log(`📈 성공률: ${percentage}%`);

  if (testResults.failed === 0) {
    console.log('\n🎉 모든 테스트 통과!');
  } else {
    console.log('\n❌ 일부 테스트 실패');
    console.log('\n실패 항목:');
    testResults.tests.filter(t => !t.passed).forEach(t => {
      console.log(`  - ${t.name}: ${t.message}`);
    });
  }

  // 정리 여부 확인
  if (projectDir && fs.existsSync(projectDir)) {
    console.log(`\n🗑️  테스트 데이터 정리:`);
    console.log(`   프로젝트 폴더: ${projectDir}`);
    console.log(`   수동 삭제 필요 시: rm -rf "${projectDir}"`);
  }

  process.exit(testResults.failed === 0 ? 0 : 1);
}

// 실행
runIntegrationTest().catch(error => {
  console.error('❌ 예상치 못한 오류:', error);
  process.exit(1);
});
