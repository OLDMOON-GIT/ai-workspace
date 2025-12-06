/**
 * SPEC-3200: UI 자동 테스트 Usecase 자동 생성 시스템
 *
 * 소스코드를 분석하여 자동으로 UI 요소를 감지하고 테스트 usecase를 생성합니다.
 * - 버튼, 폼, 링크, 입력 필드 등 UI 요소 자동 감지
 * - 감지된 요소를 기반으로 Playwright 테스트 케이스 생성
 * - 10분마다 주기적으로 실행하여 새로운 UI 요소 탐지
 * - 기존 usecase와 중복 체크하여 신규만 등록
 *
 * Usage:
 *   node automation/auto-usecase-scanner.js --scan         # 1회 스캔
 *   node automation/auto-usecase-scanner.js --daemon       # 10분 주기 실행
 *   node automation/auto-usecase-scanner.js --list         # 감지된 요소 목록
 */

const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
const glob = require('glob');

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'trend2024',
  database: process.env.DB_NAME || 'trend_video'
};

const FRONTEND_PATH = path.join(__dirname, '..', 'trend-video-frontend', 'src');
const SCAN_INTERVAL = 10 * 60 * 1000; // 10분

// UI 요소 패턴 정의
const UI_PATTERNS = {
  // 버튼
  button: {
    patterns: [
      /<button[^>]*>([^<]*)<\/button>/gi,
      /<Button[^>]*>([^<]*)<\/Button>/gi,
      /onClick\s*=\s*\{[^}]*\}/gi,
      /type\s*=\s*["']submit["']/gi
    ],
    category: 'interaction'
  },
  // 링크
  link: {
    patterns: [
      /<Link[^>]*href\s*=\s*["']([^"']+)["'][^>]*>/gi,
      /<a[^>]*href\s*=\s*["']([^"']+)["'][^>]*>/gi
    ],
    category: 'navigation'
  },
  // 입력 필드
  input: {
    patterns: [
      /<input[^>]*type\s*=\s*["']([^"']+)["'][^>]*/gi,
      /<Input[^>]*/gi,
      /<textarea[^>]*/gi,
      /<select[^>]*/gi
    ],
    category: 'form'
  },
  // 폼
  form: {
    patterns: [
      /<form[^>]*onSubmit[^>]*/gi,
      /handleSubmit|onSubmit/gi
    ],
    category: 'form'
  },
  // 모달
  modal: {
    patterns: [
      /isOpen|isModalOpen|showModal/gi,
      /Modal[^>]*>/gi,
      /Dialog[^>]*>/gi
    ],
    category: 'modal'
  }
};

// 페이지 라우트 패턴 (Next.js App Router)
const PAGE_ROUTE_PATTERN = /page\.tsx$/;

function parseArgs() {
  const args = process.argv.slice(2);
  const parsed = {};
  for (let i = 0; i < args.length; i++) {
    const current = args[i];
    if (current.startsWith('--')) {
      const key = current.replace(/^--/, '');
      const value = args[i + 1] && !args[i + 1].startsWith('--') ? args[++i] : true;
      parsed[key] = value;
    }
  }
  return parsed;
}

async function getConnection() {
  return await mysql.createConnection(dbConfig);
}

/**
 * 소스 파일에서 UI 요소 감지
 */
function scanFileForUIElements(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const relativePath = path.relative(FRONTEND_PATH, filePath);
  const elements = [];

  // 페이지 URL 추출 (Next.js App Router 기준)
  let pageUrl = '/';
  const appMatch = relativePath.match(/app[\\\/](.+)[\\\/]page\.tsx$/);
  if (appMatch) {
    pageUrl = '/' + appMatch[1].replace(/\\/g, '/').replace(/\[([^\]]+)\]/g, ':$1');
  }

  // 각 UI 패턴 검사
  for (const [type, config] of Object.entries(UI_PATTERNS)) {
    for (const pattern of config.patterns) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(content)) !== null) {
        const lineNumber = content.substring(0, match.index).split('\n').length;

        elements.push({
          type,
          category: config.category,
          file: relativePath,
          line: lineNumber,
          pageUrl,
          matchText: match[0].substring(0, 100),
          capturedGroup: match[1] || null
        });
      }
    }
  }

  return elements;
}

/**
 * 전체 프론트엔드 소스 스캔
 */
function scanAllSources() {
  const pattern = path.join(FRONTEND_PATH, '**', '*.tsx');
  const files = glob.sync(pattern.replace(/\\/g, '/'));

  console.log(`\n📂 ${files.length}개 TSX 파일 스캔 중...\n`);

  const allElements = [];
  const pageFiles = [];

  for (const file of files) {
    // page.tsx 파일 (페이지 라우트) 별도 추적
    if (PAGE_ROUTE_PATTERN.test(file)) {
      pageFiles.push(file);
    }

    const elements = scanFileForUIElements(file);
    allElements.push(...elements);
  }

  console.log(`✅ 감지된 UI 요소: ${allElements.length}개`);
  console.log(`📄 페이지 라우트: ${pageFiles.length}개\n`);

  return { elements: allElements, pageFiles };
}

/**
 * 감지된 요소를 기반으로 usecase 생성
 */
function generateUsecasesFromElements(elements, pageFiles) {
  const usecases = [];
  const seenPages = new Set();

  // 1. 페이지 로드 테스트 자동 생성
  for (const pageFile of pageFiles) {
    const relativePath = path.relative(FRONTEND_PATH, pageFile);
    const appMatch = relativePath.match(/app[\\\/](.+)[\\\/]page\.tsx$/);

    if (appMatch) {
      let pageUrl = '/' + appMatch[1].replace(/\\/g, '/').replace(/\[([^\]]+)\]/g, ':$1');

      // 동적 라우트 제외 (실제 파라미터가 필요한 경우)
      if (pageUrl.includes(':')) continue;

      // admin 페이지만 테스트 (인증이 필요한 페이지)
      if (!pageUrl.startsWith('/admin')) continue;

      if (seenPages.has(pageUrl)) continue;
      seenPages.add(pageUrl);

      const pageName = pageUrl.split('/').pop() || 'home';

      usecases.push({
        name: `[자동] ${pageName} 페이지 로드 확인`,
        description: `자동 감지: ${relativePath} - 페이지가 정상적으로 로드되는지 확인`,
        category: 'auto-page',
        priority: 'P2',
        precondition: '로그인 상태이어야 함',
        steps: [
          { action: 'goto', target: pageUrl },
          { action: 'waitForLoadState', target: 'networkidle' },
          { action: 'checkNoErrors' }
        ],
        expectedResult: '페이지가 에러 없이 로드됨',
        targetUrl: `http://localhost:3000${pageUrl}`,
        selectors: {},
        sourceFile: relativePath,
        autoGenerated: true
      });
    }
  }

  // 2. 버튼 클릭 테스트 자동 생성 (주요 페이지만)
  const buttonElements = elements.filter(e => e.type === 'button' && e.capturedGroup);
  const buttonsByPage = {};

  for (const btn of buttonElements) {
    if (!buttonsByPage[btn.pageUrl]) {
      buttonsByPage[btn.pageUrl] = [];
    }
    buttonsByPage[btn.pageUrl].push(btn);
  }

  for (const [pageUrl, buttons] of Object.entries(buttonsByPage)) {
    if (!pageUrl.startsWith('/admin')) continue;

    // 페이지당 최대 3개 버튼만
    const uniqueButtons = buttons
      .filter(b => b.capturedGroup && b.capturedGroup.length > 1)
      .slice(0, 3);

    for (const btn of uniqueButtons) {
      const btnText = btn.capturedGroup.trim();
      if (!btnText || btnText.length > 20) continue;

      usecases.push({
        name: `[자동] ${pageUrl} - "${btnText}" 버튼 존재 확인`,
        description: `자동 감지: ${btn.file}:${btn.line} - 버튼 요소 존재 확인`,
        category: 'auto-button',
        priority: 'P3',
        precondition: '로그인 상태이어야 함',
        steps: [
          { action: 'goto', target: pageUrl },
          { action: 'waitForSelector', target: `button:has-text("${btnText}")` }
        ],
        expectedResult: `"${btnText}" 버튼이 화면에 표시됨`,
        targetUrl: `http://localhost:3000${pageUrl}`,
        selectors: { button: `button:has-text("${btnText}")` },
        sourceFile: btn.file,
        sourceLine: btn.line,
        autoGenerated: true
      });
    }
  }

  // 3. 폼 존재 테스트 자동 생성
  const formElements = elements.filter(e => e.type === 'form');
  const formPages = new Set();

  for (const form of formElements) {
    if (formPages.has(form.pageUrl)) continue;
    if (!form.pageUrl.startsWith('/admin')) continue;

    formPages.add(form.pageUrl);

    usecases.push({
      name: `[자동] ${form.pageUrl} - 폼 요소 존재 확인`,
      description: `자동 감지: ${form.file}:${form.line} - 페이지에 폼이 존재하는지 확인`,
      category: 'auto-form',
      priority: 'P3',
      precondition: '로그인 상태이어야 함',
      steps: [
        { action: 'goto', target: form.pageUrl },
        { action: 'waitForSelector', target: 'form, [data-testid*="form"]' }
      ],
      expectedResult: '폼 요소가 화면에 표시됨',
      targetUrl: `http://localhost:3000${form.pageUrl}`,
      selectors: { form: 'form' },
      sourceFile: form.file,
      sourceLine: form.line,
      autoGenerated: true
    });
  }

  return usecases;
}

/**
 * 기존 usecase와 중복 체크 후 신규만 등록
 */
async function registerNewUsecases(usecases) {
  const conn = await getConnection();
  let created = 0;
  let skipped = 0;

  try {
    // 기존 자동 생성된 usecase 이름 목록 가져오기
    const [existingRows] = await conn.execute(`
      SELECT name FROM test_usecase WHERE name LIKE '[자동]%'
    `);
    const existingNames = new Set(existingRows.map(r => r.name));

    for (const usecase of usecases) {
      if (existingNames.has(usecase.name)) {
        skipped++;
        continue;
      }

      try {
        await conn.execute(`
          INSERT INTO test_usecase
          (name, description, category, priority, precondition, steps, expected_result, target_url, selectors, is_active, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NOW(), NOW())
        `, [
          usecase.name,
          usecase.description || '',
          usecase.category || 'auto',
          usecase.priority || 'P3',
          usecase.precondition || '',
          JSON.stringify(usecase.steps || []),
          usecase.expectedResult || '',
          usecase.targetUrl || 'http://localhost:3000',
          JSON.stringify(usecase.selectors || {})
        ]);

        console.log(`✅ 신규 등록: ${usecase.name}`);
        created++;

      } catch (error) {
        if (error.code !== 'ER_DUP_ENTRY') {
          console.error(`❌ 등록 실패: ${usecase.name} - ${error.message}`);
        }
      }
    }

    console.log(`\n📊 결과: 신규 ${created}개 등록, ${skipped}개 중복 스킵\n`);

  } finally {
    await conn.end();
  }

  return { created, skipped };
}

/**
 * 감지된 요소 통계 출력
 */
function printElementStats(elements) {
  const stats = {};

  for (const el of elements) {
    if (!stats[el.type]) {
      stats[el.type] = { count: 0, pages: new Set() };
    }
    stats[el.type].count++;
    stats[el.type].pages.add(el.pageUrl);
  }

  console.log('\n📊 UI 요소 감지 통계\n');
  console.log('═'.repeat(60));
  console.log('타입'.padEnd(15) + '감지 수'.padEnd(15) + '페이지 수');
  console.log('─'.repeat(60));

  for (const [type, data] of Object.entries(stats)) {
    console.log(
      type.padEnd(15) +
      String(data.count).padEnd(15) +
      data.pages.size
    );
  }

  console.log('═'.repeat(60));
  console.log(`총 ${elements.length}개 요소\n`);
}

/**
 * 1회 스캔 실행
 */
async function runScan() {
  console.log('\n🔍 UI 요소 자동 스캔 시작...');
  console.log(`📁 스캔 경로: ${FRONTEND_PATH}\n`);

  const { elements, pageFiles } = scanAllSources();
  printElementStats(elements);

  const usecases = generateUsecasesFromElements(elements, pageFiles);
  console.log(`📝 생성할 usecase: ${usecases.length}개\n`);

  if (usecases.length > 0) {
    await registerNewUsecases(usecases);
  }
}

/**
 * 데몬 모드 (10분 주기 실행)
 */
async function runDaemon() {
  console.log('\n🔄 UI 자동 스캔 데몬 시작');
  console.log(`⏰ 스캔 주기: ${SCAN_INTERVAL / 1000 / 60}분\n`);

  // 최초 실행
  await runScan();

  // 주기적 실행
  setInterval(async () => {
    console.log(`\n[${new Date().toISOString()}] 주기적 스캔 실행...\n`);
    await runScan();
  }, SCAN_INTERVAL);

  // 프로세스 유지
  console.log('데몬 실행 중... Ctrl+C로 종료\n');
}

/**
 * 감지된 요소 목록 출력
 */
async function listDetectedElements() {
  const { elements } = scanAllSources();
  printElementStats(elements);

  // 페이지별로 그룹화하여 출력
  const byPage = {};
  for (const el of elements) {
    if (!byPage[el.pageUrl]) {
      byPage[el.pageUrl] = [];
    }
    byPage[el.pageUrl].push(el);
  }

  console.log('\n📄 페이지별 UI 요소\n');
  for (const [page, pageElements] of Object.entries(byPage)) {
    if (!page.startsWith('/admin')) continue;

    console.log(`\n${page}:`);
    const types = {};
    for (const el of pageElements) {
      types[el.type] = (types[el.type] || 0) + 1;
    }
    for (const [type, count] of Object.entries(types)) {
      console.log(`  - ${type}: ${count}개`);
    }
  }
}

// 메인 실행
async function main() {
  const args = parseArgs();

  if (args.daemon) {
    await runDaemon();
  } else if (args.list) {
    await listDetectedElements();
  } else if (args.scan) {
    await runScan();
  } else {
    console.log('UI 자동 테스트 Usecase 생성기\n');
    console.log('사용법:');
    console.log('  --scan    1회 스캔 및 usecase 등록');
    console.log('  --daemon  10분 주기 자동 스캔 (백그라운드)');
    console.log('  --list    감지된 UI 요소 목록 출력');
  }
}

main().catch(err => {
  console.error('오류:', err.message);
  process.exit(1);
});
