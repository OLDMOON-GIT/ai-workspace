/**
 * 향상된 이미지 크롤러 테스트
 * 프롬프트당 2개 이미지 생성 및 선택 기능 테스트
 */

const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

// 경로 설정
const WORKSPACE_PATH = path.join(__dirname, '..', '..', '..');
const BACKEND_PATH = path.join(WORKSPACE_PATH, 'trend-video-backend');
const PYTHON_SCRIPT = path.join(BACKEND_PATH, 'src', 'image_crawler', 'image_crawler_enhanced.py');

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

// 테스트 씬 데이터 생성 (3개만 - 빠른 테스트)
function generateTestScenes() {
  return [
    {
      scene_number: 1,
      scene_id: 'scene_01',
      narration: 'A beautiful sunrise over mountains',
      image_prompt: 'Beautiful sunrise over mountains, golden hour lighting, professional photography, landscape',
      duration: 5.0
    },
    {
      scene_number: 2,
      scene_id: 'scene_02',
      narration: 'A peaceful forest path',
      image_prompt: 'Peaceful forest path with sunlight filtering through trees, serene nature scene',
      duration: 5.0
    },
    {
      scene_number: 3,
      scene_id: 'scene_03',
      narration: 'A modern city skyline',
      image_prompt: 'Modern city skyline at twilight, urban landscape, architectural photography',
      duration: 5.0
    }
  ];
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
function createScenesJson(tempDir, scenes, metadata = {}) {
  const scenesPath = path.join(tempDir, `scenes_test_${Date.now()}.json`);
  const data = {
    scenes: scenes,
    metadata: {
      format: metadata.format || 'shortform',
      aspect_ratio: metadata.aspect_ratio || '9:16',
      ...metadata
    }
  };
  fs.writeFileSync(scenesPath, JSON.stringify(data, null, 2), 'utf-8');
  console.log(`📝 Scenes JSON 생성: ${scenesPath}`);
  return scenesPath;
}

// Python 스크립트 실행
async function runPythonCrawler(scenesPath, outputDir, imagesPerPrompt = 2) {
  console.log(`\n🚀 향상된 Python 이미지 크롤러 실행 중...`);
  console.log(`   스크립트: ${PYTHON_SCRIPT}`);
  console.log(`   씬 파일: ${scenesPath}`);
  console.log(`   출력 폴더: ${outputDir}`);
  console.log(`   프롬프트당 이미지: ${imagesPerPrompt}개`);

  return new Promise((resolve, reject) => {
    const pythonArgs = [
      PYTHON_SCRIPT,
      scenesPath,
      '--output-dir',
      outputDir,
      '--images-per-prompt',
      String(imagesPerPrompt)
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
    console.log(`     - ${f} (${(stats.size / 1024).toFixed(1)} KB)`);
  });

  // 씬별로 검증
  for (let i = 1; i <= expectedCount; i++) {
    const sceneNumber = String(i).padStart(2, '0');
    const possibleNames = [
      `scene_${sceneNumber}.png`,
      `scene_${sceneNumber}.jpg`,
      `scene_${sceneNumber}.jpeg`,
      `scene_${sceneNumber}.webp`
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

// 결과 파일 검증
function verifyCrawlingResults(projectDir) {
  const resultFile = path.join(projectDir, 'crawling_results.json');

  if (!fs.existsSync(resultFile)) {
    console.log('❌ crawling_results.json 파일이 없습니다');
    return null;
  }

  try {
    const results = JSON.parse(fs.readFileSync(resultFile, 'utf-8'));
    console.log('\n📊 크롤링 결과:');
    console.log(`   총 씬: ${results.total_scenes}`);
    console.log(`   처리됨: ${results.processed}`);
    console.log(`   성공: ${results.success ? '✅' : '❌'}`);
    console.log(`   타임스탬프: ${results.timestamp}`);

    if (results.results) {
      console.log('\n   씬별 결과:');
      results.results.forEach(r => {
        console.log(`     - 씬 ${r.scene}: ${r.variations_generated} variations 생성됨`);
      });
    }

    return results;
  } catch (error) {
    console.error('❌ 결과 파일 파싱 실패:', error);
    return null;
  }
}

// 메인 테스트 실행
async function runEnhancedTest() {
  console.log('🧪 향상된 이미지 크롤러 테스트 시작');
  console.log('='.repeat(80));
  console.log('⚠️  주의: Chrome이 디버깅 모드로 실행되어야 합니다!');
  console.log('   실행 방법: chrome.exe --remote-debugging-port=9222');
  console.log('='.repeat(80));

  const scriptId = `enhanced_test_${Date.now()}`;
  let projectDir;
  let scenesPath;

  try {
    // Step 1: 테스트 데이터 생성
    console.log('\n📋 Step 1: 테스트 데이터 생성');
    const scenes = generateTestScenes();
    addTestResult('데이터 생성', true, `${scenes.length}개 씬 생성됨`);

    // Step 2: 프로젝트 폴더 생성
    console.log('\n📋 Step 2: 프로젝트 폴더 생성');
    projectDir = createProjectFolder(scriptId);
    addTestResult('폴더 생성', true, projectDir);

    // Step 3: scenes JSON 파일 생성
    console.log('\n📋 Step 3: scenes JSON 파일 생성');
    const tempDir = path.join(BACKEND_PATH, 'temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    scenesPath = createScenesJson(tempDir, scenes);
    addTestResult('JSON 생성', true, scenesPath);

    // Step 4: Python 크롤러 실행 (프롬프트당 2개 이미지)
    console.log('\n📋 Step 4: 향상된 크롤러 실행 (프롬프트당 2개 이미지)');
    await runPythonCrawler(scenesPath, projectDir, 2);
    addTestResult('크롤러 실행', true, '정상 종료');

    // Step 5: 이미지 검증
    console.log('\n📋 Step 5: 생성된 이미지 검증');
    const verifyResult = verifyImages(projectDir, scenes.length);
    addTestResult(
      '이미지 검증',
      verifyResult.success,
      `${verifyResult.foundFiles.length}/${scenes.length} 이미지 발견`
    );

    // Step 6: 결과 파일 검증
    console.log('\n📋 Step 6: 크롤링 결과 파일 검증');
    const crawlingResults = verifyCrawlingResults(projectDir);
    addTestResult(
      '결과 파일',
      crawlingResults !== null && crawlingResults.success,
      crawlingResults ? '결과 파일 정상' : '결과 파일 없음'
    );

    // 상세 결과 출력
    if (verifyResult.details.length > 0) {
      console.log('\n상세 결과:');
      verifyResult.details.forEach(detail => console.log(`   ${detail}`));
    }

  } catch (error) {
    console.error('\n❌ 테스트 실행 중 오류:', error);
    addTestResult('테스트 실행', false, error.message);
  } finally {
    // 임시 파일 정리
    if (scenesPath && fs.existsSync(scenesPath)) {
      fs.unlinkSync(scenesPath);
      console.log('\n🧹 임시 파일 정리 완료');
    }
  }

  // 최종 결과
  console.log('\n' + '='.repeat(80));
  console.log('📊 테스트 결과 요약');
  console.log('='.repeat(80));
  console.log(`✅ 통과: ${testResults.passed}`);
  console.log(`❌ 실패: ${testResults.failed}`);
  console.log(`📝 총 테스트: ${testResults.tests.length}`);
  console.log('='.repeat(80));

  // 각 테스트 상태
  console.log('\n테스트 목록:');
  testResults.tests.forEach(test => {
    const icon = test.passed ? '✅' : '❌';
    console.log(`  ${icon} ${test.name}: ${test.message}`);
  });

  if (testResults.failed === 0) {
    console.log('\n🎉 모든 테스트 통과!');
  } else {
    console.log('\n⚠️  일부 테스트 실패');
  }
}

// 실행
runEnhancedTest().catch(console.error);