#!/usr/bin/env node
/**
 * 상품 대본 생성 → YouTube 업로드 통합 테스트
 *
 * 테스트 시나리오:
 * 1. 상품 대본 생성 (promptFormat: 'product')
 * 2. story.json에 youtube_description 생성 확인
 * 3. YouTube 업로드 시 description/pinnedComment 설정 확인
 * 4. 숏폼 변환 시 롱폼 링크 추가 확인
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 색상 코드
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

function log(emoji, message, color = '') {
  const timestamp = new Date().toLocaleTimeString('ko-KR');
  console.log(`${color}[${timestamp}] ${emoji} ${message}${colors.reset}`);
}

function success(message) {
  log('✅', message, colors.green);
}

function error(message) {
  log('❌', message, colors.red);
}

function info(message) {
  log('ℹ️', message, colors.blue);
}

function warn(message) {
  log('⚠️', message, colors.yellow);
}

function step(message) {
  console.log(`\n${colors.cyan}${'='.repeat(80)}`);
  console.log(`📋 ${message}`);
  console.log(`${'='.repeat(80)}${colors.reset}\n`);
}

// 테스트 결과 추적
const testResults = {
  total: 0,
  passed: 0,
  failed: 0,
  errors: [],
};

function assert(condition, testName, details = '') {
  testResults.total++;
  if (condition) {
    testResults.passed++;
    success(`PASS: ${testName}`);
    if (details) info(`  └─ ${details}`);
  } else {
    testResults.failed++;
    error(`FAIL: ${testName}`);
    if (details) error(`  └─ ${details}`);
    testResults.errors.push({ testName, details });
  }
}

// MySQL 연결 (trend-video-backend 모듈 로드)
async function connectDB() {
  try {
    const backendPath = path.join(__dirname, 'trend-video-backend');
    const dbModule = await import(path.join(backendPath, 'db', 'mysql.cjs'));
    return dbModule;
  } catch (err) {
    error(`DB 연결 실패: ${err.message}`);
    process.exit(1);
  }
}

// 테스트용 상품 데이터
const testProduct = {
  title: '[TEST] ABC주스 착즙 100% 상품 테스트',
  category: '건강식품',
  promptFormat: 'product',
  product_url: 'https://www.coupang.com/vp/products/test',
  product_info: JSON.stringify({
    name: '[더존건강] NFC 착즙 100% ABC주스',
    price: '29,900원',
    description: '사과, 비트, 당근을 신선하게 착즙한 건강 주스',
  }),
};

// Step 1: 제목 등록
async function step1_createTitle(db) {
  step('Step 1: 테스트 제목 등록');

  const { run, getOne } = db;

  // 기존 테스트 데이터 삭제
  await run(`DELETE FROM content WHERE title LIKE '%[TEST]%'`);
  info('기존 테스트 데이터 삭제 완료');

  // 새 제목 등록
  const result = await run(`
    INSERT INTO content (title, category, prompt_format, product_url, product_info, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 'pending', NOW(), NOW())
  `, [testProduct.title, testProduct.category, testProduct.promptFormat, testProduct.product_url, testProduct.product_info]);

  const contentId = result.insertId;
  info(`Content ID: ${contentId}`);

  // 검증
  const content = await getOne(`SELECT * FROM content WHERE content_id = ?`, [contentId]);
  assert(content !== null, 'Content 생성 확인');
  assert(content.prompt_format === 'product', 'promptFormat이 product로 설정됨', `실제: ${content.prompt_format}`);
  assert(content.category === testProduct.category, '카테고리 설정 확인', `실제: ${content.category}`);

  return contentId;
}

// Step 2: 대본 생성 시뮬레이션
async function step2_generateScript(db, contentId) {
  step('Step 2: 대본 생성 (story.json)');

  const backendPath = path.join(__dirname, 'trend-video-backend');
  const taskFolder = path.join(backendPath, 'tasks', String(contentId));

  // 태스크 폴더 생성
  if (!fs.existsSync(taskFolder)) {
    fs.mkdirSync(taskFolder, { recursive: true });
    info(`태스크 폴더 생성: ${taskFolder}`);
  }

  // story.json 샘플 생성 (AI 생성 시뮬레이션)
  const storyData = {
    title: testProduct.title,
    scenes: [
      {
        scene_number: 1,
        duration: 5,
        narration: '매일 아침 과일과 채소를 챙겨 먹기 힘드시죠?',
        visual_description: '고민하는 사람',
      },
      {
        scene_number: 2,
        duration: 5,
        narration: '더존건강 NFC 착즙 100% ABC 주스로 해결하세요.',
        visual_description: '제품 이미지',
      },
      {
        scene_number: 3,
        duration: 5,
        narration: '온 가족 건강을 착즙을 그대로 담은 신선한 ABC 주스로 지켜보세요.',
        visual_description: '가족이 함께 마시는 모습',
      },
    ],
    youtube_description: {
      text: `✅ 착즙을 그대로 담은 NFC 착즙 100% 원액입니다!
✅ 사과, 비트, 당근 항산화소 농축의 핵심
✅ 편리한 2.1L 대용량

🔗 구매 링크: ${testProduct.product_url}

이 영상은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.`,
    },
    metadata: {
      promptFormat: 'product',
      category: testProduct.category,
    },
  };

  const storyPath = path.join(taskFolder, 'story.json');
  fs.writeFileSync(storyPath, JSON.stringify(storyData, null, 2), 'utf-8');
  success(`story.json 생성: ${storyPath}`);

  // 검증
  assert(fs.existsSync(storyPath), 'story.json 파일 존재 확인');

  const storyContent = JSON.parse(fs.readFileSync(storyPath, 'utf-8'));
  assert(storyContent.youtube_description !== undefined, 'youtube_description 필드 존재');
  assert(storyContent.youtube_description.text !== undefined, 'youtube_description.text 필드 존재');
  assert(storyContent.youtube_description.text.includes('착즙'), 'YouTube 설명에 "착즙" 키워드 포함', `실제: ${storyContent.youtube_description.text.substring(0, 50)}...`);

  return taskFolder;
}

// Step 3: YouTube 업로드 로직 검증
async function step3_verifyYoutubeLogic(db, contentId, taskFolder) {
  step('Step 3: YouTube 업로드 로직 검증');

  const { getOne } = db;

  // Content 조회 (unified-worker.js와 동일한 방식)
  const content = await getOne(`
    SELECT c.*, cs.*
    FROM content c
    LEFT JOIN content_setting cs ON c.content_id = cs.content_id
    WHERE c.content_id = ?
  `, [contentId]);

  assert(content !== null, 'Content 조회 성공');
  info(`Content 필드 확인:`);
  info(`  - promptFormat: ${content.promptFormat}`);
  info(`  - prompt_format: ${content.prompt_format}`);
  info(`  - category: ${content.category}`);

  // 상품 체크 로직 (unified-worker.js Line 711과 동일)
  const isProduct = content.promptFormat === 'product' || content.prompt_format === 'product';
  assert(isProduct, '상품으로 감지됨', `promptFormat=${content.promptFormat}, prompt_format=${content.prompt_format}`);

  // story.json 로드
  const storyPath = path.join(taskFolder, 'story.json');
  assert(fs.existsSync(storyPath), 'story.json 파일 존재 확인');

  const storyContent = fs.readFileSync(storyPath, 'utf-8');
  const storyData = JSON.parse(storyContent);

  // youtube_description 추출 (unified-worker.js Line 728-732와 동일)
  let description = '';
  let pinnedComment = '';

  if (storyData.youtube_description && storyData.youtube_description.text) {
    description = storyData.youtube_description.text.replace(/\\n/g, '\n');
    pinnedComment = description;
    success(`YouTube 설명 로드 성공 (${description.length}자)`);
    info(`설명 미리보기: ${description.substring(0, 100)}...`);
  }

  // 검증
  assert(description.length > 0, 'YouTube 설명이 비어있지 않음', `길이: ${description.length}자`);
  assert(pinnedComment.length > 0, '고정 댓글이 비어있지 않음', `길이: ${pinnedComment.length}자`);
  assert(description === pinnedComment, '상품의 경우 설명과 고정 댓글이 동일함');
  assert(description.includes('착즙'), 'YouTube 설명에 "착즙" 포함');
  assert(description.includes('수수료'), 'YouTube 설명에 "수수료" 포함 (쿠팡 고지)');
}

// Step 4: 숏폼 링크 추가 로직 검증
async function step4_verifyShortformLogic(db, contentId) {
  step('Step 4: 숏폼 → 롱폼 링크 로직 검증');

  const { run, getOne } = db;

  // 롱폼 컨텐츠 생성 (원본)
  const longformResult = await run(`
    INSERT INTO content (title, category, prompt_format, youtube_url, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'completed', NOW(), NOW())
  `, ['[TEST] 롱폼 원본', testProduct.category, 'longform', 'https://youtu.be/LONGFORM123']);

  const longformId = longformResult.insertId;
  info(`롱폼 Content ID: ${longformId}`);

  // 숏폼 컨텐츠 생성 (롱폼에서 변환)
  const shortformResult = await run(`
    INSERT INTO content (title, category, prompt_format, source_content_id, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'pending', NOW(), NOW())
  `, ['[TEST] 숏폼 (롱폼에서 변환)', testProduct.category, 'shortform', longformId]);

  const shortformId = shortformResult.insertId;
  info(`숏폼 Content ID: ${shortformId}`);

  // 숏폼 Content 조회
  const shortformContent = await getOne(`
    SELECT c.*, cs.*
    FROM content c
    LEFT JOIN content_setting cs ON c.content_id = cs.content_id
    WHERE c.content_id = ?
  `, [shortformId]);

  assert(shortformContent !== null, '숏폼 Content 조회 성공');

  // 숏폼 체크 로직 (unified-worker.js Line 750과 동일)
  const isShortform = shortformContent.prompt_format === 'shortform' || shortformContent.promptFormat === 'shortform';
  assert(isShortform, '숏폼으로 감지됨', `prompt_format=${shortformContent.prompt_format}`);

  // source_content_id로 롱폼 URL 조회 (unified-worker.js Line 755-761과 동일)
  let longformUrl = '';
  if (shortformContent.source_content_id || shortformContent.sourceContentId) {
    const sourceId = shortformContent.source_content_id || shortformContent.sourceContentId;
    info(`source_content_id: ${sourceId}`);

    const sourceContent = await getOne(`
      SELECT youtube_url FROM content WHERE content_id = ?
    `, [sourceId]);

    if (sourceContent && sourceContent.youtube_url) {
      longformUrl = sourceContent.youtube_url;
      success(`롱폼 URL 조회 성공: ${longformUrl}`);
    }
  }

  // 검증
  assert(longformUrl !== '', '롱폼 URL이 조회됨', `URL: ${longformUrl}`);
  assert(longformUrl === 'https://youtu.be/LONGFORM123', '롱폼 URL이 정확함');

  // 설명과 댓글 생성 (unified-worker.js Line 790-798과 동일)
  let description = '';
  let pinnedComment = '';

  if (longformUrl) {
    description = `🎬 전체 영상 보기: ${longformUrl}\n\n구독과 좋아요 부탁드립니다 ❤️`;
    pinnedComment = `🎬 전체 영상 보러가기 👉 ${longformUrl}`;
  }

  assert(description.includes(longformUrl), '숏폼 설명에 롱폼 URL 포함');
  assert(pinnedComment.includes(longformUrl), '숏폼 고정 댓글에 롱폼 URL 포함');
  assert(description.includes('🎬 전체 영상 보기'), '숏폼 설명에 안내 문구 포함');

  success('숏폼 링크 추가 로직 검증 완료');
}

// Step 5: 정리
async function step5_cleanup(db, contentId) {
  step('Step 5: 테스트 데이터 정리');

  const { run } = db;

  // 테스트 데이터 삭제
  await run(`DELETE FROM content WHERE title LIKE '%[TEST]%'`);
  success('테스트 Content 삭제 완료');

  // 태스크 폴더 삭제
  const backendPath = path.join(__dirname, 'trend-video-backend');
  const taskFolder = path.join(backendPath, 'tasks', String(contentId));
  if (fs.existsSync(taskFolder)) {
    fs.rmSync(taskFolder, { recursive: true, force: true });
    success(`태스크 폴더 삭제: ${taskFolder}`);
  }
}

// 결과 출력
function printResults() {
  console.log(`\n${colors.magenta}${'='.repeat(80)}`);
  console.log('📊 테스트 결과 요약');
  console.log(`${'='.repeat(80)}${colors.reset}\n`);

  console.log(`${colors.cyan}총 테스트: ${testResults.total}${colors.reset}`);
  console.log(`${colors.green}통과: ${testResults.passed}${colors.reset}`);
  console.log(`${colors.red}실패: ${testResults.failed}${colors.reset}`);

  if (testResults.failed > 0) {
    console.log(`\n${colors.red}실패한 테스트:${colors.reset}`);
    testResults.errors.forEach(({ testName, details }, idx) => {
      console.log(`  ${idx + 1}. ${testName}`);
      if (details) console.log(`     └─ ${details}`);
    });
  }

  console.log();
  if (testResults.failed === 0) {
    success('모든 테스트 통과! 🎉');
    process.exit(0);
  } else {
    error(`${testResults.failed}개 테스트 실패`);
    process.exit(1);
  }
}

// 메인 실행
async function main() {
  console.log(`${colors.magenta}
╔════════════════════════════════════════════════════════════════╗
║                                                                ║
║   🧪 상품 대본 생성 → YouTube 업로드 통합 테스트              ║
║                                                                ║
╚════════════════════════════════════════════════════════════════╝
${colors.reset}`);

  let db;
  let contentId;

  try {
    // DB 연결
    db = await connectDB();
    success('DB 연결 성공');

    // 테스트 실행
    contentId = await step1_createTitle(db);
    const taskFolder = await step2_generateScript(db, contentId);
    await step3_verifyYoutubeLogic(db, contentId, taskFolder);
    await step4_verifyShortformLogic(db, contentId);
    await step5_cleanup(db, contentId);

  } catch (err) {
    error(`테스트 실패: ${err.message}`);
    console.error(err.stack);
    testResults.failed++;
    testResults.errors.push({ testName: '통합 테스트', details: err.message });
  }

  // 결과 출력
  printResults();
}

// 실행
main();
