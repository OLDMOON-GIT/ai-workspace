/**
 * 통합테스트 - 2025-11-16
 *
 * 테스트 항목:
 * 1. 썸네일 분리 기능 (page.tsx, automation-scheduler.ts, route.ts)
 * 2. AI 응답 플레이스홀더 치환 (scripts/generate/route.ts)
 * 3. TTS 마크다운 제거 (create_video_from_folder.py)
 */

const fs = require('fs');
const path = require('path');

let testResults = { passed: 0, failed: 0, tests: [] };

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

async function runTests() {
  console.log('🧪 통합테스트 2025-11-16 시작\n');
  console.log('='.repeat(70));

  // ============================================================
  // 1. 썸네일 분리 기능 테스트
  // ============================================================
  console.log('\n📌 1. 썸네일 분리 기능 테스트');
  console.log('-'.repeat(70));

  // 1-1. page.tsx: findIndex로 첫 번째 이미지 찾기 확인
  const pageContent = fs.readFileSync('trend-video-frontend/src/app/page.tsx', 'utf-8');
  const hasFirstImageIndex = pageContent.includes('findIndex(f => f.mediaType === \'image\')');
  const hasThumbnailSlice = pageContent.includes('allMediaFiles.slice(0, firstImageIndex)') &&
                             pageContent.includes('allMediaFiles.slice(firstImageIndex + 1)');
  addTestResult(
    '[page.tsx] 첫 번째 이미지 찾기',
    hasFirstImageIndex && hasThumbnailSlice,
    hasFirstImageIndex && hasThumbnailSlice ? 'findIndex 및 slice 로직 확인' : 'findIndex 또는 slice 누락'
  );

  // 1-2. automation-scheduler.ts: useThumbnailFromFirstImage 플래그 확인
  const schedulerContent = fs.readFileSync('trend-video-frontend/src/lib/automation-scheduler.ts', 'utf-8');
  const hasUseThumbnailFlag = schedulerContent.includes('useThumbnailFromFirstImage');
  const hasScene0Check = schedulerContent.includes('/scene_0.*\\.(png|jpg|jpeg|webp)$/i.test(firstFile)');
  addTestResult(
    '[automation-scheduler.ts] 썸네일 플래그 전달',
    hasUseThumbnailFlag && hasScene0Check,
    hasUseThumbnailFlag && hasScene0Check ? 'useThumbnailFromFirstImage 플래그 및 scene_0 체크 확인' : '플래그 또는 scene_0 체크 누락'
  );

  // 1-3. route.ts: thumbnailFile 및 useThumbnailFromFirstImage 처리 확인
  const routeContent = fs.readFileSync('trend-video-frontend/src/app/api/generate-video-upload/route.ts', 'utf-8');
  const hasThumbnailParam = routeContent.includes('let thumbnailFile: File | null = null');
  const hasUseThumbnailParam = routeContent.includes('let useThumbnailFromFirstImage: boolean = false');
  const hasThumbnailHandling = routeContent.includes('if (config.thumbnailFile)') &&
                                routeContent.includes('if (config.useThumbnailFromFirstImage && config.scriptId)');
  addTestResult(
    '[route.ts] 썸네일 처리',
    hasThumbnailParam && hasUseThumbnailParam && hasThumbnailHandling,
    hasThumbnailParam && hasUseThumbnailParam && hasThumbnailHandling ? '양쪽 케이스 모두 처리' : '파라미터 또는 처리 로직 누락'
  );

  // ============================================================
  // 2. AI 응답 플레이스홀더 치환 테스트
  // ============================================================
  console.log('\n📌 2. AI 응답 플레이스홀더 치환 테스트');
  console.log('-'.repeat(70));

  // 2-1. scripts/generate/route.ts: DB 저장 전 치환 로직 확인
  const scriptsRouteContent = fs.readFileSync('trend-video-frontend/src/app/api/scripts/generate/route.ts', 'utf-8');
  const hasPlaceholderReplacement = scriptsRouteContent.includes('AI 응답 플레이스홀더 치환 시작');
  const hasAllReplacements = scriptsRouteContent.includes('.replace(/{thumbnail}/g, productInfo.thumbnail') &&
                              scriptsRouteContent.includes('.replace(/{product_link}/g, productInfo.product_link') &&
                              scriptsRouteContent.includes('.replace(/{product_description}/g, productInfo.description');
  const hasProductTypeCheck = scriptsRouteContent.includes('(scriptType === \'product\' || scriptType === \'product-info\')');
  addTestResult(
    '[scripts/generate] 플레이스홀더 치환',
    hasPlaceholderReplacement && hasAllReplacements && hasProductTypeCheck,
    hasPlaceholderReplacement && hasAllReplacements && hasProductTypeCheck ?
      'DB 저장 전 치환 로직 확인 (product, product-info 모두)' :
      '치환 로직 또는 타입 체크 누락'
  );

  // ============================================================
  // 3. TTS 마크다운 제거 테스트
  // ============================================================
  console.log('\n📌 3. TTS 마크다운 제거 테스트');
  console.log('-'.repeat(70));

  // 3-1. create_video_from_folder.py: 마크다운 기호 제거 확인
  const pythonContent = fs.readFileSync('trend-video-backend/create_video_from_folder.py', 'utf-8');
  const hasMarkdownRemoval = pythonContent.includes("cleaned.replace('**', '')") &&
                              pythonContent.includes("cleaned.replace('*', '')") &&
                              pythonContent.includes("cleaned.replace('__', '')") &&
                              pythonContent.includes("cleaned.replace('`', '')");
  const hasCommentAboutKorean = pythonContent.includes('한글 "별표"는 유지됨');
  addTestResult(
    '[create_video_from_folder.py] 마크다운 제거',
    hasMarkdownRemoval && hasCommentAboutKorean,
    hasMarkdownRemoval && hasCommentAboutKorean ?
      '**, *, __, ` 제거 확인 (한글은 유지)' :
      '마크다운 제거 또는 주석 누락'
  );

  // ============================================================
  // 4. 3종 세트 규칙 준수 확인
  // ============================================================
  console.log('\n📌 4. 3종 세트 규칙 준수 확인');
  console.log('-'.repeat(70));

  // 4-1. 썸네일 기능이 3개 파일 모두에 있는지 확인
  const hasPageThumbnail = pageContent.includes('thumbnailFile');
  const hasSchedulerThumbnail = schedulerContent.includes('useThumbnailFromFirstImage');
  const hasRouteThumbnail = routeContent.includes('thumbnailFile') && routeContent.includes('useThumbnailFromFirstImage');
  addTestResult(
    '[3종 세트] 썸네일 분리 구현',
    hasPageThumbnail && hasSchedulerThumbnail && hasRouteThumbnail,
    hasPageThumbnail && hasSchedulerThumbnail && hasRouteThumbnail ?
      'page.tsx, automation-scheduler.ts, route.ts 모두 구현됨' :
      '일부 파일 누락'
  );

  // ============================================================
  // 5. 개발 가이드 업데이트 확인
  // ============================================================
  console.log('\n📌 5. 개발 가이드 업데이트 확인');
  console.log('-'.repeat(70));

  // 5-1. DEVELOPMENT_GUIDE.md: 3종 세트 규칙 섹션 확인
  const devGuideContent = fs.readFileSync('DEVELOPMENT_GUIDE.md', 'utf-8');
  const has3SetRule = devGuideContent.includes('영상 생성 3종 세트 규칙');
  const hasArchitectureDiagram = devGuideContent.includes('page.tsx') &&
                                  devGuideContent.includes('automation-scheduler.ts') &&
                                  devGuideContent.includes('generate-video-upload');
  const hasChecklist = devGuideContent.includes('체크리스트');
  addTestResult(
    '[DEVELOPMENT_GUIDE.md] 3종 세트 규칙',
    has3SetRule && hasArchitectureDiagram && hasChecklist,
    has3SetRule && hasArchitectureDiagram && hasChecklist ?
      '3종 세트 규칙 섹션 확인 (다이어그램, 체크리스트 포함)' :
      '3종 세트 규칙 섹션 또는 내용 누락'
  );

  // ============================================================
  // 6. Git 커밋 히스토리 확인
  // ============================================================
  console.log('\n📌 6. Git 커밋 히스토리 확인');
  console.log('-'.repeat(70));

  const { execSync } = require('child_process');

  // 6-1. Frontend 최근 커밋 확인
  try {
    const frontendCommits = execSync('cd trend-video-frontend && git log --oneline -10', { encoding: 'utf-8' });
    const hasPlaceholderCommit = frontendCommits.includes('플레이스홀더') || frontendCommits.includes('placeholder');
    const hasThumbnailCommit = frontendCommits.includes('이미지') || frontendCommits.includes('thumbnail') || frontendCommits.includes('씬');
    addTestResult(
      '[Frontend] 커밋 히스토리',
      hasPlaceholderCommit || hasThumbnailCommit,
      hasPlaceholderCommit || hasThumbnailCommit ?
        '최근 커밋 확인 (플레이스홀더/썸네일/이미지 관련)' :
        '관련 커밋 찾을 수 없음'
    );
  } catch (e) {
    addTestResult('[Frontend] 커밋 히스토리', false, `Git 명령어 실패: ${e.message}`);
  }

  // 6-2. Backend 최근 커밋 확인
  const backendCommits = execSync('cd trend-video-backend && git log --oneline -5', { encoding: 'utf-8' });
  const hasMarkdownCommit = backendCommits.includes('마크다운') || backendCommits.includes('markdown');
  addTestResult(
    '[Backend] 커밋 히스토리',
    hasMarkdownCommit,
    hasMarkdownCommit ? 'TTS 마크다운 제거 커밋 확인' : '마크다운 커밋 누락'
  );

  // ============================================================
  // 결과 출력
  // ============================================================
  console.log('\n' + '='.repeat(70));
  console.log('📊 테스트 결과');
  console.log('='.repeat(70));
  console.log(`✅ 통과: ${testResults.passed}/${testResults.tests.length}`);
  console.log(`❌ 실패: ${testResults.failed}/${testResults.tests.length}`);
  console.log('');

  if (testResults.failed > 0) {
    console.log('⚠️ 실패한 테스트:');
    testResults.tests.filter(t => !t.passed).forEach(t => {
      console.log(`   - ${t.name}: ${t.message}`);
    });
    console.log('');
  }

  // 종료 코드
  process.exit(testResults.failed === 0 ? 0 : 1);
}

runTests();
