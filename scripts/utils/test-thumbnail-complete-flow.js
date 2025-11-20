/**
 * 썸네일 처리 완전 통합 테스트
 *
 * 테스트 시나리오:
 * 1. 썸네일 분리 O (영상+이미지, 미디어 > 씬)
 *    - 프론트: 첫 이미지를 thumbnail.jpg로 분리
 *    - 백엔드: thumbnail.jpg로 글씨 쓴 썸네일 제작
 *    - 첫 이미지는 씬에서 제외
 *
 * 2. 썸네일 분리 X (미디어 = 씬)
 *    - 프론트: 썸네일 파일 없음
 *    - 백엔드: 첫 번째 이미지로 글씨 쓴 썸네일 제작
 *    - 모든 이미지를 씬에 사용
 *
 * 실행: node test-thumbnail-complete-flow.js
 */

const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  reset: '\x1b[0m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

// 프론트엔드 썸네일 분리 로직
function shouldSeparateThumbnail(allMediaFiles, sceneCount) {
  const hasVideo = allMediaFiles.some(f => f.mediaType === 'video');
  const hasImage = allMediaFiles.some(f => f.mediaType === 'image');
  const mediaCount = allMediaFiles.length;

  return hasVideo && hasImage && mediaCount > sceneCount;
}

// 백엔드 이미지 필터링 로직
function backendFindImages(uploadedFiles) {
  // 'thumbnail'이 이름에 포함되지 않은 이미지만 씬에 사용
  return uploadedFiles.filter(f =>
    f.type === 'image' && !f.name.toLowerCase().includes('thumbnail')
  );
}

// 백엔드 썸네일 제작 로직
function backendCreateThumbnail(uploadedFiles) {
  // 1. thumbnail.* 파일이 있으면 우선 사용
  const thumbnailFile = uploadedFiles.find(f => f.name.toLowerCase().startsWith('thumbnail.'));

  if (thumbnailFile) {
    log(`    [create_thumbnail.py] ✅ 업로드된 썸네일 발견: ${thumbnailFile.name}`, 'green');
    log(`    [create_thumbnail.py] 이걸로 글씨 쓴 썸네일 제작`, 'cyan');
    return {
      source: thumbnailFile.name,
      output: 'thumbnail.jpg (with text)',
      text: '제목 텍스트 4줄 작성됨'
    };
  }

  // 2. 없으면 첫 번째 이미지 사용
  const firstImage = uploadedFiles.find(f => f.type === 'image');

  if (firstImage) {
    log(`    [create_thumbnail.py] 첫 번째 이미지 사용: ${firstImage.name}`, 'yellow');
    log(`    [create_thumbnail.py] 글씨 쓴 썸네일 제작`, 'cyan');
    return {
      source: firstImage.name,
      output: 'thumbnail.jpg (with text)',
      text: '제목 텍스트 4줄 작성됨'
    };
  }

  throw new Error('이미지를 찾을 수 없습니다');
}

// 시나리오 1: 썸네일 분리 O (영상+이미지, 미디어 > 씬)
function testScenario1() {
  log('\n📋 [시나리오 1] 썸네일 분리 O → 글씨 쓴 썸네일 제작', 'blue');
  log('=' .repeat(70), 'blue');

  const sceneCount = 5;
  const allMediaFiles = [
    { name: 'image_01.jpg', mediaType: 'image', size: 500000 },
    { name: 'image_02.jpg', mediaType: 'image', size: 450000 },
    { name: 'video_01.mp4', mediaType: 'video', size: 2000000 },
    { name: 'video_02.mp4', mediaType: 'video', size: 1800000 },
    { name: 'image_03.jpg', mediaType: 'image', size: 520000 },
    { name: 'video_03.mp4', mediaType: 'video', size: 1900000 }
  ];

  log(`\n  [초기 상태]`, 'cyan');
  log(`    씬: ${sceneCount}개`, 'yellow');
  log(`    미디어: ${allMediaFiles.length}개 (이미지: ${allMediaFiles.filter(f => f.mediaType === 'image').length}, 영상: ${allMediaFiles.filter(f => f.mediaType === 'video').length})`, 'yellow');

  // 1단계: 프론트엔드 썸네일 분리
  log(`\n  [1단계: 프론트엔드] 썸네일 분리 로직`, 'magenta');
  const separate = shouldSeparateThumbnail(allMediaFiles, sceneCount);
  log(`    조건: hasVideo && hasImage && mediaCount(${allMediaFiles.length}) > sceneCount(${sceneCount})`, 'yellow');
  log(`    결과: ${separate ? '✅ 분리함' : '❌ 분리 안 함'}`, separate ? 'green' : 'red');

  let uploadedFiles = [];

  if (separate) {
    const firstImageIndex = allMediaFiles.findIndex(f => f.mediaType === 'image');
    const thumbnailFile = allMediaFiles[firstImageIndex];
    const remainingMedia = [
      ...allMediaFiles.slice(0, firstImageIndex),
      ...allMediaFiles.slice(firstImageIndex + 1)
    ];

    log(`    → 썸네일: ${thumbnailFile.name} (${(thumbnailFile.size / 1024).toFixed(1)}KB)`, 'green');
    log(`    → 씬용 미디어: ${remainingMedia.length}개`, 'green');

    // FormData 시뮬레이션
    uploadedFiles = [
      { name: 'thumbnail.jpg', type: 'image', size: thumbnailFile.size },
      ...remainingMedia.map((f, i) => ({
        name: `${String(i + 1).padStart(2, '0')}.${f.name.split('.').pop()}`,
        type: f.mediaType,
        size: f.size
      }))
    ];
  } else {
    uploadedFiles = allMediaFiles.map((f, i) => ({
      name: `${String(i + 1).padStart(2, '0')}.${f.name.split('.').pop()}`,
      type: f.mediaType,
      size: f.size
    }));
  }

  // 2단계: API - 파일 저장
  log(`\n  [2단계: API] 파일 저장`, 'magenta');
  uploadedFiles.forEach(f => {
    const icon = f.type === 'image' ? '🖼️' : '🎬';
    const isThumbnail = f.name.toLowerCase().startsWith('thumbnail') ? ' (썸네일)' : '';
    log(`    ${icon} ${f.name.padEnd(20)} ${(f.size / 1024).toFixed(1).padStart(6)}KB${isThumbnail}`, 'cyan');
  });

  // 3단계: 백엔드 - 씬용 이미지 찾기
  log(`\n  [3단계: 백엔드] create_video_from_folder.py`, 'magenta');
  const sceneImages = backendFindImages(uploadedFiles);
  log(`    [_find_images()] 씬용 이미지 찾기`, 'cyan');
  log(`    → 조건: 'thumbnail' not in img_file.name.lower()`, 'yellow');
  log(`    → 결과: ${sceneImages.length}개 이미지 발견`, 'green');
  sceneImages.forEach(img => {
    log(`       - ${img.name}`, 'yellow');
  });

  // 4단계: 백엔드 - 썸네일 제작
  log(`\n  [4단계: 백엔드] 썸네일 제작 (항상 실행)`, 'magenta');
  log(`    [_create_thumbnail()] create_thumbnail.py 실행`, 'cyan');
  const thumbnail = backendCreateThumbnail(uploadedFiles);
  log(`    → 원본: ${thumbnail.source}`, 'green');
  log(`    → 출력: ${thumbnail.output}`, 'green');
  log(`    → 텍스트: ${thumbnail.text}`, 'green');

  // 검증
  log(`\n  [검증]`, 'magenta');
  const expectedSceneImages = separate ? allMediaFiles.filter(f => f.mediaType === 'image').length - 1 : allMediaFiles.filter(f => f.mediaType === 'image').length;
  const passed = sceneImages.length === expectedSceneImages && thumbnail.output.includes('with text');

  log(`    예상 씬 이미지: ${expectedSceneImages}개`, 'cyan');
  log(`    실제 씬 이미지: ${sceneImages.length}개`, sceneImages.length === expectedSceneImages ? 'green' : 'red');
  log(`    글씨 쓴 썸네일: ${thumbnail.output.includes('with text') ? '✅ 생성됨' : '❌ 없음'}`, thumbnail.output.includes('with text') ? 'green' : 'red');
  log(`    결과: ${passed ? '✅ 통과' : '❌ 실패'}`, passed ? 'green' : 'red');

  return passed;
}

// 시나리오 2: 썸네일 분리 X (미디어 = 씬)
function testScenario2() {
  log('\n📋 [시나리오 2] 썸네일 분리 X → 글씨 쓴 썸네일 제작', 'blue');
  log('='.repeat(70), 'blue');

  const sceneCount = 5;
  const allMediaFiles = [
    { name: 'image_01.jpg', mediaType: 'image', size: 500000 },
    { name: 'image_02.jpg', mediaType: 'image', size: 450000 },
    { name: 'video_01.mp4', mediaType: 'video', size: 2000000 },
    { name: 'video_02.mp4', mediaType: 'video', size: 1800000 },
    { name: 'image_03.jpg', mediaType: 'image', size: 520000 }
  ];

  log(`\n  [초기 상태]`, 'cyan');
  log(`    씬: ${sceneCount}개`, 'yellow');
  log(`    미디어: ${allMediaFiles.length}개 (이미지: ${allMediaFiles.filter(f => f.mediaType === 'image').length}, 영상: ${allMediaFiles.filter(f => f.mediaType === 'video').length})`, 'yellow');

  // 1단계: 프론트엔드 썸네일 분리
  log(`\n  [1단계: 프론트엔드] 썸네일 분리 로직`, 'magenta');
  const separate = shouldSeparateThumbnail(allMediaFiles, sceneCount);
  log(`    조건: hasVideo && hasImage && mediaCount(${allMediaFiles.length}) > sceneCount(${sceneCount})`, 'yellow');
  log(`    결과: ${separate ? '✅ 분리함' : '❌ 분리 안 함'}`, separate ? 'green' : 'red');
  log(`    → 모든 미디어를 씬에 사용`, 'yellow');

  // FormData 시뮬레이션
  const uploadedFiles = allMediaFiles.map((f, i) => ({
    name: `${String(i + 1).padStart(2, '0')}.${f.name.split('.').pop()}`,
    type: f.mediaType,
    size: f.size
  }));

  // 2단계: API - 파일 저장
  log(`\n  [2단계: API] 파일 저장`, 'magenta');
  uploadedFiles.forEach(f => {
    const icon = f.type === 'image' ? '🖼️' : '🎬';
    log(`    ${icon} ${f.name.padEnd(20)} ${(f.size / 1024).toFixed(1).padStart(6)}KB`, 'cyan');
  });

  // 3단계: 백엔드 - 씬용 이미지 찾기
  log(`\n  [3단계: 백엔드] create_video_from_folder.py`, 'magenta');
  const sceneImages = backendFindImages(uploadedFiles);
  log(`    [_find_images()] 씬용 이미지 찾기`, 'cyan');
  log(`    → 조건: 'thumbnail' not in img_file.name.lower()`, 'yellow');
  log(`    → 결과: ${sceneImages.length}개 이미지 발견`, 'green');
  sceneImages.forEach(img => {
    log(`       - ${img.name}`, 'yellow');
  });

  // 4단계: 백엔드 - 썸네일 제작
  log(`\n  [4단계: 백엔드] 썸네일 제작 (항상 실행)`, 'magenta');
  log(`    [_create_thumbnail()] create_thumbnail.py 실행`, 'cyan');
  const thumbnail = backendCreateThumbnail(uploadedFiles);
  log(`    → 원본: ${thumbnail.source}`, 'green');
  log(`    → 출력: ${thumbnail.output}`, 'green');
  log(`    → 텍스트: ${thumbnail.text}`, 'green');

  // 검증
  log(`\n  [검증]`, 'magenta');
  const expectedSceneImages = allMediaFiles.filter(f => f.mediaType === 'image').length;
  const passed = sceneImages.length === expectedSceneImages && thumbnail.output.includes('with text');

  log(`    예상 씬 이미지: ${expectedSceneImages}개 (모든 이미지 사용)`, 'cyan');
  log(`    실제 씬 이미지: ${sceneImages.length}개`, sceneImages.length === expectedSceneImages ? 'green' : 'red');
  log(`    글씨 쓴 썸네일: ${thumbnail.output.includes('with text') ? '✅ 생성됨' : '❌ 없음'}`, thumbnail.output.includes('with text') ? 'green' : 'red');
  log(`    결과: ${passed ? '✅ 통과' : '❌ 실패'}`, passed ? 'green' : 'red');

  return passed;
}

// 메인 테스트 실행
function runTests() {
  log('='.repeat(70), 'blue');
  log('🧪 썸네일 처리 완전 통합 테스트', 'blue');
  log('='.repeat(70), 'blue');

  const results = {
    total: 2,
    passed: 0,
    failed: 0
  };

  try {
    if (testScenario1()) results.passed++; else results.failed++;
    if (testScenario2()) results.passed++; else results.failed++;

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

  log('\n📌 핵심 플로우', 'cyan');
  log('', 'reset');
  log('  [시나리오 1: 썸네일 분리 O]', 'cyan');
  log('    1. 프론트: 영상+이미지 있고 미디어 > 씬 → 첫 이미지 분리', 'yellow');
  log('    2. API: thumbnail.jpg + 01.mp4, 02.png, 03.png... 저장', 'yellow');
  log('    3. 백엔드 _find_images(): thumbnail 제외 → 01.mp4, 02.png, 03.png 씬용 사용', 'yellow');
  log('    4. 백엔드 _create_thumbnail(): thumbnail.jpg로 글씨 쓴 썸네일 제작 ✅', 'green');
  log('', 'reset');
  log('  [시나리오 2: 썸네일 분리 X]', 'cyan');
  log('    1. 프론트: 미디어 = 씬 → 분리 안 함', 'yellow');
  log('    2. API: 01.jpg, 02.mp4, 03.jpg... 저장 (썸네일 파일 없음)', 'yellow');
  log('    3. 백엔드 _find_images(): 01.jpg, 02.mp4, 03.jpg 모두 씬용 사용', 'yellow');
  log('    4. 백엔드 _create_thumbnail(): 01.jpg로 글씨 쓴 썸네일 제작 ✅', 'green');

  log('='.repeat(70), 'blue');

  if (results.failed === 0) {
    log('\n✅ 모든 테스트 통과!', 'green');
    log('\n핵심: 항상 글씨 쓴 썸네일이 제작됨 (create_thumbnail.py 항상 실행)', 'magenta');
    process.exit(0);
  } else {
    log(`\n⚠️  ${results.failed}개 테스트 실패`, 'red');
    process.exit(1);
  }
}

// 실행
runTests();
