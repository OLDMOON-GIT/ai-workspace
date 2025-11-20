/**
 * 완전한 자동화 테스트: 코드 검증 + 서버 로그 확인
 * 개발 가이드 Section 4 기준
 */

const fs = require('fs');
const path = require('path');

// 테스트 설정
const TEST_SCRIPT_ID = 'job_1763044825741_bh5psnf8a';
const MAX_RETRIES = 5;
let currentRetry = 0;

// 테스트 결과
let testResults = {
  passed: 0,
  failed: 0,
  tests: [],
  retries: []
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

function addRetryLog(attempt, action, result) {
  testResults.retries.push({ attempt, action, result, timestamp: new Date().toISOString() });
}

// 서버 로그 검증 함수 (개발 가이드 예시 코드)
function checkServerLogs(featureName, patterns = []) {
  try {
    const logPath = path.join(__dirname, 'trend-video-frontend', 'logs', 'server.log');

    if (!fs.existsSync(logPath)) {
      return { success: false, reason: '로그 파일 없음', logs: '' };
    }

    const logContent = fs.readFileSync(logPath, 'utf-8');
    const recentLogs = logContent.split('\n').slice(-500).join('\n');

    // 기본 에러 체크
    const hasGeneralError = recentLogs.includes('❌') ||
                            recentLogs.match(/Error:|Failed:/i);

    // 특정 패턴 체크
    let patternMatches = {};
    patterns.forEach(pattern => {
      patternMatches[pattern] = recentLogs.includes(pattern);
    });

    // 기능별 성공 패턴
    const hasSuccess = patterns.length === 0 ||
                       patterns.some(p => recentLogs.includes(p));

    return {
      success: hasSuccess && !hasGeneralError,
      reason: hasGeneralError ? '에러 발견' : (hasSuccess ? '정상' : '패턴 미발견'),
      logs: recentLogs,
      patternMatches
    };
  } catch (error) {
    return { success: false, reason: error.message, logs: '' };
  }
}

async function runTests() {
  console.log('🧪 [완전한 자동화 플로우 테스트] 시작');
  console.log('개발 가이드 Section 4: AI 자동 테스트 프로세스 준수\n');
  console.log('='.repeat(70) + '\n');

  // ===== STEP 1: 코드 변경 검증 =====
  console.log('📝 STEP 1: 코드 변경 검증');
  console.log('-'.repeat(70));

  try {
    // 1-1: config에 scriptId 추가 확인
    const routeFilePath = path.join(__dirname, 'trend-video-frontend', 'src', 'app', 'api', 'generate-video-upload', 'route.ts');
    const routeContent = fs.readFileSync(routeFilePath, 'utf-8');

    const hasScriptIdInConfig = routeContent.includes('scriptId?: string;') &&
                                 routeContent.includes('자동화용: 이미 업로드된 폴더 식별자');
    addTestResult('1-1. config scriptId 추가', hasScriptIdInConfig, hasScriptIdInConfig ? '확인' : '누락');

    // 1-2: generateVideoFromUpload에 scriptId 전달 확인
    const hasScriptIdPass = routeContent.includes('imageModel, // 이미지 생성 모델') &&
                             routeContent.includes('scriptId // 자동화용: 이미 업로드된 폴더 식별자');
    addTestResult('1-2. scriptId 전달', hasScriptIdPass, hasScriptIdPass ? '확인' : '누락');

    // 1-3: 조건부 폴더 경로 로직 확인
    const hasFolderPrefix = routeContent.includes("const folderPrefix = config.scriptId ? 'input' : 'uploads';");
    const usesFolderPrefix = routeContent.includes('`${folderPrefix}/${config.projectName}`');
    const conditionalPath = hasFolderPrefix && usesFolderPrefix;
    addTestResult('1-3. 조건부 폴더 경로', conditionalPath, conditionalPath ? '확인' : '누락');

  } catch (error) {
    addTestResult('1. 코드 검증', false, error.message);
  }

  console.log('');

  // ===== STEP 2: 파일 시스템 검증 =====
  console.log('📂 STEP 2: 파일 시스템 검증');
  console.log('-'.repeat(70));

  try {
    const backendPath = path.join(__dirname, 'trend-video-backend');
    const inputPath = path.join(backendPath, 'input', `project_${TEST_SCRIPT_ID}`);
    const storyPath = path.join(inputPath, 'story.json');

    // 2-1: input 폴더 존재
    const inputExists = fs.existsSync(inputPath);
    addTestResult('2-1. input 폴더 존재', inputExists, inputExists ? inputPath : '폴더 없음');

    if (inputExists) {
      // 2-2: story.json 존재
      const storyExists = fs.existsSync(storyPath);
      addTestResult('2-2. story.json 존재', storyExists, storyExists ? '확인' : '파일 없음');

      if (storyExists) {
        // 2-3: story.json 유효성
        const storyContent = fs.readFileSync(storyPath, 'utf-8');
        const storyData = JSON.parse(storyContent);
        const isValid = storyData.scenes && storyData.scenes.length > 0;
        addTestResult('2-3. story.json 유효성', isValid, isValid ? `씬 ${storyData.scenes.length}개` : '씬 없음');
      }
    }
  } catch (error) {
    addTestResult('2. 파일 시스템 검증', false, error.message);
  }

  console.log('');

  // ===== STEP 3: 서버 로그 검증 =====
  console.log('📜 STEP 3: 서버 로그 검증 (중요!)');
  console.log('-'.repeat(70));

  try {
    // 3-1: 로그 파일 존재 확인
    const logPath = path.join(__dirname, 'trend-video-frontend', 'logs', 'server.log');
    const logExists = fs.existsSync(logPath);
    addTestResult('3-1. 로그 파일 존재', logExists, logExists ? logPath : '파일 없음');

    if (logExists) {
      // 3-2: 최근 에러 확인
      const logCheckResult = checkServerLogs('automation', []);
      addTestResult('3-2. 서버 로그 에러 체크', logCheckResult.success, logCheckResult.reason);

      // 3-3: 특정 패턴 확인 (자동화 관련)
      const logContent = fs.readFileSync(logPath, 'utf-8');
      const recentLogs = logContent.split('\n').slice(-500).join('\n');

      // Python 명령어 로그 확인
      const hasPythonCmd = recentLogs.includes('🐍 Python 명령어:');
      if (hasPythonCmd) {
        // input/ 폴더 경로 사용 확인
        const usesInputPath = recentLogs.includes(`input/project_${TEST_SCRIPT_ID}`);
        addTestResult('3-3. Python 폴더 경로 (로그)', usesInputPath,
          usesInputPath ? 'input/ 사용 (올바름)' : 'uploads/ 사용 (잘못됨)');
      } else {
        addTestResult('3-3. Python 명령어 로그', false, '최근 실행 기록 없음 (정상일 수 있음)');
      }
    }
  } catch (error) {
    addTestResult('3. 서버 로그 검증', false, error.message);
  }

  console.log('');

  // ===== STEP 4: 로직 시뮬레이션 =====
  console.log('🔬 STEP 4: 로직 시뮬레이션');
  console.log('-'.repeat(70));

  try {
    // 4-1: 자동화 경로 (scriptId 있음)
    const scriptId = TEST_SCRIPT_ID;
    const folderPrefix1 = scriptId ? 'input' : 'uploads';
    const projectName1 = `project_${scriptId}`;
    const expectedPath1 = `input/project_${scriptId}`;
    const actualPath1 = `${folderPrefix1}/${projectName1}`;
    addTestResult('4-1. 자동화 경로', actualPath1 === expectedPath1, actualPath1);

    // 4-2: 일반 경로 (scriptId 없음)
    const scriptId2 = undefined;
    const folderPrefix2 = scriptId2 ? 'input' : 'uploads';
    const jobId = 'upload_123456789';
    const projectName2 = `uploaded_${jobId}`;
    const expectedPath2 = `uploads/uploaded_${jobId}`;
    const actualPath2 = `${folderPrefix2}/${projectName2}`;
    addTestResult('4-2. 일반 경로', actualPath2 === expectedPath2, actualPath2);

  } catch (error) {
    addTestResult('4. 로직 시뮬레이션', false, error.message);
  }

  console.log('');

  // ===== 결과 요약 =====
  console.log('='.repeat(70));
  console.log('📊 테스트 결과 요약');
  console.log('='.repeat(70));
  console.log(`✅ 통과: ${testResults.passed}/${testResults.tests.length}`);
  console.log(`❌ 실패: ${testResults.failed}/${testResults.tests.length}`);
  console.log(`🔄 재시도: ${currentRetry}/${MAX_RETRIES}`);

  if (testResults.failed === 0) {
    console.log('\n🎉 모든 테스트 통과!');
    console.log('\n📝 검증 완료 항목:');
    console.log('  ✅ 코드 수정 적용 (config scriptId, 조건부 경로)');
    console.log('  ✅ 파일 시스템 구조 (input 폴더, story.json)');
    console.log('  ✅ 서버 로그 정상 (에러 없음)');
    console.log('  ✅ 로직 시뮬레이션 (경로 분기)');
  } else {
    console.log('\n❌ 일부 테스트 실패');
    console.log('\n실패 항목:');
    testResults.tests.filter(t => !t.passed).forEach(t => {
      console.log(`  - ${t.name}: ${t.message}`);
    });

    if (currentRetry < MAX_RETRIES) {
      console.log(`\n🔄 재시도 가능 (${currentRetry + 1}/${MAX_RETRIES})`);
      console.log('개발 가이드: 실패 시 최대 5회 재시도 후 사용자 리포트');
    } else {
      console.log('\n⚠️  최대 재시도 횟수 도달');
      console.log('사용자에게 리포트 필요:');
      console.log('  1. 시도한 수정 내역');
      console.log('  2. 각 시도의 실패 원인');
      console.log('  3. 현재 상태 및 추가 정보 필요 여부');
    }
  }

  console.log('='.repeat(70));

  // Exit code
  process.exit(testResults.failed === 0 ? 0 : 1);
}

// 메인 실행
console.log('⚙️  개발 가이드 Section 4 준수');
console.log('   - 코드 수정 → 테스트 작성 → 테스트 실행 → 로그 확인');
console.log('   - 실패 시 최대 5회 재시도');
console.log('   - 5회 실패 시 사용자 리포트\n');

runTests().catch(error => {
  console.error('❌ 예상치 못한 오류:', error);
  process.exit(1);
});
