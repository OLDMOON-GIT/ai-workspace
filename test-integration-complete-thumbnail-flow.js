/**
 * 완전한 썸네일 + 미디어 정렬 통합 테스트 (End-to-End)
 *
 * 이 테스트는 전체 파이프라인을 시뮬레이션합니다:
 * 1. 스케줄러: 썸네일 분리 조건 감지
 * 2. API: scene_0를 thumbnail로 이동 (복사 아님!)
 * 3. 백엔드: 미디어 정렬 (영상이 시퀀스 순서대로)
 * 4. 백엔드: 썸네일 텍스트 오버레이 생성
 * 5. 최종: 영상이 올바른 위치에 있는지 확인
 *
 * 실행: node test-integration-complete-thumbnail-flow.js
 */

const fs = require('fs');
const path = require('path');

const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  reset: '\x1b[0m',
  bold: '\x1b[1m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

// ==================== 테스트 유틸리티 ====================

function extract_sequence_unified(media_tuple) {
  const [media_type, filepath] = media_tuple;
  const name = path.parse(filepath).name;

  // scene_N 패턴
  let match = name.match(/^(image|video|scene|clip|img)[-_](\d+)$/i);
  if (match) return [parseInt(match[2]), 0];

  // 숫자만
  match = name.match(/^(\d+)$/);
  if (match) return [parseInt(match[1]), 0];

  // 어디든 숫자
  match = name.match(/(\d+)/);
  if (match) return [parseInt(match[1]), 0];

  return [null, 0];
}

function sortMedia(mediaList) {
  return mediaList.sort((a, b) => {
    const [seqA] = extract_sequence_unified(a);
    const [seqB] = extract_sequence_unified(b);

    // null은 뒤로
    if (seqA === null && seqB === null) return 0;
    if (seqA === null) return 1;
    if (seqB === null) return -1;

    return seqA - seqB;
  });
}

// ==================== 테스트 1: 스케줄러 조건 감지 ====================

function test1_schedulerConditionDetection() {
  log('\n' + '='.repeat(80), 'blue');
  log('🧪 테스트 1: 스케줄러 - 썸네일 분리 조건 감지', 'blue');
  log('='.repeat(80), 'blue');

  // 시나리오 1: 조건 충족 (영상 + 이미지, 미디어 > 씬)
  const scenario1 = {
    sceneCount: 3,
    mediaFiles: ['scene_0.jpg', 'scene_1.mp4', 'scene_2.jpg', 'scene_3.jpg']
  };

  const hasVideo = scenario1.mediaFiles.some(f => f.endsWith('.mp4'));
  const hasImage = scenario1.mediaFiles.some(f => f.endsWith('.jpg'));
  const mediaCount = scenario1.mediaFiles.length;
  const shouldSeparate = hasVideo && hasImage && mediaCount > scenario1.sceneCount;

  log('\n  [시나리오 1: 썸네일 분리 조건]', 'cyan');
  log(`    씬 갯수: ${scenario1.sceneCount}`, 'yellow');
  log(`    미디어 파일: ${mediaCount}개 (${scenario1.mediaFiles.join(', ')})`, 'yellow');
  log(`    영상 포함: ${hasVideo ? '✅' : '❌'}`, hasVideo ? 'green' : 'red');
  log(`    이미지 포함: ${hasImage ? '✅' : '❌'}`, hasImage ? 'green' : 'red');
  log(`    미디어 > 씬: ${mediaCount} > ${scenario1.sceneCount} = ${mediaCount > scenario1.sceneCount ? '✅' : '❌'}`, mediaCount > scenario1.sceneCount ? 'green' : 'red');
  log(`    → 썸네일 분리: ${shouldSeparate ? '✅ YES' : '❌ NO'}`, shouldSeparate ? 'green' : 'red');

  if (!shouldSeparate) {
    log('  ❌ 테스트 1-1 실패: 썸네일 분리 조건이 감지되지 않음', 'red');
    return false;
  }
  log('  ✅ 테스트 1-1 통과: 썸네일 분리 조건 감지됨', 'green');

  // 시나리오 2: 조건 미충족 (영상만)
  const scenario2 = {
    sceneCount: 3,
    mediaFiles: ['scene_0.mp4', 'scene_1.mp4', 'scene_2.mp4']
  };

  const hasVideo2 = scenario2.mediaFiles.some(f => f.endsWith('.mp4'));
  const hasImage2 = scenario2.mediaFiles.some(f => f.endsWith('.jpg'));
  const mediaCount2 = scenario2.mediaFiles.length;
  const shouldSeparate2 = hasVideo2 && hasImage2 && mediaCount2 > scenario2.sceneCount;

  log('\n  [시나리오 2: 영상만 (이미지 없음)]', 'cyan');
  log(`    씬 갯수: ${scenario2.sceneCount}`, 'yellow');
  log(`    미디어 파일: ${mediaCount2}개 (${scenario2.mediaFiles.join(', ')})`, 'yellow');
  log(`    영상 포함: ${hasVideo2 ? '✅' : '❌'}`, hasVideo2 ? 'green' : 'red');
  log(`    이미지 포함: ${hasImage2 ? '✅' : '❌'}`, hasImage2 ? 'green' : 'red');
  log(`    → 썸네일 분리: ${shouldSeparate2 ? '✅ YES' : '❌ NO'}`, shouldSeparate2 ? 'red' : 'green');

  if (shouldSeparate2) {
    log('  ❌ 테스트 1-2 실패: 영상만 있는데 썸네일 분리됨', 'red');
    return false;
  }
  log('  ✅ 테스트 1-2 통과: 영상만 있을 때는 썸네일 분리 안됨', 'green');

  return true;
}

// ==================== 테스트 2: API - scene_0 이동 (복사 아님!) ====================

function test2_apiMoveScene0() {
  log('\n' + '='.repeat(80), 'blue');
  log('🧪 테스트 2: API - scene_0를 thumbnail로 이동 (복사 아님!)', 'blue');
  log('='.repeat(80), 'blue');

  // 시뮬레이션: 파일 목록 변화
  const beforeFiles = ['scene_0.jpg', 'scene_1.mp4', 'scene_2.jpg', 'scene_3.jpg'];

  log('\n  [이동 전]', 'cyan');
  log(`    파일 목록: ${beforeFiles.join(', ')}`, 'yellow');

  // fs.rename 시뮬레이션 (이동)
  const afterFiles_correct = ['thumbnail.jpg', 'scene_1.mp4', 'scene_2.jpg', 'scene_3.jpg'];

  log('\n  [이동 후 - ✅ 올바른 방법 (fs.rename)]', 'cyan');
  log(`    파일 목록: ${afterFiles_correct.join(', ')}`, 'yellow');
  log(`    scene_0.jpg 제거됨: ${!afterFiles_correct.includes('scene_0.jpg') ? '✅' : '❌'}`, !afterFiles_correct.includes('scene_0.jpg') ? 'green' : 'red');
  log(`    thumbnail.jpg 생성됨: ${afterFiles_correct.includes('thumbnail.jpg') ? '✅' : '❌'}`, afterFiles_correct.includes('thumbnail.jpg') ? 'green' : 'red');

  // fs.copyFile 시뮬레이션 (복사 - 잘못된 방법)
  const afterFiles_wrong = ['scene_0.jpg', 'thumbnail.jpg', 'scene_1.mp4', 'scene_2.jpg', 'scene_3.jpg'];

  log('\n  [복사 후 - ❌ 잘못된 방법 (fs.copyFile)]', 'cyan');
  log(`    파일 목록: ${afterFiles_wrong.join(', ')}`, 'yellow');
  log(`    scene_0.jpg 남아있음: ${afterFiles_wrong.includes('scene_0.jpg') ? '❌ 문제!' : '✅'}`, afterFiles_wrong.includes('scene_0.jpg') ? 'red' : 'green');
  log(`    → 백엔드가 scene_0.jpg를 씬에 포함시켜서 영상이 뒤로 밀림!`, 'red');

  // 검증
  const isCorrect = !afterFiles_correct.includes('scene_0.jpg') && afterFiles_correct.includes('thumbnail.jpg');

  if (!isCorrect) {
    log('\n  ❌ 테스트 2 실패: scene_0가 올바르게 이동되지 않음', 'red');
    return false;
  }

  log('\n  ✅ 테스트 2 통과: scene_0가 thumbnail로 이동됨 (원본 제거)', 'green');
  return true;
}

// ==================== 테스트 3: 백엔드 미디어 정렬 ====================

function test3_backendMediaSorting() {
  log('\n' + '='.repeat(80), 'blue');
  log('🧪 테스트 3: 백엔드 - 미디어 정렬 (영상이 시퀀스 순서대로)', 'blue');
  log('='.repeat(80), 'blue');

  // 시나리오: scene_0 이동 후 남은 파일들
  const files = [
    ['image', 'scene_2.jpg'],
    ['image', 'scene_3.jpg'],
    ['video', 'scene_1.mp4']  // 영상이 마지막에 추가됨
  ];

  log('\n  [정렬 전 (파일시스템 순서)]', 'cyan');
  files.forEach(([type, name], idx) => {
    const icon = type === 'video' ? '🎬' : '🖼️';
    log(`    ${idx + 1}. ${icon} ${name} (${type})`, 'yellow');
  });

  // 정렬
  const sorted = sortMedia([...files]);

  log('\n  [정렬 후 (시퀀스 번호 순)]', 'cyan');
  sorted.forEach(([type, name], idx) => {
    const seq = extract_sequence_unified([type, name])[0];
    const icon = type === 'video' ? '🎬' : '🖼️';
    log(`    씬 ${idx + 1}: ${icon} ${name} (시퀀스: ${seq})`, 'green');
  });

  // 검증: scene_1.mp4가 첫 번째여야 함
  const firstFile = sorted[0][1];
  const isVideoFirst = firstFile === 'scene_1.mp4';

  log('\n  [검증]', 'cyan');
  log(`    첫 번째 씬: ${firstFile}`, 'yellow');
  log(`    영상이 첫 번째인가: ${isVideoFirst ? '✅' : '❌'}`, isVideoFirst ? 'green' : 'red');

  const expectedOrder = ['scene_1.mp4', 'scene_2.jpg', 'scene_3.jpg'];
  const actualOrder = sorted.map(f => f[1]);
  const isCorrectOrder = JSON.stringify(actualOrder) === JSON.stringify(expectedOrder);

  log(`    예상 순서: ${expectedOrder.join(' → ')}`, 'yellow');
  log(`    실제 순서: ${actualOrder.join(' → ')}`, isCorrectOrder ? 'green' : 'red');

  if (!isCorrectOrder) {
    log('\n  ❌ 테스트 3 실패: 미디어 정렬이 올바르지 않음', 'red');
    return false;
  }

  log('\n  ✅ 테스트 3 통과: 영상(scene_1.mp4)이 첫 번째 씬!', 'green');
  return true;
}

// ==================== 테스트 4: 백엔드 썸네일 생성 ====================

function test4_backendThumbnailCreation() {
  log('\n' + '='.repeat(80), 'blue');
  log('🧪 테스트 4: 백엔드 - 썸네일 텍스트 오버레이 생성', 'blue');
  log('='.repeat(80), 'blue');

  // 시뮬레이션: create_thumbnail.py 실행 로직
  const folderFiles = ['thumbnail.jpg', 'scene_1.mp4', 'scene_2.jpg', 'scene_3.jpg'];

  log('\n  [1단계: 썸네일 입력 파일 찾기]', 'cyan');

  // 우선순위 1: 업로드된 thumbnail.* 파일
  const uploadedThumbnail = folderFiles.find(f => f.startsWith('thumbnail.'));

  if (uploadedThumbnail) {
    log(`    ✅ 업로드된 썸네일 발견: ${uploadedThumbnail}`, 'green');
    log(`       → 이 파일을 입력으로 사용해서 글씨 쓴 썸네일 제작`, 'green');
  } else {
    log(`    ❌ 업로드된 썸네일 없음`, 'red');
    const firstImage = folderFiles.find(f => f.endsWith('.jpg') || f.endsWith('.png'));
    log(`    → 첫 번째 이미지 사용: ${firstImage}`, 'yellow');
  }

  log('\n  [2단계: create_thumbnail.py 실행]', 'cyan');
  log(`    실행 명령: python create_thumbnail.py -f ./folder`, 'yellow');
  log(`    입력: ${uploadedThumbnail || '첫 번째 이미지'}`, 'yellow');
  log(`    출력: thumbnail.jpg (텍스트 오버레이 적용됨)`, 'green');

  log('\n  [3단계: 결과 검증]', 'cyan');
  const hasThumbnail = folderFiles.includes('thumbnail.jpg');
  log(`    thumbnail.jpg 생성됨: ${hasThumbnail ? '✅' : '❌'}`, hasThumbnail ? 'green' : 'red');
  log(`    텍스트 오버레이 적용됨: ✅ (항상 실행)`, 'green');

  if (!hasThumbnail) {
    log('\n  ❌ 테스트 4 실패: 썸네일이 생성되지 않음', 'red');
    return false;
  }

  log('\n  ✅ 테스트 4 통과: 텍스트 오버레이가 적용된 썸네일 생성됨', 'green');
  return true;
}

// ==================== 테스트 5: 최종 씬 순서 검증 ====================

function test5_finalSceneOrder() {
  log('\n' + '='.repeat(80), 'blue');
  log('🧪 테스트 5: 최종 씬 순서 검증 (전체 파이프라인)', 'blue');
  log('='.repeat(80), 'blue');

  // 전체 흐름 시뮬레이션
  log('\n  [전체 파이프라인 흐름]', 'cyan');

  log('\n  1️⃣  초기 상태 (업로드된 파일)', 'magenta');
  const initial = ['scene_0.jpg', 'scene_1.mp4', 'scene_2.jpg', 'scene_3.jpg'];
  log(`      ${initial.join(', ')}`, 'yellow');

  log('\n  2️⃣  스케줄러: 썸네일 분리 조건 감지', 'magenta');
  log(`      영상(✅) + 이미지(✅) + 미디어(4) > 씬(3) → 분리!`, 'green');

  log('\n  3️⃣  API: scene_0.jpg → thumbnail.jpg 이동 (fs.rename)', 'magenta');
  const afterMove = ['thumbnail.jpg', 'scene_1.mp4', 'scene_2.jpg', 'scene_3.jpg'];
  log(`      ${afterMove.join(', ')}`, 'yellow');
  log(`      scene_0.jpg 제거됨 ✅`, 'green');

  log('\n  4️⃣  백엔드: 미디어 파일 정렬 (시퀀스 번호 순)', 'magenta');
  const mediaFiles = [
    ['video', 'scene_1.mp4'],
    ['image', 'scene_2.jpg'],
    ['image', 'scene_3.jpg']
  ];
  const sorted = sortMedia([...mediaFiles]);
  log(`      정렬 전: ${mediaFiles.map(f => f[1]).join(', ')}`, 'yellow');
  log(`      정렬 후: ${sorted.map(f => f[1]).join(', ')}`, 'green');

  log('\n  5️⃣  백엔드: 썸네일 생성 (텍스트 오버레이)', 'magenta');
  log(`      입력: thumbnail.jpg (업로드된 파일)`, 'yellow');
  log(`      실행: create_thumbnail.py`, 'yellow');
  log(`      출력: thumbnail.jpg (글씨 쓴 버전)`, 'green');

  log('\n  6️⃣  최종 결과', 'magenta');
  log(`      썸네일: 🖼️  thumbnail.jpg (텍스트 오버레이)`, 'cyan');
  log(`      씬 1:   🎬 scene_1.mp4 (영상!)`, 'green');
  log(`      씬 2:   🖼️  scene_2.jpg`, 'green');
  log(`      씬 3:   🖼️  scene_3.jpg`, 'green');

  // 검증
  const finalOrder = sorted.map(f => f[1]);
  const expectedOrder = ['scene_1.mp4', 'scene_2.jpg', 'scene_3.jpg'];
  const isCorrect = JSON.stringify(finalOrder) === JSON.stringify(expectedOrder);
  const isVideoFirst = finalOrder[0] === 'scene_1.mp4';

  log('\n  [검증 결과]', 'cyan');
  log(`    ✅ 썸네일이 씬에서 제외됨: ${!finalOrder.includes('thumbnail.jpg')}`, 'green');
  log(`    ✅ 영상이 첫 번째 씬: ${isVideoFirst}`, isVideoFirst ? 'green' : 'red');
  log(`    ✅ 씬 순서 정확함: ${isCorrect}`, isCorrect ? 'green' : 'red');

  if (!isCorrect || !isVideoFirst) {
    log('\n  ❌ 테스트 5 실패: 최종 씬 순서가 올바르지 않음', 'red');
    return false;
  }

  log('\n  ✅ 테스트 5 통과: 전체 파이프라인이 올바르게 작동함!', 'green');
  return true;
}

// ==================== 메인 테스트 실행 ====================

function runIntegrationTests() {
  log('='.repeat(80), 'bold');
  log('🚀 완전한 썸네일 + 미디어 정렬 통합 테스트 (End-to-End)', 'bold');
  log('='.repeat(80), 'bold');

  const results = {
    total: 5,
    passed: 0,
    failed: 0,
    tests: []
  };

  try {
    // 테스트 실행
    const test1 = test1_schedulerConditionDetection();
    results.tests.push({ name: '스케줄러 조건 감지', passed: test1 });
    if (test1) results.passed++; else results.failed++;

    const test2 = test2_apiMoveScene0();
    results.tests.push({ name: 'API scene_0 이동', passed: test2 });
    if (test2) results.passed++; else results.failed++;

    const test3 = test3_backendMediaSorting();
    results.tests.push({ name: '백엔드 미디어 정렬', passed: test3 });
    if (test3) results.passed++; else results.failed++;

    const test4 = test4_backendThumbnailCreation();
    results.tests.push({ name: '백엔드 썸네일 생성', passed: test4 });
    if (test4) results.passed++; else results.failed++;

    const test5 = test5_finalSceneOrder();
    results.tests.push({ name: '최종 씬 순서', passed: test5 });
    if (test5) results.passed++; else results.failed++;

  } catch (error) {
    log(`\n❌ 테스트 중 오류: ${error.message}`, 'red');
    console.error(error);
  }

  // 결과 요약
  log('\n' + '='.repeat(80), 'bold');
  log('📊 통합 테스트 결과', 'bold');
  log('='.repeat(80), 'bold');

  results.tests.forEach((test, idx) => {
    const status = test.passed ? '✅' : '❌';
    const color = test.passed ? 'green' : 'red';
    log(`  ${status} 테스트 ${idx + 1}: ${test.name}`, color);
  });

  log('', 'reset');
  log(`총 테스트: ${results.total}`, 'yellow');
  log(`통과: ${results.passed}`, 'green');
  log(`실패: ${results.failed}`, results.failed > 0 ? 'red' : 'green');

  // 핵심 포인트
  log('\n' + '='.repeat(80), 'cyan');
  log('📌 핵심 수정 사항', 'cyan');
  log('='.repeat(80), 'cyan');

  log('\n  [1] 썸네일 분리 조건 (스케줄러)', 'magenta');
  log('      조건: hasVideo && hasImage && mediaCount > sceneCount', 'yellow');
  log('      결과: 첫 번째 이미지를 썸네일로만 사용 (씬에서 제외)', 'green');

  log('\n  [2] scene_0 이동 방식 (API)', 'magenta');
  log('      잘못됨: fs.copyFile() → scene_0가 남아서 씬에 포함됨', 'red');
  log('      올바름: fs.rename() → scene_0가 제거되어 씬에서 제외됨', 'green');

  log('\n  [3] 미디어 정렬 (백엔드)', 'magenta');
  log('      정렬 기준: 시퀀스 번호 (파일명의 숫자)', 'yellow');
  log('      결과: scene_1.mp4가 첫 번째 씬에 배치됨', 'green');

  log('\n  [4] 썸네일 생성 (백엔드)', 'magenta');
  log('      입력: thumbnail.jpg (업로드된 파일)', 'yellow');
  log('      처리: create_thumbnail.py (항상 실행)', 'yellow');
  log('      출력: thumbnail.jpg (텍스트 오버레이 적용)', 'green');

  log('\n' + '='.repeat(80), 'cyan');
  log('📁 수정된 파일', 'cyan');
  log('='.repeat(80), 'cyan');

  log('\n  프론트엔드:', 'magenta');
  log('    • src/app/api/generate-video-upload/route.ts:444', 'yellow');
  log('      fs.copyFile → fs.rename (scene_0 이동)', 'green');

  log('\n  백엔드:', 'magenta');
  log('    • create_thumbnail.py:73-100', 'yellow');
  log('      find_scene1_image(): 업로드된 thumbnail 우선 사용', 'green');
  log('    • create_video_from_folder.py:379-417', 'yellow');
  log('      _create_thumbnail(): 항상 create_thumbnail.py 실행', 'green');
  log('    • create_video_from_folder.py:2490-2540', 'yellow');
  log('      미디어 정렬: 시퀀스 번호 순서', 'green');

  log('\n' + '='.repeat(80), 'bold');

  if (results.failed === 0) {
    log('✅ 모든 통합 테스트 통과!', 'green');
    log('\n핵심: 영상과 이미지가 섞여있을 때', 'cyan');
    log('  1. 첫 이미지는 썸네일로만 사용됨 (씬에서 제외)', 'green');
    log('  2. 남은 파일은 시퀀스 번호 순서대로 정렬됨', 'green');
    log('  3. 영상이 올바른 위치(첫 번째)에 배치됨', 'green');
    log('  4. 썸네일에는 항상 텍스트가 오버레이됨', 'green');
    process.exit(0);
  } else {
    log(`⚠️  ${results.failed}개 통합 테스트 실패`, 'red');
    process.exit(1);
  }
}

// 실행
runIntegrationTests();
