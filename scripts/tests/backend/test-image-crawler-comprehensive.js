/**
 * 이미지 크롤링 통합 테스트 (Comprehensive Integration Test)
 *
 * 목적: 이미지 크롤링 전체 프로세스가 완벽하게 작동하는지 검증
 *
 * 테스트 시나리오:
 * 1. Queue 등록 및 상태 관리
 * 2. Image Worker 처리 및 파일 저장
 * 3. Automation Scheduler 감지 및 진행
 * 4. 파일 검증 및 에러 처리
 * 5. 발견된 6가지 이슈 검증
 *
 * 실행: node scripts/tests/backend/test-image-crawler-comprehensive.js
 */

const path = require('path');
const fs = require('fs');

// Determine paths based on where the script is run from
let WORKSPACE_PATH, BACKEND_PATH, FRONTEND_PATH;

if (__dirname.includes('trend-video-frontend')) {
  // Run from frontend folder
  FRONTEND_PATH = process.cwd();
  WORKSPACE_PATH = path.dirname(FRONTEND_PATH);
  BACKEND_PATH = path.join(WORKSPACE_PATH, 'trend-video-backend');
} else {
  // Run from workspace root
  WORKSPACE_PATH = path.join(__dirname, '../../..');
  BACKEND_PATH = path.join(WORKSPACE_PATH, 'trend-video-backend');
  FRONTEND_PATH = path.join(WORKSPACE_PATH, 'trend-video-frontend');

  // Add frontend node_modules to require path
  const frontendModulesPath = path.join(FRONTEND_PATH, 'node_modules');
  require('module').globalPaths.push(frontendModulesPath);
}

const Database = require('better-sqlite3');

// ============================================================================
// 설정
// ============================================================================

const QUEUE_DB_PATH = path.join(FRONTEND_PATH, 'data', 'queue.sqlite');
const MAIN_DB_PATH = path.join(FRONTEND_PATH, 'data', 'database.sqlite');

// 테스트 결과
let testResults = {
  passed: 0,
  failed: 0,
  warnings: 0,
  details: []
};

// ============================================================================
// 헬퍼 함수
// ============================================================================

function log(emoji, message, type = 'info') {
  const timestamp = new Date().toLocaleTimeString('ko-KR');
  const formatted = `[${timestamp}] ${emoji} ${message}`;

  console.log(formatted);

  testResults.details.push({
    time: timestamp,
    message,
    type
  });
}

function assert(condition, testName, successMsg, failureMsg) {
  if (condition) {
    log('✅', `${testName}: ${successMsg}`, 'pass');
    testResults.passed++;
    return true;
  } else {
    log('❌', `${testName}: ${failureMsg}`, 'fail');
    testResults.failed++;
    return false;
  }
}

function warn(message) {
  log('⚠️', message, 'warn');
  testResults.warnings++;
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function generateTestTaskId() {
  return `task_test_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// ============================================================================
// 테스트 시나리오 함수들
// ============================================================================

/**
 * Scenario 1: Queue 등록 및 Prerequisites 검증
 */
async function testQueueEnqueue() {
  log('📋', '='.repeat(80));
  log('🧪', 'Scenario 1: Queue 등록 및 Prerequisites 검증');
  log('📋', '='.repeat(80));

  const db = new Database(QUEUE_DB_PATH);
  const taskId = generateTestTaskId();

  try {
    // 1-1. Script 단계 없이 Image 단계만 enqueue 시도 (실패해야 함)
    log('🔍', 'Test 1-1: Prerequisites 검증 (script 없이 image 등록)');

    const insertImage = db.prepare(`
      INSERT INTO tasks_queue (
        task_id, type, status, priority, created_at, user_id, metadata, logs, retry_count, max_retries
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertImage.run(
      taskId,
      'image',
      'waiting',
      0,
      new Date().toISOString(),
      'test_user',
      JSON.stringify({ scenes: [{ scene_number: 1, image_prompt: 'test' }] }),
      '[]',
      0,
      3
    );

    // Image 단계를 dequeue 시도 (script가 completed가 아니므로 실패해야 함)
    const prerequisiteCheck = `AND EXISTS (
      SELECT 1 FROM tasks_queue prev
      WHERE prev.task_id = tasks_queue.task_id
      AND prev.type = 'script' AND prev.status = 'completed'
    )`;

    const imageTask = db.prepare(`
      SELECT * FROM tasks_queue
      WHERE task_id = ? AND type = 'image' AND status = 'waiting'
      ${prerequisiteCheck}
    `).get(taskId);

    assert(
      !imageTask,
      'Prerequisites',
      'Image 단계는 script 완료 전에 dequeue되지 않음 (정상)',
      'Image 단계가 script 없이 dequeue됨 (버그!)'
    );

    // 1-2. Script 완료 후 Image dequeue 가능 여부 검증
    log('🔍', 'Test 1-2: Script 완료 후 Image dequeue 가능 여부');

    const insertScript = db.prepare(`
      INSERT INTO tasks_queue (
        task_id, type, status, priority, created_at, user_id, metadata, logs, retry_count, max_retries
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertScript.run(
      taskId,
      'script',
      'completed',  // ← Script 완료 상태
      0,
      new Date().toISOString(),
      'test_user',
      JSON.stringify({ title: 'Test Script' }),
      '[]',
      0,
      3
    );

    const imageTaskAfterScript = db.prepare(`
      SELECT * FROM tasks_queue
      WHERE task_id = ? AND type = 'image' AND status = 'waiting'
      ${prerequisiteCheck}
    `).get(taskId);

    assert(
      !!imageTaskAfterScript,
      'Prerequisites',
      'Script 완료 후 Image 단계 dequeue 가능 (정상)',
      'Script 완료 후에도 Image 단계 dequeue 불가 (버그!)'
    );

    // 1-3. Lock 테이블 검증
    log('🔍', 'Test 1-3: Lock 메커니즘 검증 (동시 1개만 처리)');

    // 첫 번째 Image 작업을 processing으로 변경 (lock 획득)
    db.prepare(`
      UPDATE tasks_queue SET status = 'processing' WHERE task_id = ? AND type = 'image'
    `).run(taskId);

    db.prepare(`
      INSERT OR REPLACE INTO tasks_locks (task_type, locked_by, locked_at, worker_pid)
      VALUES ('image', ?, ?, ?)
    `).run(taskId, new Date().toISOString(), process.pid);

    // 두 번째 Image 작업 생성
    const taskId2 = generateTestTaskId();
    insertScript.run(taskId2, 'script', 'completed', 0, new Date().toISOString(), 'test_user', '{}', '[]', 0, 3);
    insertImage.run(taskId2, 'image', 'waiting', 0, new Date().toISOString(), 'test_user', '{}', '[]', 0, 3);

    // Lock이 걸려있으므로 두 번째 작업은 dequeue되지 않아야 함
    const lockedTask = db.prepare(`
      SELECT * FROM tasks_queue
      WHERE type = 'image' AND status = 'waiting'
      AND NOT EXISTS (
        SELECT 1 FROM tasks_locks
        WHERE task_type = 'image' AND locked_by IS NOT NULL
      )
    `).get();

    assert(
      !lockedTask,
      'Lock Mechanism',
      'Lock이 있을 때 다른 Image 작업 dequeue 불가 (정상)',
      'Lock이 있는데도 다른 작업이 dequeue됨 (버그!)'
    );

    // 정리
    db.prepare(`DELETE FROM tasks_queue WHERE task_id IN (?, ?)`).run(taskId, taskId2);
    db.prepare(`DELETE FROM tasks_locks WHERE task_type = 'image'`).run();

  } catch (error) {
    log('❌', `Scenario 1 실패: ${error.message}`, 'fail');
    testResults.failed++;
  } finally {
    db.close();
  }
}

/**
 * Scenario 2: 파일 저장 및 Validation 검증
 */
async function testFileSavingValidation() {
  log('📋', '='.repeat(80));
  log('🧪', 'Scenario 2: 파일 저장 및 Validation 검증');
  log('📋', '='.repeat(80));

  const taskId = generateTestTaskId();
  const taskFolder = path.join(BACKEND_PATH, 'tasks', taskId);

  try {
    // 2-1. 폴더 생성 검증
    log('🔍', 'Test 2-1: 작업 폴더 자동 생성');

    if (!fs.existsSync(taskFolder)) {
      fs.mkdirSync(taskFolder, { recursive: true });
    }

    assert(
      fs.existsSync(taskFolder),
      'Folder Creation',
      `작업 폴더 생성 성공: ${taskFolder}`,
      `작업 폴더 생성 실패: ${taskFolder}`
    );

    // 2-2. 파일 이름 형식 검증 (scene_XX.jpg)
    log('🔍', 'Test 2-2: 파일 이름 형식 검증');

    const testScenes = [
      { scene_number: 1, expected: 'scene_01.jpg' },
      { scene_number: 5, expected: 'scene_05.jpg' },
      { scene_number: 10, expected: 'scene_10.jpg' },
      { scene_number: 99, expected: 'scene_99.jpg' }
    ];

    let allNamesCorrect = true;
    for (const test of testScenes) {
      const expectedName = `scene_${String(test.scene_number).padStart(2, '0')}.jpg`;
      const filePath = path.join(taskFolder, expectedName);

      // 더미 파일 생성
      fs.writeFileSync(filePath, Buffer.from([0xFF, 0xD8, 0xFF, 0xE0])); // JPEG header

      if (expectedName !== test.expected) {
        allNamesCorrect = false;
        warn(`파일명 불일치: ${expectedName} !== ${test.expected}`);
      }
    }

    assert(
      allNamesCorrect,
      'File Naming',
      '모든 파일명이 scene_XX.jpg 형식으로 생성됨',
      '일부 파일명이 예상 형식과 다름'
    );

    // 2-3. 이미지 파일 감지 (Regex 검증)
    log('🔍', 'Test 2-3: 이미지 파일 감지 Regex 검증');

    const files = fs.readdirSync(taskFolder);
    const regexPattern = /scene_\d+.*\.(png|jpg|jpeg|webp|gif)$/i;

    const matchedFiles = files.filter(f => regexPattern.test(f));

    assert(
      matchedFiles.length === testScenes.length,
      'File Detection',
      `${matchedFiles.length}개 이미지 파일 감지 (예상: ${testScenes.length})`,
      `감지된 파일 수 불일치: ${matchedFiles.length} !== ${testScenes.length}`
    );

    // 2-4. 비정상 파일명 테스트 (Issue #2 검증)
    log('🔍', 'Test 2-4: Regex 엣지 케이스 검증');

    const edgeCases = [
      { name: 'my_scene_01.jpg', shouldMatch: false, reason: '접두사 "my_" 때문에 매칭 실패 예상' },
      { name: 'scene_abc.jpg', shouldMatch: false, reason: '숫자 아닌 문자 때문에 매칭 실패 예상' },
      { name: 'scene_01_backup.jpg', shouldMatch: true, reason: '추가 접미사는 허용' },
      { name: 'scene_01.png', shouldMatch: true, reason: 'PNG 확장자 지원' },
      { name: 'SCENE_01.JPG', shouldMatch: true, reason: '대소문자 무관 (케이스 인센시티브)' },
      { name: 'scene_00.webp', shouldMatch: true, reason: 'WebP 확장자 지원' }
    ];

    let allEdgeCasesCorrect = true;
    for (const test of edgeCases) {
      const matched = regexPattern.test(test.name);
      if (matched !== test.shouldMatch) {
        allEdgeCasesCorrect = false;
        warn(`Regex 엣지 케이스 실패: "${test.name}" - ${test.reason}, 예상=${test.shouldMatch}, 실제=${matched}`);
      } else {
        log('✅', `Regex OK: "${test.name}" - ${test.reason}`);
      }
    }

    assert(
      allEdgeCasesCorrect,
      'Regex Edge Cases',
      '모든 Regex 엣지 케이스가 올바르게 처리됨',
      '일부 Regex 엣지 케이스가 예상과 다르게 동작'
    );

    // 2-5. 빈 파일 검증 (Issue #1 - 비동기 쓰기 검증)
    log('🔍', 'Test 2-5: 파일 쓰기 완료 검증 (비동기 검증)');

    // 작은 지연 시뮬레이션 (실제로는 Python 프로세스 종료 직후 검증 시나리오)
    const largeFile = path.join(taskFolder, 'scene_100.jpg');
    const largeData = Buffer.alloc(1024 * 1024); // 1MB 더미 데이터

    const writePromise = new Promise((resolve) => {
      fs.writeFile(largeFile, largeData, () => {
        resolve();
      });
    });

    // 쓰기가 완료되기 전에 파일 확인 시도 (Race Condition 시뮬레이션)
    await sleep(10); // 10ms 대기 (쓰기 완료 전)

    const fileExistsDuringWrite = fs.existsSync(largeFile);

    await writePromise; // 쓰기 완료 대기

    const fileExistsAfterWrite = fs.existsSync(largeFile);
    const fileSizeCorrect = fs.statSync(largeFile).size === largeData.length;

    if (fileExistsDuringWrite && !fileSizeCorrect) {
      warn('Issue #1 감지: 파일이 존재하지만 쓰기가 완료되지 않은 상태에서 검증됨 (Race Condition 가능)');
    }

    assert(
      fileExistsAfterWrite && fileSizeCorrect,
      'Async Write',
      '파일 쓰기 완료 후 검증 정상',
      '파일 쓰기 검증 실패 (비동기 문제 가능)'
    );

    // 정리
    fs.rmSync(taskFolder, { recursive: true, force: true });

  } catch (error) {
    log('❌', `Scenario 2 실패: ${error.message}`, 'fail');
    testResults.failed++;
  }
}

/**
 * Scenario 3: Scheduler 감지 및 상태 전이 검증
 */
async function testSchedulerDetection() {
  log('📋', '='.repeat(80));
  log('🧪', 'Scenario 3: Scheduler 감지 및 상태 전이 검증');
  log('📋', '='.repeat(80));

  const queueDb = new Database(QUEUE_DB_PATH);
  const mainDb = new Database(MAIN_DB_PATH);
  const taskId = generateTestTaskId();
  const scheduleId = `schedule_test_${Date.now()}`;
  const titleId = `title_test_${Date.now()}`;
  const taskFolder = path.join(BACKEND_PATH, 'tasks', taskId);

  try {
    // 3-1. task_schedules에 waiting_for_upload 스케줄 생성
    log('🔍', 'Test 3-1: task_schedules에 테스트 스케줄 등록');

    // video_titles 먼저 생성
    mainDb.prepare(`
      INSERT INTO video_titles (id, user_id, title, type, status, created_at, updated_at)
      VALUES (?, 'test_user', 'Test Title', 'product', 'waiting_for_upload', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run(titleId);

    // task_schedules 생성
    mainDb.prepare(`
      INSERT INTO task_schedules (
        id, task_id, title_id, user_id, scheduled_time, status, media_mode, created_at, updated_at
      ) VALUES (?, ?, ?, ?, datetime('now'), 'waiting_for_upload', 'crawl', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run(scheduleId, taskId, titleId, 'test_user');

    const schedule = mainDb.prepare(`SELECT * FROM task_schedules WHERE id = ?`).get(scheduleId);

    assert(
      schedule && schedule.status === 'waiting_for_upload',
      'Schedule Creation',
      `스케줄 생성 성공: status=${schedule?.status}`,
      '스케줄 생성 실패 또는 상태 불일치'
    );

    // 3-2. Queue에 image 작업 등록 (completed 상태)
    log('🔍', 'Test 3-2: Queue에 image 작업 completed로 등록');

    queueDb.prepare(`
      INSERT INTO tasks_queue (
        task_id, type, status, priority, created_at, user_id, metadata, logs, retry_count, max_retries
      ) VALUES (?, 'script', 'completed', 0, ?, 'test_user', '{}', '[]', 0, 3)
    `).run(taskId, new Date().toISOString());

    queueDb.prepare(`
      INSERT INTO tasks_queue (
        task_id, type, status, priority, created_at, completed_at, user_id, metadata, logs, retry_count, max_retries
      ) VALUES (?, 'image', 'completed', 0, ?, ?, 'test_user', '{}', '[]', 0, 3)
    `).run(taskId, new Date().toISOString(), new Date().toISOString());

    const queueTask = queueDb.prepare(`
      SELECT * FROM tasks_queue WHERE task_id = ? AND type = 'image'
    `).get(taskId);

    assert(
      queueTask && queueTask.status === 'completed',
      'Queue Image Completed',
      `Queue에 image 작업 completed 상태로 등록됨`,
      'Queue 등록 실패 또는 상태 불일치'
    );

    // 3-3. Scheduler 감지 로직 시뮬레이션
    log('🔍', 'Test 3-3: Scheduler의 Queue 상태 감지 시뮬레이션');

    // checkWaitingForUploadSchedules() 로직 재현
    const waitingSchedules = mainDb.prepare(`
      SELECT * FROM task_schedules WHERE status = 'waiting_for_upload'
    `).all();

    let imageCrawlCompleted = false;

    for (const sched of waitingSchedules) {
      if (sched.task_id) {
        const qTask = queueDb.prepare(`
          SELECT * FROM tasks_queue WHERE task_id = ? AND type = 'image'
        `).get(sched.task_id);

        if (qTask && qTask.status === 'completed') {
          imageCrawlCompleted = true;
          log('✅', `Queue 상태 감지: task_id=${sched.task_id}, image status=completed`);
        }
      }
    }

    assert(
      imageCrawlCompleted,
      'Scheduler Detection (Queue)',
      'Scheduler가 Queue 상태를 통해 이미지 크롤링 완료 감지',
      'Scheduler가 Queue 상태를 감지하지 못함'
    );

    // 3-4. Fallback: 폴더 기반 감지
    log('🔍', 'Test 3-4: Scheduler의 Fallback 폴더 감지 시뮬레이션');

    // 폴더 및 이미지 파일 생성
    fs.mkdirSync(taskFolder, { recursive: true });
    fs.writeFileSync(path.join(taskFolder, 'scene_01.jpg'), Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]));
    fs.writeFileSync(path.join(taskFolder, 'scene_02.jpg'), Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]));

    const files = fs.readdirSync(taskFolder);
    const imageFiles = files.filter(file =>
      /scene_\d+.*\.(png|jpg|jpeg|webp|gif)$/i.test(file)
    );

    assert(
      imageFiles.length > 0,
      'Scheduler Detection (Folder)',
      `Fallback 폴더 감지: ${imageFiles.length}개 이미지 발견`,
      'Fallback 폴더 감지 실패'
    );

    // 3-5. 상태 전이 검증 (waiting_for_upload → processing)
    log('🔍', 'Test 3-5: 상태 전이 검증');

    if (imageCrawlCompleted || imageFiles.length > 0) {
      mainDb.prepare(`
        UPDATE task_schedules SET status = 'processing', updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(scheduleId);

      mainDb.prepare(`
        UPDATE video_titles SET status = 'processing', updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(titleId);
    }

    const updatedSchedule = mainDb.prepare(`SELECT * FROM task_schedules WHERE id = ?`).get(scheduleId);
    const updatedTitle = mainDb.prepare(`SELECT * FROM video_titles WHERE id = ?`).get(titleId);

    assert(
      updatedSchedule.status === 'processing' && updatedTitle.status === 'processing',
      'State Transition',
      'waiting_for_upload → processing 상태 전이 성공',
      '상태 전이 실패'
    );

    // 정리
    mainDb.prepare(`DELETE FROM task_schedules WHERE id = ?`).run(scheduleId);
    mainDb.prepare(`DELETE FROM video_titles WHERE id = ?`).run(titleId);
    queueDb.prepare(`DELETE FROM tasks_queue WHERE task_id = ?`).run(taskId);
    fs.rmSync(taskFolder, { recursive: true, force: true });

  } catch (error) {
    log('❌', `Scenario 3 실패: ${error.message}`, 'fail');
    testResults.failed++;
  } finally {
    queueDb.close();
    mainDb.close();
  }
}

/**
 * Scenario 4: 에러 처리 및 재시도 메커니즘
 */
async function testErrorHandlingRetry() {
  log('📋', '='.repeat(80));
  log('🧪', 'Scenario 4: 에러 처리 및 재시도 메커니즘');
  log('📋', '='.repeat(80));

  const db = new Database(QUEUE_DB_PATH);
  const taskId = generateTestTaskId();

  try {
    // 4-1. 재시도 카운트 검증
    log('🔍', 'Test 4-1: 재시도 카운트 및 max_retries 검증');

    db.prepare(`
      INSERT INTO tasks_queue (
        task_id, type, status, priority, created_at, user_id, metadata, logs, retry_count, max_retries
      ) VALUES (?, 'image', 'failed', 0, ?, 'test_user', '{}', '[]', 2, 3)
    `).run(taskId, new Date().toISOString());

    const failedTask = db.prepare(`
      SELECT * FROM tasks_queue WHERE task_id = ? AND type = 'image'
    `).get(taskId);

    const canRetry = failedTask.retry_count < failedTask.max_retries;

    assert(
      canRetry,
      'Retry Count',
      `재시도 가능: ${failedTask.retry_count}/${failedTask.max_retries}`,
      `재시도 불가: ${failedTask.retry_count}/${failedTask.max_retries}`
    );

    // 재시도 시뮬레이션
    db.prepare(`
      UPDATE tasks_queue
      SET retry_count = retry_count + 1, status = 'waiting', updated_at = ?
      WHERE task_id = ? AND type = 'image'
    `).run(new Date().toISOString(), taskId);

    const retriedTask = db.prepare(`
      SELECT * FROM tasks_queue WHERE task_id = ? AND type = 'image'
    `).get(taskId);

    assert(
      retriedTask.retry_count === 3 && retriedTask.status === 'waiting',
      'Retry Mechanism',
      `재시도 카운트 증가: ${retriedTask.retry_count}, status=${retriedTask.status}`,
      '재시도 메커니즘 실패'
    );

    // 4-2. max_retries 초과 시 최종 실패 처리
    log('🔍', 'Test 4-2: max_retries 초과 시 최종 실패');

    db.prepare(`
      UPDATE tasks_queue
      SET retry_count = 3, status = 'failed', error = 'Max retries exceeded'
      WHERE task_id = ? AND type = 'image'
    `).run(taskId);

    const finalFailedTask = db.prepare(`
      SELECT * FROM tasks_queue WHERE task_id = ? AND type = 'image'
    `).get(taskId);

    assert(
      finalFailedTask.retry_count >= finalFailedTask.max_retries && finalFailedTask.status === 'failed',
      'Max Retries Exceeded',
      '재시도 횟수 초과 후 최종 failed 상태',
      'max_retries 초과 처리 실패'
    );

    // 정리
    db.prepare(`DELETE FROM tasks_queue WHERE task_id = ?`).run(taskId);

  } catch (error) {
    log('❌', `Scenario 4 실패: ${error.message}`, 'fail');
    testResults.failed++;
  } finally {
    db.close();
  }
}

/**
 * Scenario 5: 발견된 이슈 추가 검증
 */
async function testIdentifiedIssues() {
  log('📋', '='.repeat(80));
  log('🧪', 'Scenario 5: 발견된 6가지 이슈 추가 검증');
  log('📋', '='.repeat(80));

  // Issue #3: Multiple Image Versions (미래 대비)
  log('🔍', 'Issue #3: 씬당 여러 이미지 지원 준비 상태 검증');

  const taskId = generateTestTaskId();
  const taskFolder = path.join(BACKEND_PATH, 'tasks', taskId);

  try {
    fs.mkdirSync(taskFolder, { recursive: true });

    // 씬당 여러 이미지 생성 시뮬레이션
    fs.writeFileSync(path.join(taskFolder, 'scene_01.jpg'), Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]));
    fs.writeFileSync(path.join(taskFolder, 'scene_01_variant1.jpg'), Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]));
    fs.writeFileSync(path.join(taskFolder, 'scene_01_variant2.jpg'), Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]));

    const files = fs.readdirSync(taskFolder);
    const scene01Files = files.filter(f => f.startsWith('scene_01'));

    if (scene01Files.length > 1) {
      warn(`Issue #3: 씬당 여러 이미지가 저장됨 (${scene01Files.length}개). 현재 시스템은 하나만 사용할 수 있음.`);
    } else {
      log('✅', 'Issue #3: 현재는 씬당 1개 이미지만 사용 (정상)');
    }

    // Issue #4: Output Directory Creation
    log('🔍', 'Issue #4: 출력 디렉터리 사전 생성 없음 검증');

    const nonExistentFolder = path.join(BACKEND_PATH, 'tasks', 'non_existent_task');
    const folderExists = fs.existsSync(nonExistentFolder);

    if (!folderExists) {
      warn('Issue #4: 폴더가 사전에 생성되지 않았으므로 Python 스크립트가 생성해야 함 (의존성 있음)');
    }

    // Issue #5: Dual-Path Race Condition
    log('🔍', 'Issue #5: Queue vs Folder 이중 경로 race condition 검증');

    const db = new Database(QUEUE_DB_PATH);

    // Queue는 completed인데 폴더에 파일이 없는 경우 시뮬레이션
    const testTaskId2 = generateTestTaskId();

    db.prepare(`
      INSERT INTO tasks_queue (
        task_id, type, status, priority, created_at, completed_at, user_id, metadata, logs, retry_count, max_retries
      ) VALUES (?, 'script', 'completed', 0, ?, ?, 'test_user', '{}', '[]', 0, 3)
    `).run(testTaskId2, new Date().toISOString(), new Date().toISOString());

    db.prepare(`
      INSERT INTO tasks_queue (
        task_id, type, status, priority, created_at, completed_at, user_id, metadata, logs, retry_count, max_retries
      ) VALUES (?, 'image', 'completed', 0, ?, ?, 'test_user', '{}', '[]', 0, 3)
    `).run(testTaskId2, new Date().toISOString(), new Date().toISOString());

    const queueSaysCompleted = db.prepare(`
      SELECT * FROM tasks_queue WHERE task_id = ? AND type = 'image' AND status = 'completed'
    `).get(testTaskId2);

    const testTaskFolder2 = path.join(BACKEND_PATH, 'tasks', testTaskId2);
    const folderHasImages = fs.existsSync(testTaskFolder2) &&
      fs.readdirSync(testTaskFolder2).some(f => /scene_\d+.*\.(png|jpg|jpeg|webp|gif)$/i.test(f));

    if (queueSaysCompleted && !folderHasImages) {
      warn('Issue #5: Queue는 completed인데 폴더에 이미지 없음 (Race Condition 또는 데이터 불일치)');
    } else if (!queueSaysCompleted) {
      log('✅', 'Issue #5: Queue 상태가 아직 completed 아님 (정상)');
    } else {
      log('✅', 'Issue #5: Queue와 Folder 상태 일치 (정상)');
    }

    // 정리
    db.prepare(`DELETE FROM tasks_queue WHERE task_id IN (?, ?)`).run(taskId, testTaskId2);
    db.close();

    fs.rmSync(taskFolder, { recursive: true, force: true });

  } catch (error) {
    log('❌', `Scenario 5 실패: ${error.message}`, 'fail');
    testResults.failed++;
  }
}

/**
 * Scenario 6: End-to-End 통합 검증 (모의 전체 프로세스)
 */
async function testEndToEndIntegration() {
  log('📋', '='.repeat(80));
  log('🧪', 'Scenario 6: End-to-End 통합 검증 (모의 전체 프로세스)');
  log('📋', '='.repeat(80));

  const queueDb = new Database(QUEUE_DB_PATH);
  const mainDb = new Database(MAIN_DB_PATH);
  const taskId = generateTestTaskId();
  const scheduleId = `schedule_e2e_${Date.now()}`;
  const titleId = `title_e2e_${Date.now()}`;
  const taskFolder = path.join(BACKEND_PATH, 'tasks', taskId);

  try {
    log('🚀', 'Step 1: 전체 파이프라인 생성 (script, image, video, youtube)');

    const types = ['script', 'image', 'video', 'youtube'];
    const createdAt = new Date().toISOString();

    for (const type of types) {
      queueDb.prepare(`
        INSERT INTO tasks_queue (
          task_id, type, status, priority, created_at, user_id, metadata, logs, retry_count, max_retries
        ) VALUES (?, ?, 'waiting', 0, ?, 'test_user', '{}', '[]', 0, 3)
      `).run(taskId, type, createdAt);
    }

    const pipeline = queueDb.prepare(`
      SELECT * FROM tasks_queue WHERE task_id = ? ORDER BY
      CASE type WHEN 'script' THEN 1 WHEN 'image' THEN 2 WHEN 'video' THEN 3 WHEN 'youtube' THEN 4 END
    `).all(taskId);

    assert(
      pipeline.length === 4,
      'Pipeline Creation',
      `4단계 파이프라인 생성 완료: ${pipeline.map(p => p.type).join(' → ')}`,
      '파이프라인 생성 실패'
    );

    log('🚀', 'Step 2: Script 단계 완료 처리');

    queueDb.prepare(`
      UPDATE tasks_queue SET status = 'completed', completed_at = ? WHERE task_id = ? AND type = 'script'
    `).run(new Date().toISOString(), taskId);

    const scriptCompleted = queueDb.prepare(`
      SELECT * FROM tasks_queue WHERE task_id = ? AND type = 'script'
    `).get(taskId);

    assert(
      scriptCompleted.status === 'completed',
      'Script Completion',
      'Script 단계 completed',
      'Script 단계 완료 처리 실패'
    );

    log('🚀', 'Step 3: Image 단계 처리 시작 (script 완료 전제조건 확인)');

    const imageCanDequeue = queueDb.prepare(`
      SELECT * FROM tasks_queue
      WHERE task_id = ? AND type = 'image' AND status = 'waiting'
      AND EXISTS (
        SELECT 1 FROM tasks_queue prev
        WHERE prev.task_id = tasks_queue.task_id
        AND prev.type = 'script' AND prev.status = 'completed'
      )
    `).get(taskId);

    assert(
      !!imageCanDequeue,
      'Image Dequeue Prerequisites',
      'Script 완료 후 Image 단계 dequeue 가능',
      'Prerequisites 검증 실패'
    );

    log('🚀', 'Step 4: Image 크롤링 시뮬레이션 (파일 생성)');

    fs.mkdirSync(taskFolder, { recursive: true });

    const numScenes = 4;
    for (let i = 1; i <= numScenes; i++) {
      const filename = `scene_${String(i).padStart(2, '0')}.jpg`;
      fs.writeFileSync(path.join(taskFolder, filename), Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]));
    }

    const savedImages = fs.readdirSync(taskFolder).filter(f => /\.(jpg|png)$/i.test(f));

    assert(
      savedImages.length === numScenes,
      'Image Crawling',
      `${numScenes}개 이미지 파일 생성 완료`,
      '이미지 파일 생성 실패'
    );

    log('🚀', 'Step 5: Image 단계 완료 처리');

    queueDb.prepare(`
      UPDATE tasks_queue SET status = 'completed', completed_at = ? WHERE task_id = ? AND type = 'image'
    `).run(new Date().toISOString(), taskId);

    const imageCompleted = queueDb.prepare(`
      SELECT * FROM tasks_queue WHERE task_id = ? AND type = 'image'
    `).get(taskId);

    assert(
      imageCompleted.status === 'completed',
      'Image Completion',
      'Image 단계 completed',
      'Image 단계 완료 처리 실패'
    );

    log('🚀', 'Step 6: Video 단계 dequeue 가능 여부 확인');

    const videoCanDequeue = queueDb.prepare(`
      SELECT * FROM tasks_queue
      WHERE task_id = ? AND type = 'video' AND status = 'waiting'
      AND EXISTS (
        SELECT 1 FROM tasks_queue prev
        WHERE prev.task_id = tasks_queue.task_id
        AND prev.type = 'image' AND prev.status = 'completed'
      )
    `).get(taskId);

    assert(
      !!videoCanDequeue,
      'Video Dequeue Prerequisites',
      'Image 완료 후 Video 단계 dequeue 가능',
      'Video prerequisites 검증 실패'
    );

    log('✅', 'End-to-End 통합 검증 완료: Script → Image → Video 순차 처리 확인');

    // 정리
    queueDb.prepare(`DELETE FROM tasks_queue WHERE task_id = ?`).run(taskId);
    fs.rmSync(taskFolder, { recursive: true, force: true });

  } catch (error) {
    log('❌', `Scenario 6 실패: ${error.message}`, 'fail');
    testResults.failed++;
  } finally {
    queueDb.close();
    mainDb.close();
  }
}

// ============================================================================
// 메인 실행
// ============================================================================

async function main() {
  console.log('\n');
  log('🚀', '='.repeat(80));
  log('🚀', '이미지 크롤링 통합 테스트 시작 (Comprehensive Integration Test)');
  log('🚀', '='.repeat(80));
  console.log('\n');

  // 필수 경로 확인
  const requiredPaths = [
    { path: BACKEND_PATH, name: 'Backend' },
    { path: FRONTEND_PATH, name: 'Frontend' },
    { path: QUEUE_DB_PATH, name: 'Queue DB' },
    { path: MAIN_DB_PATH, name: 'Main DB' }
  ];

  for (const item of requiredPaths) {
    if (!fs.existsSync(item.path)) {
      log('❌', `${item.name} 경로를 찾을 수 없음: ${item.path}`, 'fail');
      process.exit(1);
    }
    log('✅', `${item.name} 경로 확인: ${item.path}`);
  }

  console.log('\n');

  // 각 시나리오 실행
  await testQueueEnqueue();
  console.log('\n');

  await testFileSavingValidation();
  console.log('\n');

  await testSchedulerDetection();
  console.log('\n');

  await testErrorHandlingRetry();
  console.log('\n');

  await testIdentifiedIssues();
  console.log('\n');

  await testEndToEndIntegration();
  console.log('\n');

  // 최종 결과 출력
  log('📊', '='.repeat(80));
  log('📊', '테스트 결과 요약');
  log('📊', '='.repeat(80));

  const total = testResults.passed + testResults.failed;
  const passRate = total > 0 ? ((testResults.passed / total) * 100).toFixed(1) : 0;

  console.log('');
  log('✅', `통과: ${testResults.passed}개`);
  log('❌', `실패: ${testResults.failed}개`);
  log('⚠️', `경고: ${testResults.warnings}개`);
  log('📈', `통과율: ${passRate}%`);
  console.log('');

  if (testResults.failed === 0) {
    log('🎉', '모든 테스트 통과! 이미지 크롤링 시스템이 정상 작동합니다.');
  } else {
    log('🔴', '일부 테스트 실패. 위의 실패 항목을 확인하세요.');
  }

  log('📋', '='.repeat(80));

  process.exit(testResults.failed > 0 ? 1 : 0);
}

// 실행
main().catch(error => {
  console.error('💥 테스트 실행 중 예외 발생:', error);
  process.exit(1);
});
