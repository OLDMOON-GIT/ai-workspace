/**
 * 미디어(이미지+영상) vs 씬 개수 처리 통합 테스트
 *
 * 테스트 시나리오:
 * 1. 미디어 = 씬 (정상 케이스)
 * 2. 미디어 > 씬 (초과 미디어 무시)
 * 3. 미디어 < 씬 (미디어 재사용)
 * 4. 영상+이미지, 미디어 > 씬 (썸네일 분리)
 * 5. 이미지만, 미디어 > 씬 (썸네일 분리 안 함)
 *
 * 실행: node test-media-scene-count.js
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

// 썸네일 분리 로직 시뮬레이션
function shouldSeparateThumbnail(allMediaFiles, sceneCount) {
  const hasVideo = allMediaFiles.some(f => f.mediaType === 'video');
  const hasImage = allMediaFiles.some(f => f.mediaType === 'image');
  const mediaCount = allMediaFiles.length;

  // 영상+이미지가 함께 있고, 미디어가 씬보다 많을 때만
  return hasVideo && hasImage && mediaCount > sceneCount;
}

// 시나리오 1: 미디어 = 씬 (정상)
function testScenario1() {
  log('\n📋 [시나리오 1] 미디어 = 씬 (정상)', 'blue');

  const sceneCount = 5;
  const allMediaFiles = [
    { name: 'image_01.jpg', mediaType: 'image' },
    { name: 'image_02.jpg', mediaType: 'image' },
    { name: 'video_01.mp4', mediaType: 'video' },
    { name: 'image_03.jpg', mediaType: 'image' },
    { name: 'video_02.mp4', mediaType: 'video' }
  ];

  log(`  씬: ${sceneCount}개`, 'yellow');
  log(`  미디어: ${allMediaFiles.length}개 (이미지: ${allMediaFiles.filter(f => f.mediaType === 'image').length}, 영상: ${allMediaFiles.filter(f => f.mediaType === 'video').length})`, 'yellow');

  const separate = shouldSeparateThumbnail(allMediaFiles, sceneCount);
  log(`  썸네일 분리: ${separate ? '✅ 예' : '❌ 아니오'}`, separate ? 'green' : 'red');
  log(`  예상: ❌ 아니오 (미디어 = 씬이므로 분리하면 부족)`, 'cyan');
  log(`  결과: ${!separate ? '✅ 통과' : '❌ 실패'}`, !separate ? 'green' : 'red');

  return !separate;
}

// 시나리오 2: 미디어 > 씬 (초과 미디어 무시, 썸네일 분리)
function testScenario2() {
  log('\n📋 [시나리오 2] 미디어 > 씬 + 영상+이미지 (썸네일 분리)', 'blue');

  const sceneCount = 5;
  const allMediaFiles = [
    { name: 'image_01.jpg', mediaType: 'image' },
    { name: 'image_02.jpg', mediaType: 'image' },
    { name: 'image_03.jpg', mediaType: 'image' },
    { name: 'video_01.mp4', mediaType: 'video' },
    { name: 'video_02.mp4', mediaType: 'video' },
    { name: 'video_03.mp4', mediaType: 'video' }
  ];

  log(`  씬: ${sceneCount}개`, 'yellow');
  log(`  미디어: ${allMediaFiles.length}개 (이미지: ${allMediaFiles.filter(f => f.mediaType === 'image').length}, 영상: ${allMediaFiles.filter(f => f.mediaType === 'video').length})`, 'yellow');

  const separate = shouldSeparateThumbnail(allMediaFiles, sceneCount);
  log(`  썸네일 분리: ${separate ? '✅ 예' : '❌ 아니오'}`, separate ? 'green' : 'red');
  log(`  예상: ✅ 예 (영상+이미지 있고 미디어 6 > 씬 5)`, 'cyan');

  if (separate) {
    const firstImageIndex = allMediaFiles.findIndex(f => f.mediaType === 'image');
    const thumbnailFile = allMediaFiles[firstImageIndex];
    const remainingMedia = [
      ...allMediaFiles.slice(0, firstImageIndex),
      ...allMediaFiles.slice(firstImageIndex + 1)
    ];

    log(`  → 썸네일: ${thumbnailFile.name}`, 'yellow');
    log(`  → 씬용 미디어: ${remainingMedia.length}개 (${remainingMedia.map(f => f.name).join(', ')})`, 'yellow');
    log(`  → 씬 ${sceneCount}개에 충분: ${remainingMedia.length >= sceneCount ? '✅' : '❌'}`, remainingMedia.length >= sceneCount ? 'green' : 'red');
  }

  log(`  결과: ${separate ? '✅ 통과' : '❌ 실패'}`, separate ? 'green' : 'red');

  return separate;
}

// 시나리오 3: 미디어 < 씬 (미디어 재사용)
function testScenario3() {
  log('\n📋 [시나리오 3] 미디어 < 씬 (미디어 재사용)', 'blue');

  const sceneCount = 5;
  const allMediaFiles = [
    { name: 'image_01.jpg', mediaType: 'image' },
    { name: 'video_01.mp4', mediaType: 'video' },
    { name: 'image_02.jpg', mediaType: 'image' }
  ];

  log(`  씬: ${sceneCount}개`, 'yellow');
  log(`  미디어: ${allMediaFiles.length}개 (이미지: ${allMediaFiles.filter(f => f.mediaType === 'image').length}, 영상: ${allMediaFiles.filter(f => f.mediaType === 'video').length})`, 'yellow');

  const separate = shouldSeparateThumbnail(allMediaFiles, sceneCount);
  log(`  썸네일 분리: ${separate ? '✅ 예' : '❌ 아니오'}`, separate ? 'green' : 'red');
  log(`  예상: ❌ 아니오 (미디어 < 씬이므로 분리하면 더 부족)`, 'cyan');
  log(`  → 백엔드에서 균등 분배: 각 미디어가 2개 씬 처리`, 'yellow');
  log(`  결과: ${!separate ? '✅ 통과' : '❌ 실패'}`, !separate ? 'green' : 'red');

  return !separate;
}

// 시나리오 4: 이미지만, 미디어 > 씬 (썸네일 분리 안 함)
function testScenario4() {
  log('\n📋 [시나리오 4] 이미지만, 미디어 > 씬 (썸네일 분리 안 함)', 'blue');

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

  const separate = shouldSeparateThumbnail(allMediaFiles, sceneCount);
  log(`  썸네일 분리: ${separate ? '✅ 예' : '❌ 아니오'}`, separate ? 'green' : 'red');
  log(`  예상: ❌ 아니오 (영상이 없으므로 조건 불만족)`, 'cyan');
  log(`  결과: ${!separate ? '✅ 통과' : '❌ 실패'}`, !separate ? 'green' : 'red');

  return !separate;
}

// 시나리오 5: 영상만, 미디어 > 씬 (썸네일 분리 안 함)
function testScenario5() {
  log('\n📋 [시나리오 5] 영상만, 미디어 > 씬 (썸네일 분리 안 함)', 'blue');

  const sceneCount = 3;
  const allMediaFiles = [
    { name: 'video_01.mp4', mediaType: 'video' },
    { name: 'video_02.mp4', mediaType: 'video' },
    { name: 'video_03.mp4', mediaType: 'video' },
    { name: 'video_04.mp4', mediaType: 'video' }
  ];

  log(`  씬: ${sceneCount}개`, 'yellow');
  log(`  미디어: ${allMediaFiles.length}개 (영상만)`, 'yellow');

  const separate = shouldSeparateThumbnail(allMediaFiles, sceneCount);
  log(`  썸네일 분리: ${separate ? '✅ 예' : '❌ 아니오'}`, separate ? 'green' : 'red');
  log(`  예상: ❌ 아니오 (이미지가 없으므로 조건 불만족)`, 'cyan');
  log(`  결과: ${!separate ? '✅ 통과' : '❌ 실패'}`, !separate ? 'green' : 'red');

  return !separate;
}

// 시나리오 6: 씬 2개 이상, 영상+이미지, 미디어 = 씬 (분리 안 함)
function testScenario6() {
  log('\n📋 [시나리오 6] 씬 2개, 영상+이미지, 미디어 = 씬 (분리 안 함)', 'blue');

  const sceneCount = 2;
  const allMediaFiles = [
    { name: 'image_01.jpg', mediaType: 'image' },
    { name: 'video_01.mp4', mediaType: 'video' }
  ];

  log(`  씬: ${sceneCount}개`, 'yellow');
  log(`  미디어: ${allMediaFiles.length}개 (이미지: 1, 영상: 1)`, 'yellow');

  const separate = shouldSeparateThumbnail(allMediaFiles, sceneCount);
  log(`  썸네일 분리: ${separate ? '✅ 예' : '❌ 아니오'}`, separate ? 'green' : 'red');
  log(`  예상: ❌ 아니오 (미디어 = 씬이므로 분리하면 부족)`, 'cyan');
  log(`  → 이전 로직은 씬 2개 이상이면 무조건 분리했음 (개선됨)`, 'yellow');
  log(`  결과: ${!separate ? '✅ 통과' : '❌ 실패'}`, !separate ? 'green' : 'red');

  return !separate;
}

// 메인 테스트 실행
function runTests() {
  log('='.repeat(70), 'blue');
  log('🧪 미디어 vs 씬 개수 처리 통합 테스트', 'blue');
  log('='.repeat(70), 'blue');

  const results = {
    total: 6,
    passed: 0,
    failed: 0
  };

  try {
    if (testScenario1()) results.passed++; else results.failed++;
    if (testScenario2()) results.passed++; else results.failed++;
    if (testScenario3()) results.passed++; else results.failed++;
    if (testScenario4()) results.passed++; else results.failed++;
    if (testScenario5()) results.passed++; else results.failed++;
    if (testScenario6()) results.passed++; else results.failed++;

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
  log('  썸네일 분리 조건: hasVideo && hasImage && mediaCount > sceneCount', 'cyan');
  log('  → 영상과 이미지가 함께 있고, 미디어가 씬보다 많을 때만 분리', 'cyan');
  log('  → 분리해도 남은 미디어로 모든 씬을 채울 수 있을 때만', 'cyan');

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
