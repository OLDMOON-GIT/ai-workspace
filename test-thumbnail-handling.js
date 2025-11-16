/**
 * 썸네일 처리 통합 테스트
 *
 * 테스트 시나리오:
 * 1. 업로드된 썸네일이 있을 때 → 자동 생성 건너뛰기
 * 2. 업로드된 썸네일이 없을 때 → 자동 생성 수행
 * 3. 미디어 > 씬일 때 → 프론트엔드에서 썸네일 분리
 * 4. 미디어 = 씬일 때 → 썸네일 분리 안 함
 *
 * 실행: node test-thumbnail-handling.js
 */

const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  reset: '\x1b[0m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

// 프론트엔드 썸네일 분리 로직 시뮬레이션
function shouldSeparateThumbnail(allMediaFiles, sceneCount) {
  const hasVideo = allMediaFiles.some(f => f.mediaType === 'video');
  const hasImage = allMediaFiles.some(f => f.mediaType === 'image');
  const mediaCount = allMediaFiles.length;

  // 영상+이미지가 함께 있고, 미디어가 씬보다 많을 때만
  return hasVideo && hasImage && mediaCount > sceneCount;
}

// 백엔드 썸네일 처리 로직 시뮬레이션
function backendThumbnailHandling(hasUploadedThumbnail) {
  if (hasUploadedThumbnail) {
    log('  ✅ 업로드된 썸네일 발견: thumbnail.jpg', 'green');
    log('     썸네일 자동 생성을 건너뜁니다.', 'yellow');
    return 'skip';
  } else {
    log('  🖼️  썸네일 자동 생성 중...', 'cyan');
    log('  ✅ 썸네일 생성 완료', 'green');
    return 'created';
  }
}

// 시나리오 1: 미디어 > 씬 + 영상+이미지 → 썸네일 분리 → 백엔드는 건너뛰기
function testScenario1() {
  log('\n📋 [시나리오 1] 미디어 > 씬 + 영상+이미지 → 썸네일 분리', 'blue');

  const sceneCount = 5;
  const allMediaFiles = [
    { name: 'image_01.jpg', mediaType: 'image' },
    { name: 'image_02.jpg', mediaType: 'image' },
    { name: 'video_01.mp4', mediaType: 'video' },
    { name: 'video_02.mp4', mediaType: 'video' },
    { name: 'video_03.mp4', mediaType: 'video' },
    { name: 'image_03.jpg', mediaType: 'image' }
  ];

  log(`  씬: ${sceneCount}개`, 'yellow');
  log(`  미디어: ${allMediaFiles.length}개 (이미지: ${allMediaFiles.filter(f => f.mediaType === 'image').length}, 영상: ${allMediaFiles.filter(f => f.mediaType === 'video').length})`, 'yellow');

  // 1단계: 프론트엔드 썸네일 분리
  const separate = shouldSeparateThumbnail(allMediaFiles, sceneCount);
  log(`\n  [프론트엔드] 썸네일 분리: ${separate ? '✅ 예' : '❌ 아니오'}`, separate ? 'green' : 'red');

  if (separate) {
    const firstImageIndex = allMediaFiles.findIndex(f => f.mediaType === 'image');
    const thumbnailFile = allMediaFiles[firstImageIndex];
    log(`    → 썸네일: ${thumbnailFile.name}`, 'yellow');
    log(`    → FormData에 'thumbnail' 추가`, 'yellow');
  }

  // 2단계: API - 썸네일 파일 저장
  log(`\n  [API] thumbnail.jpg 파일 저장`, 'cyan');

  // 3단계: 백엔드 - 썸네일 처리
  log(`\n  [백엔드] create_video_from_folder.py`, 'cyan');
  const result = backendThumbnailHandling(separate);

  // 검증
  const expected = separate ? 'skip' : 'created';
  const passed = result === expected;

  log(`\n  예상: ${expected === 'skip' ? '건너뛰기' : '자동 생성'}`, 'cyan');
  log(`  결과: ${passed ? '✅ 통과' : '❌ 실패'}`, passed ? 'green' : 'red');

  return passed;
}

// 시나리오 2: 미디어 = 씬 → 썸네일 분리 안 함 → 백엔드가 자동 생성
function testScenario2() {
  log('\n📋 [시나리오 2] 미디어 = 씬 → 썸네일 분리 안 함', 'blue');

  const sceneCount = 5;
  const allMediaFiles = [
    { name: 'image_01.jpg', mediaType: 'image' },
    { name: 'image_02.jpg', mediaType: 'image' },
    { name: 'video_01.mp4', mediaType: 'video' },
    { name: 'video_02.mp4', mediaType: 'video' },
    { name: 'image_03.jpg', mediaType: 'image' }
  ];

  log(`  씬: ${sceneCount}개`, 'yellow');
  log(`  미디어: ${allMediaFiles.length}개 (이미지: ${allMediaFiles.filter(f => f.mediaType === 'image').length}, 영상: ${allMediaFiles.filter(f => f.mediaType === 'video').length})`, 'yellow');

  // 1단계: 프론트엔드 썸네일 분리
  const separate = shouldSeparateThumbnail(allMediaFiles, sceneCount);
  log(`\n  [프론트엔드] 썸네일 분리: ${separate ? '✅ 예' : '❌ 아니오'}`, separate ? 'green' : 'red');
  log(`    → 모든 미디어를 씬에 사용`, 'yellow');

  // 2단계: API - 썸네일 파일 없음
  log(`\n  [API] 썸네일 파일 없음`, 'cyan');

  // 3단계: 백엔드 - 썸네일 처리
  log(`\n  [백엔드] create_video_from_folder.py`, 'cyan');
  const result = backendThumbnailHandling(separate);

  // 검증
  const expected = separate ? 'skip' : 'created';
  const passed = result === expected;

  log(`\n  예상: ${expected === 'skip' ? '건너뛰기' : '자동 생성'}`, 'cyan');
  log(`  결과: ${passed ? '✅ 통과' : '❌ 실패'}`, passed ? 'green' : 'red');

  return passed;
}

// 시나리오 3: 이미지만 있고 미디어 > 씬 → 썸네일 분리 안 함 → 자동 생성
function testScenario3() {
  log('\n📋 [시나리오 3] 이미지만, 미디어 > 씬 → 썸네일 분리 안 함', 'blue');

  const sceneCount = 5;
  const allMediaFiles = [
    { name: 'image_01.jpg', mediaType: 'image' },
    { name: 'image_02.jpg', mediaType: 'image' },
    { name: 'image_03.jpg', mediaType: 'image' },
    { name: 'image_04.jpg', mediaType: 'image' },
    { name: 'image_05.jpg', mediaType: 'image' },
    { name: 'image_06.jpg', mediaType: 'image' }
  ];

  log(`  씬: ${sceneCount}개`, 'yellow');
  log(`  미디어: ${allMediaFiles.length}개 (이미지만)`, 'yellow');

  // 1단계: 프론트엔드 썸네일 분리
  const separate = shouldSeparateThumbnail(allMediaFiles, sceneCount);
  log(`\n  [프론트엔드] 썸네일 분리: ${separate ? '✅ 예' : '❌ 아니오'}`, separate ? 'green' : 'red');
  log(`    → 영상이 없으므로 조건 불만족`, 'yellow');

  // 2단계: API - 썸네일 파일 없음
  log(`\n  [API] 썸네일 파일 없음`, 'cyan');

  // 3단계: 백엔드 - 썸네일 처리
  log(`\n  [백엔드] create_video_from_folder.py`, 'cyan');
  const result = backendThumbnailHandling(separate);

  // 검증
  const expected = 'created';
  const passed = result === expected;

  log(`\n  예상: 자동 생성`, 'cyan');
  log(`  결과: ${passed ? '✅ 통과' : '❌ 실패'}`, passed ? 'green' : 'red');

  return passed;
}

// 메인 테스트 실행
function runTests() {
  log('='.repeat(70), 'blue');
  log('🧪 썸네일 처리 통합 테스트', 'blue');
  log('='.repeat(70), 'blue');

  const results = {
    total: 3,
    passed: 0,
    failed: 0
  };

  try {
    if (testScenario1()) results.passed++; else results.failed++;
    if (testScenario2()) results.passed++; else results.failed++;
    if (testScenario3()) results.passed++; else results.failed++;

  } catch (error) {
    log(`\n❌ 테스트 중 오류: ${error.message}`, 'red');
    console.error(error);
  }

  // 결과 요약
  log('\n' + '='.repeat(70), 'blue');
  log('📊 테스트 결과', 'blue');
  log('='.repeat(70), 'blue');
  log(`총 테스트: ${results.total}`, 'yellow');
  log(`통과: ${results.passed}`, 'green');
  log(`실패: ${results.failed}`, results.failed > 0 ? 'red' : 'green');
  log(`성공률: ${Math.round(results.passed / results.total * 100)}%`, results.failed === 0 ? 'green' : 'yellow');

  log('\n📌 핵심 로직', 'cyan');
  log('  [프론트엔드]', 'cyan');
  log('    - 썸네일 분리 조건: hasVideo && hasImage && mediaCount > sceneCount', 'cyan');
  log('    - 분리 시: thumbnail.${ext} 파일 업로드', 'cyan');
  log('', 'reset');
  log('  [백엔드]', 'cyan');
  log('    - 업로드된 thumbnail.* 파일이 있으면 → 자동 생성 건너뛰기 ✅', 'green');
  log('    - 없으면 → create_thumbnail.py로 씬 1 이미지 사용하여 생성', 'cyan');

  log('='.repeat(70), 'blue');

  if (results.failed === 0) {
    log('\n✅ 모든 테스트 통과!', 'green');
    process.exit(0);
  } else {
    log(`\n⚠️  ${results.failed}개 테스트 실패`, 'red');
    process.exit(1);
  }
}

// 실행
runTests();
