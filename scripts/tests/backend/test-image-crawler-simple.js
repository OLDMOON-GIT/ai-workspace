/**
 * 이미지 크롤러 간단 테스트
 *
 * Python 스크립트를 직접 호출하여 이미지 생성 테스트
 * 워커 없이 실행 가능
 */

const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

// 경로 설정
const WORKSPACE_PATH = path.join(__dirname, '..', '..', '..');
const BACKEND_PATH = path.join(WORKSPACE_PATH, 'trend-video-backend');
const PYTHON_SCRIPT = path.join(WORKSPACE_PATH, 'scripts', 'utils', 'image_crawler_working.py');

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
      narration: `Test scene ${i} narration`,
      image_prompt: `A beautiful landscape photo, professional quality, scene ${i}, safe for work`,
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

// scenes JSON 파일 생성
function createScenesJson(tempDir, scenes) {
  const scenesPath = path.join(tempDir, `scenes_test_${Date.now()}.json`);
  fs.writeFileSync(scenesPath, JSON.stringify(scenes, null, 2), 'utf-8');
  console.log(`📝 Scenes JSON 생성: ${scenesPath}`);
  return scenesPath;
}

// Python 스크립트 실행
async function runPythonCrawler(scenesPath, outputDir) {
  console.log(`\n🚀 Python 이미지 크롤러 실행 중...`);
  console.log(`   스크립트: ${PYTHON_SCRIPT}`);
  console.log(`   씬 파일: ${scenesPath}`);
  console.log(`   출력 폴더: ${outputDir}`);

  return new Promise((resolve, reject) => {
    const pythonArgs = [
      PYTHON_SCRIPT,
      scenesPath,
      '--output-dir',
      outputDir
    ];

    console.log(`\n실행 명령: python ${pythonArgs.join(' ')}\n`);

    const pythonProcess = spawn('python', pythonArgs, {
      cwd: WORKSPACE_PATH,
      shell: true,
      stdio: 'inherit' // 출력을 콘솔에 바로 표시
    });

    pythonProcess.on('close', (code) => {
      console.log(`\n✅ Python 프로세스 종료 (코드: ${code})`);
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Python 스크립트 실행 실패 (종료 코드: ${code})`));
      }
    });

    pythonProcess.on('error', (err) => {
      reject(err);
    });
  });
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
async function runSimpleTest() {
  console.log('🧪 이미지 크롤러 간단 테스트 시작');
  console.log('='.repeat(80));
  console.log('⚠️  주의: Chrome이 디버깅 모드로 실행되어야 합니다!');
  console.log('   실행 방법: chrome.exe --remote-debugging-port=9222');
  console.log('='.repeat(80));

  const scriptId = `test_${Date.now()}`;
  let projectDir;
  let scenesPath;

  try {
    // Step 1: 테스트 데이터 생성
    console.log('\n📋 Step 1: 테스트 데이터 생성');
    console.log('-'.repeat(80));

    const scenes = generateTestScenes(8);
    console.log(`✅ 8개 씬 데이터 생성 완료`);
    addTestResult('1-1. 씬 데이터 생성', true, '8개 씬 생성');

    // Step 2: 프로젝트 폴더 생성
    console.log('\n📁 Step 2: 프로젝트 폴더 생성');
    console.log('-'.repeat(80));

    projectDir = createProjectFolder(scriptId);
    addTestResult('2-1. 프로젝트 폴더 생성', true, `project_${scriptId}`);

    // Step 3: Scenes JSON 생성
    console.log('\n📝 Step 3: Scenes JSON 파일 생성');
    console.log('-'.repeat(80));

    const tempDir = path.join(BACKEND_PATH, 'temp');
    fs.mkdirSync(tempDir, { recursive: true });

    scenesPath = createScenesJson(tempDir, scenes);
    addTestResult('3-1. Scenes JSON 생성', true, scenesPath);

    // Step 4: Python 크롤러 실행
    console.log('\n🚀 Step 4: Python 이미지 크롤러 실행');
    console.log('-'.repeat(80));

    await runPythonCrawler(scenesPath, projectDir);
    addTestResult('4-1. Python 크롤러 실행', true, '정상 완료');

    // Step 5: 이미지 파일 검증
    console.log('\n🔍 Step 5: 이미지 파일 검증');
    console.log('-'.repeat(80));

    // 3초 대기 (파일 시스템 동기화)
    await new Promise(resolve => setTimeout(resolve, 3000));

    const verifyResults = verifyImages(projectDir, 8);

    console.log('\n📊 검증 결과:');
    verifyResults.details.forEach(detail => console.log(`   ${detail}`));

    if (verifyResults.success) {
      addTestResult('5-1. 이미지 파일 검증', true, `8개 파일 모두 존재`);
      console.log(`\n✅ 모든 이미지가 정상적으로 저장되었습니다!`);
      console.log(`   저장된 파일: ${verifyResults.foundFiles.join(', ')}`);
    } else {
      addTestResult('5-1. 이미지 파일 검증', false, `${verifyResults.missingFiles.length}개 파일 누락`);
      console.error(`\n❌ 일부 이미지가 누락되었습니다!`);
      console.error(`   누락된 씬: ${verifyResults.missingFiles.join(', ')}`);
    }

  } catch (error) {
    console.error(`\n❌ 테스트 실행 중 오류 발생:`, error);
    addTestResult('테스트 실행', false, error.message);
  } finally {
    // 임시 파일 정리
    if (scenesPath && fs.existsSync(scenesPath)) {
      try {
        fs.unlinkSync(scenesPath);
        console.log(`\n🗑️  임시 파일 삭제: ${scenesPath}`);
      } catch (err) {
        console.error(`⚠️  임시 파일 삭제 실패:`, err.message);
      }
    }
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
    console.log(`\n📁 테스트 결과 폴더:`);
    console.log(`   ${projectDir}`);
    console.log(`   수동 삭제: rm -rf "${projectDir}"`);
  }

  process.exit(testResults.failed === 0 ? 0 : 1);
}

// 실행
runSimpleTest().catch(error => {
  console.error('❌ 예상치 못한 오류:', error);
  process.exit(1);
});
