/**
 * 유스케이스 생성기
 * BTS-0001241: Playwright 스펙을 분석하여 체계적인 유스케이스 테이블 생성
 *
 * Usage:
 *   node automation/usecase-generator.js --spec <spec_file>
 *   node automation/usecase-generator.js --category login --auto
 *   node automation/usecase-generator.js --list
 */

const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

const dbConfig = {
  host: process.env.TREND_DB_HOST || '127.0.0.1',
  port: parseInt(process.env.TREND_DB_PORT) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'trend2024',
  database: process.env.DB_NAME || 'trend_video'
};

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

// 유스케이스 목록 조회
async function listUsecases() {
  const conn = await getConnection();
  try {
    const [rows] = await conn.execute(`
      SELECT usecase_id, name, category, priority, is_active,
             (SELECT COUNT(*) FROM test_scenario WHERE usecase_id = u.usecase_id) as scenario_count
      FROM test_usecase u
      ORDER BY category, priority, name
    `);

    if (rows.length === 0) {
      console.log('등록된 유스케이스가 없습니다.\n');
      console.log('새 유스케이스를 추가하려면:');
      console.log('  node automation/usecase-generator.js --auto\n');
      return;
    }

    console.log('\n📋 유스케이스 목록\n');
    console.log('═'.repeat(80));
    console.log(
      'ID'.padEnd(6) +
      '카테고리'.padEnd(15) +
      '우선순위'.padEnd(10) +
      '이름'.padEnd(35) +
      '시나리오'.padEnd(10) +
      '활성'
    );
    console.log('─'.repeat(80));

    for (const row of rows) {
      console.log(
        String(row.usecase_id).padEnd(6) +
        (row.category || '-').padEnd(15) +
        row.priority.padEnd(10) +
        row.name.substring(0, 33).padEnd(35) +
        String(row.scenario_count).padEnd(10) +
        (row.is_active ? '✅' : '❌')
      );
    }
    console.log('═'.repeat(80));
    console.log(`총 ${rows.length}개 유스케이스\n`);

  } finally {
    await conn.end();
  }
}

// 유스케이스 생성
async function createUsecase(usecase) {
  const conn = await getConnection();
  try {
    const [result] = await conn.execute(`
      INSERT INTO test_usecase
      (name, description, category, priority, precondition, steps, expected_result, target_url, selectors, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NOW(), NOW())
    `, [
      usecase.name,
      usecase.description || '',
      usecase.category || 'general',
      usecase.priority || 'P2',
      usecase.precondition || '',
      JSON.stringify(usecase.steps || []),
      usecase.expectedResult || '',
      usecase.targetUrl || 'http://localhost:3000',
      JSON.stringify(usecase.selectors || {})
    ]);

    console.log(`✅ 유스케이스 생성: ${usecase.name} (ID: ${result.insertId})`);
    return result.insertId;

  } finally {
    await conn.end();
  }
}

// 기본 유스케이스 템플릿
function getDefaultUsecases() {
  return [
    // 로그인/인증
    {
      name: '로그인 페이지 접근',
      description: '로그인 페이지가 정상적으로 로드되는지 확인',
      category: 'auth',
      priority: 'P1',
      precondition: '서버가 실행 중이어야 함',
      steps: [
        { action: 'goto', target: '/login' },
        { action: 'waitForSelector', target: 'input[type="email"], input[name="email"]' },
        { action: 'waitForSelector', target: 'input[type="password"]' },
        { action: 'waitForSelector', target: 'button[type="submit"]' }
      ],
      expectedResult: '로그인 폼이 화면에 표시됨',
      targetUrl: 'http://localhost:3000/login',
      selectors: {
        emailInput: 'input[type="email"], input[name="email"]',
        passwordInput: 'input[type="password"]',
        submitButton: 'button[type="submit"]'
      }
    },
    {
      name: '유효한 자격증명으로 로그인',
      description: '올바른 이메일과 비밀번호로 로그인',
      category: 'auth',
      priority: 'P1',
      precondition: '테스트 계정이 존재해야 함',
      steps: [
        { action: 'goto', target: '/login' },
        { action: 'fill', target: 'input[type="email"]', value: '{{email}}' },
        { action: 'fill', target: 'input[type="password"]', value: '{{password}}' },
        { action: 'click', target: 'button[type="submit"]' },
        { action: 'waitForURL', target: '/dashboard' }
      ],
      expectedResult: '대시보드로 리다이렉트됨',
      targetUrl: 'http://localhost:3000/login',
      selectors: {
        emailInput: 'input[type="email"]',
        passwordInput: 'input[type="password"]',
        submitButton: 'button[type="submit"]'
      }
    },
    {
      name: '잘못된 비밀번호로 로그인 시도',
      description: '틀린 비밀번호로 로그인 시 에러 메시지 확인',
      category: 'auth',
      priority: 'P2',
      precondition: '테스트 계정이 존재해야 함',
      steps: [
        { action: 'goto', target: '/login' },
        { action: 'fill', target: 'input[type="email"]', value: '{{email}}' },
        { action: 'fill', target: 'input[type="password"]', value: 'wrong_password' },
        { action: 'click', target: 'button[type="submit"]' },
        { action: 'waitForSelector', target: '[role="alert"], .error-message' }
      ],
      expectedResult: '에러 메시지가 표시됨',
      targetUrl: 'http://localhost:3000/login',
      selectors: {
        errorMessage: '[role="alert"], .error-message'
      }
    },

    // 메인 페이지
    {
      name: '메인 페이지 로드',
      description: '메인 페이지가 정상적으로 로드되는지 확인',
      category: 'main',
      priority: 'P1',
      precondition: '서버가 실행 중이어야 함',
      steps: [
        { action: 'goto', target: '/' },
        { action: 'waitForLoadState', target: 'networkidle' },
        { action: 'checkBodyText', minLength: 50 }
      ],
      expectedResult: '페이지가 정상적으로 렌더링됨',
      targetUrl: 'http://localhost:3000',
      selectors: {}
    },

    // 콘텐츠 생성
    {
      name: '콘텐츠 생성 페이지 접근',
      description: '콘텐츠 생성 페이지가 정상적으로 로드되는지 확인',
      category: 'content',
      priority: 'P1',
      precondition: '로그인 상태이어야 함',
      steps: [
        { action: 'goto', target: '/content/create' },
        { action: 'waitForSelector', target: 'form, [data-testid="content-form"]' }
      ],
      expectedResult: '콘텐츠 생성 폼이 표시됨',
      targetUrl: 'http://localhost:3000/content/create',
      selectors: {
        contentForm: 'form, [data-testid="content-form"]'
      }
    },

    // 대시보드
    {
      name: '대시보드 페이지 로드',
      description: '대시보드가 정상적으로 로드되는지 확인',
      category: 'dashboard',
      priority: 'P1',
      precondition: '로그인 상태이어야 함',
      steps: [
        { action: 'goto', target: '/dashboard' },
        { action: 'waitForLoadState', target: 'networkidle' }
      ],
      expectedResult: '대시보드가 표시됨',
      targetUrl: 'http://localhost:3000/dashboard',
      selectors: {}
    },

    // API 상태 확인
    {
      name: 'API 헬스체크',
      description: 'API 서버 상태 확인',
      category: 'api',
      priority: 'P1',
      precondition: 'API 서버가 실행 중이어야 함',
      steps: [
        { action: 'apiRequest', method: 'GET', target: '/api/health' },
        { action: 'checkResponse', status: 200 }
      ],
      expectedResult: 'API가 200 OK 응답',
      targetUrl: 'http://localhost:3000/api/health',
      selectors: {}
    }
  ];
}

// 스펙 파일에서 유스케이스 파싱
function parseSpecFile(specPath) {
  if (!fs.existsSync(specPath)) {
    console.error(`스펙 파일을 찾을 수 없습니다: ${specPath}`);
    return [];
  }

  const content = fs.readFileSync(specPath, 'utf8');
  const usecases = [];

  // Markdown 형식 파싱 (## 제목 기준)
  const sections = content.split(/^##\s+/m).filter(s => s.trim());

  for (const section of sections) {
    const lines = section.split('\n');
    const name = lines[0].trim();
    if (!name) continue;

    const body = lines.slice(1).join('\n');

    // 카테고리 추출
    const categoryMatch = body.match(/카테고리:\s*(.+)/);
    const category = categoryMatch ? categoryMatch[1].trim() : 'general';

    // 우선순위 추출
    const priorityMatch = body.match(/우선순위:\s*(P[123])/i);
    const priority = priorityMatch ? priorityMatch[1].toUpperCase() : 'P2';

    // 사전조건 추출
    const preconditionMatch = body.match(/사전조건:\s*(.+)/);
    const precondition = preconditionMatch ? preconditionMatch[1].trim() : '';

    // 기대결과 추출
    const expectedMatch = body.match(/기대결과:\s*(.+)/);
    const expectedResult = expectedMatch ? expectedMatch[1].trim() : '';

    // 단계 추출 (1. 2. 3. 형식)
    const stepMatches = body.match(/^\d+\.\s+.+$/gm) || [];
    const steps = stepMatches.map((step, index) => ({
      order: index + 1,
      description: step.replace(/^\d+\.\s+/, '').trim()
    }));

    usecases.push({
      name,
      description: body.substring(0, 500),
      category,
      priority,
      precondition,
      steps,
      expectedResult,
      targetUrl: 'http://localhost:3000',
      selectors: {}
    });
  }

  return usecases;
}

// 자동 유스케이스 생성
async function autoGenerateUsecases() {
  const defaults = getDefaultUsecases();

  console.log('\n🚀 기본 유스케이스 자동 생성 시작\n');
  console.log(`총 ${defaults.length}개 유스케이스를 추가합니다...\n`);

  for (const usecase of defaults) {
    try {
      await createUsecase(usecase);
    } catch (error) {
      if (error.code === 'ER_DUP_ENTRY') {
        console.log(`⏭️ 이미 존재: ${usecase.name}`);
      } else {
        console.error(`❌ 실패: ${usecase.name} - ${error.message}`);
      }
    }
  }

  console.log('\n✅ 유스케이스 생성 완료\n');
  await listUsecases();
}

// 메인 실행
async function main() {
  const args = parseArgs();

  if (args.list) {
    await listUsecases();
  } else if (args.auto) {
    await autoGenerateUsecases();
  } else if (args.spec) {
    const usecases = parseSpecFile(args.spec);
    if (usecases.length === 0) {
      console.log('스펙 파일에서 유스케이스를 찾을 수 없습니다.');
      return;
    }
    console.log(`\n스펙 파일에서 ${usecases.length}개 유스케이스 발견\n`);
    for (const usecase of usecases) {
      await createUsecase(usecase);
    }
  } else {
    console.log('사용법:');
    console.log('  --list          유스케이스 목록 조회');
    console.log('  --auto          기본 유스케이스 자동 생성');
    console.log('  --spec <file>   스펙 파일에서 유스케이스 추출');
  }
}

main().catch(err => {
  console.error('오류:', err.message);
  process.exit(1);
});
