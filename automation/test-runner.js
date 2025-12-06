/**
 * Playwright 테스트 실행기
 * BTS-0001241: 테스트 시나리오 자동 실행
 *
 * Usage:
 *   node automation/test-runner.js --runId 123
 *   node automation/test-runner.js --scenarioId 456
 *   node automation/test-runner.js --category login
 *   node automation/test-runner.js --all
 */

const { chromium } = require('playwright');
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

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:2000';
const ARTIFACTS_DIR = path.join(__dirname, 'artifacts', 'test-runs');

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

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

async function getConnection() {
  return await mysql.createConnection(dbConfig);
}

// 테스트 실행 상태 업데이트
async function updateTestRun(conn, runId, updates) {
  const setClauses = [];
  const params = [];

  for (const [key, value] of Object.entries(updates)) {
    const columnName = key.replace(/([A-Z])/g, '_$1').toLowerCase();
    setClauses.push(`${columnName} = ?`);
    params.push(value);
  }

  params.push(runId);
  await conn.execute(
    `UPDATE test_run SET ${setClauses.join(', ')} WHERE run_id = ?`,
    params
  );
}

// 시나리오 통계 업데이트
async function updateScenarioStats(conn, scenarioId, passed, durationMs, error = null) {
  await conn.execute(
    `UPDATE test_scenario SET
      run_count = run_count + 1,
      pass_count = pass_count + ?,
      fail_count = fail_count + ?,
      last_run_at = NOW(),
      last_duration_ms = ?,
      last_error = ?,
      status = ?
    WHERE scenario_id = ?`,
    [
      passed ? 1 : 0,
      passed ? 0 : 1,
      durationMs,
      error,
      passed ? 'passed' : 'failed',
      scenarioId
    ]
  );
}

// 테스트 상세 결과 기록
async function recordTestDetail(conn, runId, scenarioId, status, durationMs, errorMessage, screenshotPath) {
  await conn.execute(
    `INSERT INTO test_run_detail (run_id, scenario_id, status, duration_ms, error_message, screenshot_path)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [runId, scenarioId, status, durationMs, errorMessage, screenshotPath]
  );
}

// 타임아웃 관련 에러인지 확인 (시나리오 수정 필요한 경우)
function isTimeoutError(errorMessage) {
  const timeoutPatterns = [
    /Timeout \d+ms exceeded/i,
    /waitForSelector/i,
    /waiting for selector/i,
    /waiting for locator/i,
    /locator\.fill/i,
    /locator\.click/i,
    /page\.waitFor/i,
    /element not found/i,
    /No element matching/i,
    /Target closed/i,
    /Navigation failed/i
  ];
  return timeoutPatterns.some(pattern => pattern.test(errorMessage));
}

// 페이지 DOM 구조 힌트 추출
async function extractDOMHint(page) {
  try {
    if (!page) return '페이지 접근 불가';

    // 현재 페이지 URL
    const url = page.url();

    // 주요 셀렉터 힌트 추출
    const domHint = await page.evaluate(() => {
      const hints = [];

      // 주요 form 요소들
      const inputs = document.querySelectorAll('input[name], input[id], input[data-testid]');
      inputs.forEach(el => {
        const info = [];
        if (el.name) info.push(`name="${el.name}"`);
        if (el.id) info.push(`id="${el.id}"`);
        if (el.getAttribute('data-testid')) info.push(`data-testid="${el.getAttribute('data-testid')}"`);
        if (el.type) info.push(`type="${el.type}"`);
        if (info.length) hints.push(`input[${info.join(', ')}]`);
      });

      // 버튼들
      const buttons = document.querySelectorAll('button[id], button[data-testid], button[type="submit"]');
      buttons.forEach(el => {
        const info = [];
        if (el.id) info.push(`id="${el.id}"`);
        if (el.getAttribute('data-testid')) info.push(`data-testid="${el.getAttribute('data-testid')}"`);
        if (el.textContent) info.push(`text="${el.textContent.trim().substring(0, 30)}"`);
        hints.push(`button[${info.join(', ')}]`);
      });

      // 링크들 (주요)
      const links = document.querySelectorAll('a[href][id], a[href][data-testid]');
      links.forEach(el => {
        const info = [];
        if (el.id) info.push(`id="${el.id}"`);
        if (el.getAttribute('data-testid')) info.push(`data-testid="${el.getAttribute('data-testid')}"`);
        if (el.href) info.push(`href="${el.href.substring(0, 50)}"`);
        hints.push(`a[${info.join(', ')}]`);
      });

      return hints.slice(0, 30).join('\n');
    });

    return `URL: ${url}\n\n주요 셀렉터:\n${domHint || '(추출 실패)'}`;
  } catch (err) {
    return `DOM 힌트 추출 실패: ${err.message}`;
  }
}

// UI 테스트 실패 시 BTS에 시나리오 수정 요청 자동 등록
async function registerScenarioFixBug(conn, scenario, errorMessage, domHint) {
  const title = `UI 테스트 시나리오 수정 필요: ${scenario.name}`;

  const summary = `## 실패 정보
- **scenario_id**: ${scenario.scenario_id}
- **시나리오명**: ${scenario.name}
- **에러 메시지**: ${errorMessage}

## 현재 test_code
\`\`\`javascript
${scenario.test_code || '(없음)'}
\`\`\`

## 페이지 DOM 구조 힌트
\`\`\`
${domHint}
\`\`\`

## 수정 요청 사항
AI가 위 DOM 구조를 참고하여 실제 존재하는 selector로 test_code를 수정해야 합니다.
수정된 코드는 test_scenario 테이블의 해당 레코드에 UPDATE 해주세요.`;

  try {
    // 중복 체크 - 동일 시나리오에 대해 이미 열린 SPEC이 있는지
    const [existing] = await conn.execute(
      `SELECT id FROM bugs WHERE type = 'spec' AND status = 'open'
       AND title LIKE ? LIMIT 1`,
      [`%시나리오 수정 필요: ${scenario.name}%`]
    );

    if (existing.length > 0) {
      console.log(`  ℹ️ 이미 등록된 SPEC: BTS-${existing[0].id}`);
      return existing[0].id;
    }

    // 새 SPEC 등록
    await conn.execute(
      `INSERT INTO bugs (title, summary, status, priority, type, created_at, updated_at)
       VALUES (?, ?, 'open', 'P1', 'spec', NOW(), NOW())`,
      [title, summary]
    );

    const [result] = await conn.execute('SELECT LAST_INSERT_ID() as id');
    const bugId = result[0].id;
    console.log(`  📝 시나리오 수정 SPEC 등록: BTS-${bugId}`);
    return bugId;
  } catch (err) {
    console.error(`  ⚠️ BTS 등록 실패: ${err.message}`);
    return null;
  }
}

// 단일 시나리오 실행
async function executeScenario(browser, scenario, runDir, conn) {
  const startTime = Date.now();
  let page;
  let context;
  let error = null;
  let screenshotPath = null;
  let domHint = null;

  try {
    // 컨텍스트 및 페이지 생성 (타임아웃 감소 - 30초 대기는 무의미)
    context = await browser.newContext({
      recordVideo: { dir: runDir }
    });
    await context.tracing.start({ screenshots: true, snapshots: true });
    page = await context.newPage();

    // 기본 타임아웃을 10초로 설정 (30초는 무의미한 대기)
    page.setDefaultTimeout(10000);

    // 테스트 코드 실행
    const testCode = scenario.test_code;
    const testData = scenario.test_data ?
      (typeof scenario.test_data === 'string' ? JSON.parse(scenario.test_data) : scenario.test_data) : {};

    if (!testCode) {
      throw new Error('테스트 코드가 없습니다');
    }

    // 테스트 코드를 함수로 변환하여 실행
    // 테스트 코드는 async function(page, testData, BASE_URL, baseUrl) 형태로 작성되어야 함
    // baseUrl도 전달하여 호환성 유지
    const testFn = new Function('page', 'testData', 'BASE_URL', 'baseUrl', `
      return (async () => {
        ${testCode}
      })();
    `);

    await testFn(page, testData, BASE_URL, BASE_URL);

    // 성공 시 스크린샷
    screenshotPath = path.join(runDir, `scenario-${scenario.scenario_id}-success.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });

  } catch (err) {
    error = err.message || String(err);

    // 실패 시 DOM 힌트 추출 (BTS 등록용)
    if (page) {
      try {
        domHint = await extractDOMHint(page);
      } catch (hintErr) {
        domHint = `DOM 힌트 추출 실패: ${hintErr.message}`;
      }

      // 스크린샷
      try {
        screenshotPath = path.join(runDir, `scenario-${scenario.scenario_id}-error.png`);
        await page.screenshot({ path: screenshotPath, fullPage: true });
      } catch (ssErr) {
        console.error('스크린샷 저장 실패:', ssErr.message);
      }
    }

    // 타임아웃/셀렉터 에러 시 자동으로 시나리오 수정 SPEC 등록
    if (isTimeoutError(error) && conn) {
      await registerScenarioFixBug(conn, scenario, error, domHint || '(DOM 추출 불가)');
    }
  } finally {
    // Trace 저장
    if (context) {
      try {
        const tracePath = path.join(runDir, `scenario-${scenario.scenario_id}-trace.zip`);
        await context.tracing.stop({ path: tracePath });
      } catch (traceErr) {
        console.error('Trace 저장 실패:', traceErr.message);
      }
      await context.close();
    }
  }

  const durationMs = Date.now() - startTime;

  return {
    scenarioId: scenario.scenario_id,
    scenarioName: scenario.name,
    passed: !error,
    durationMs,
    error,
    screenshotPath
  };
}

// 메인 실행 함수
async function runTests(options) {
  const { runId, scenarioId, category, all } = options;

  let conn;
  let browser;

  try {
    conn = await getConnection();

    // 실행할 시나리오 목록 조회
    let scenarios = [];
    let testRunId = runId;

    if (runId) {
      // 기존 run의 시나리오들 조회
      const [runInfo] = await conn.execute(
        'SELECT * FROM test_run WHERE run_id = ?', [runId]
      );

      if (runInfo.length === 0) {
        throw new Error(`테스트 실행 ID ${runId}를 찾을 수 없습니다`);
      }

      const run = runInfo[0];

      if (run.run_type === 'single' && run.scenario_id) {
        const [scns] = await conn.execute(
          'SELECT * FROM test_scenario WHERE scenario_id = ?', [run.scenario_id]
        );
        scenarios = scns;
      } else if (run.run_type === 'category') {
        const metadata = run.metadata ? JSON.parse(run.metadata) : {};
        const [scns] = await conn.execute(`
          SELECT s.* FROM test_scenario s
          JOIN test_usecase u ON s.usecase_id = u.usecase_id
          WHERE u.category = ? AND u.is_active = 1
        `, [metadata.category]);
        scenarios = scns;
      } else if (run.run_type === 'all') {
        const [scns] = await conn.execute(`
          SELECT s.* FROM test_scenario s
          JOIN test_usecase u ON s.usecase_id = u.usecase_id
          WHERE u.is_active = 1
        `);
        scenarios = scns;
      }
    } else {
      // 새로운 테스트 실행 생성
      if (scenarioId) {
        const [scns] = await conn.execute(
          'SELECT * FROM test_scenario WHERE scenario_id = ?', [scenarioId]
        );
        scenarios = scns;
      } else if (category) {
        const [scns] = await conn.execute(`
          SELECT s.* FROM test_scenario s
          JOIN test_usecase u ON s.usecase_id = u.usecase_id
          WHERE u.category = ? AND u.is_active = 1
        `, [category]);
        scenarios = scns;
      } else if (all) {
        const [scns] = await conn.execute(`
          SELECT s.* FROM test_scenario s
          JOIN test_usecase u ON s.usecase_id = u.usecase_id
          WHERE u.is_active = 1
        `);
        scenarios = scns;
      }

      if (scenarios.length === 0) {
        console.log('실행할 시나리오가 없습니다');
        return;
      }

      // 새 test_run 레코드 생성
      const runType = scenarioId ? 'single' : (category ? 'category' : 'all');
      const [insertResult] = await conn.execute(
        `INSERT INTO test_run (scenario_id, run_type, status, total_count, started_at, metadata)
         VALUES (?, ?, 'running', ?, NOW(), ?)`,
        [
          scenarioId || null,
          runType,
          scenarios.length,
          JSON.stringify({ category: category || null })
        ]
      );
      testRunId = insertResult.insertId;
    }

    if (scenarios.length === 0) {
      console.log('실행할 시나리오가 없습니다');
      return;
    }

    console.log(`\n🚀 테스트 실행 시작 (runId: ${testRunId})`);
    console.log(`📋 총 ${scenarios.length}개 시나리오\n`);

    // 실행 상태를 running으로 업데이트
    await updateTestRun(conn, testRunId, { status: 'running' });

    // artifacts 디렉토리 생성
    const runDir = path.join(ARTIFACTS_DIR, `run-${testRunId}`);
    ensureDir(runDir);

    // 브라우저 시작
    browser = await chromium.launch({ headless: true });

    // 테스트 실행
    const results = {
      passed: 0,
      failed: 0,
      skipped: 0,
      errors: []
    };

    const totalStartTime = Date.now();

    for (const scenario of scenarios) {
      console.log(`\n▶️ 실행: ${scenario.name} (ID: ${scenario.scenario_id})`);

      const result = await executeScenario(browser, scenario, runDir, conn);

      if (result.passed) {
        results.passed++;
        console.log(`  ✅ 성공 (${result.durationMs}ms)`);
      } else {
        results.failed++;
        results.errors.push({
          scenarioId: result.scenarioId,
          name: result.scenarioName,
          error: result.error
        });
        console.log(`  ❌ 실패: ${result.error}`);
      }

      // DB에 상세 결과 기록
      await recordTestDetail(
        conn,
        testRunId,
        result.scenarioId,
        result.passed ? 'passed' : 'failed',
        result.durationMs,
        result.error,
        result.screenshotPath
      );

      // 시나리오 통계 업데이트
      await updateScenarioStats(
        conn,
        result.scenarioId,
        result.passed,
        result.durationMs,
        result.error
      );
    }

    const totalDuration = Date.now() - totalStartTime;

    // 최종 결과 업데이트
    const errorSummary = results.errors.length > 0
      ? results.errors.map(e => `[${e.scenarioId}] ${e.name}: ${e.error}`).join('\n')
      : null;

    await updateTestRun(conn, testRunId, {
      status: results.failed > 0 ? 'failed' : 'completed',
      passedCount: results.passed,
      failedCount: results.failed,
      skippedCount: results.skipped,
      durationMs: totalDuration,
      completedAt: new Date().toISOString().slice(0, 19).replace('T', ' '),
      errorSummary
    });

    // 결과 출력
    console.log('\n' + '═'.repeat(50));
    console.log('📊 테스트 결과');
    console.log('═'.repeat(50));
    console.log(`✅ 성공: ${results.passed}`);
    console.log(`❌ 실패: ${results.failed}`);
    console.log(`⏭️ 스킵: ${results.skipped}`);
    console.log(`⏱️ 소요시간: ${(totalDuration / 1000).toFixed(2)}초`);
    console.log(`📁 아티팩트: ${runDir}`);
    console.log('═'.repeat(50) + '\n');

  } catch (error) {
    console.error('테스트 실행 오류:', error.message);
    if (runId && conn) {
      await updateTestRun(conn, runId, {
        status: 'failed',
        errorSummary: error.message,
        completedAt: new Date().toISOString().slice(0, 19).replace('T', ' ')
      });
    }
    throw error;
  } finally {
    if (browser) await browser.close();
    if (conn) await conn.end();
  }
}

// 메인 실행
const args = parseArgs();
runTests(args).catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
