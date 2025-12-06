/**
 * Night Runner - 야간 자동화 테스트 무한 반복 실행기
 * BTS-3350: Test Runner 무한 반복 실행 모드 (야간 자동화)
 *
 * Usage:
 *   node automation/night-runner.js                     # 무한 반복
 *   node automation/night-runner.js --until 07:00       # 오전 7시까지 반복
 *   node automation/night-runner.js --count 10          # 10회 반복
 *   node automation/night-runner.js --interval 60       # 60초 간격으로 실행
 *   node automation/night-runner.js --category login    # 특정 카테고리만
 *   node automation/night-runner.js --all               # 모든 시나리오
 *   node automation/night-runner.js --scenario 123      # 특정 시나리오만
 */

const { chromium } = require('playwright');
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'trend2024',
  database: process.env.DB_NAME || 'trend_video'
};

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:2000';
const ARTIFACTS_DIR = path.join(__dirname, 'artifacts', 'night-runs');
const REPORT_DIR = path.join(__dirname, 'reports');

// BTS 등록을 위한 설정
const BTS_ENABLED = true;

function parseArgs() {
  const args = process.argv.slice(2);
  const parsed = {
    until: null,       // 종료 시간 (HH:MM 형식)
    count: Infinity,   // 반복 횟수 (기본: 무한)
    interval: 30,      // 실행 간격 (초)
    category: null,    // 카테고리 필터
    scenarioId: null,  // 특정 시나리오
    all: false,        // 모든 시나리오
    debug: false       // 디버그 모드
  };

  for (let i = 0; i < args.length; i++) {
    const current = args[i];
    if (current.startsWith('--')) {
      const key = current.replace(/^--/, '');
      const value = args[i + 1] && !args[i + 1].startsWith('--') ? args[++i] : true;

      switch (key) {
        case 'until':
          parsed.until = value;
          break;
        case 'count':
          parsed.count = parseInt(value, 10);
          break;
        case 'interval':
          parsed.interval = parseInt(value, 10);
          break;
        case 'category':
          parsed.category = value;
          break;
        case 'scenario':
        case 'scenarioId':
          parsed.scenarioId = parseInt(value, 10);
          break;
        case 'all':
          parsed.all = true;
          break;
        case 'debug':
          parsed.debug = true;
          break;
      }
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

// 지정 시간에 도달했는지 확인
function shouldStop(untilTime) {
  if (!untilTime) return false;

  const now = new Date();
  const [targetHour, targetMin] = untilTime.split(':').map(Number);

  const targetTime = new Date();
  targetTime.setHours(targetHour, targetMin, 0, 0);

  // 만약 현재 시간이 목표 시간보다 크면 (야간 실행), 다음날로 설정
  if (now.getHours() > targetHour || (now.getHours() === targetHour && now.getMinutes() >= targetMin)) {
    // 이미 지난 시간이면 정상 비교
    if (now >= targetTime) {
      return true;
    }
  }

  return now >= targetTime;
}

// 남은 시간 계산
function getRemainingTime(untilTime) {
  if (!untilTime) return '무한';

  const now = new Date();
  const [targetHour, targetMin] = untilTime.split(':').map(Number);

  const targetTime = new Date();
  targetTime.setHours(targetHour, targetMin, 0, 0);

  // 자정을 넘어가는 경우 처리
  if (targetTime <= now) {
    targetTime.setDate(targetTime.getDate() + 1);
  }

  const diffMs = targetTime - now;
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

  return `${hours}시간 ${minutes}분`;
}

// BTS 버그 등록
async function registerBug(conn, error, scenarioInfo, runInfo) {
  if (!BTS_ENABLED) return null;

  try {
    const title = `[야간자동화] 시나리오 실패: ${scenarioInfo.name}`;
    const summary = `
## 실패 정보
- 시나리오 ID: ${scenarioInfo.id}
- 시나리오명: ${scenarioInfo.name}
- 실행 라운드: ${runInfo.round}
- 실행 시간: ${new Date().toISOString()}

## 에러 메시지
\`\`\`
${error.message || error}
\`\`\`

## 스택 트레이스
\`\`\`
${error.stack || 'N/A'}
\`\`\`

## 메타데이터
- 야간 실행 ID: ${runInfo.nightRunId}
- 카테고리: ${scenarioInfo.category || 'N/A'}
`.trim();

    const [result] = await conn.execute(
      `INSERT INTO bugs (title, summary, status, priority, type, created_at, updated_at, metadata)
       VALUES (?, ?, 'open', 'P2', 'bug', NOW(), NOW(), ?)`,
      [title, summary, JSON.stringify({
        source: 'night-runner',
        scenarioId: scenarioInfo.id,
        nightRunId: runInfo.nightRunId,
        round: runInfo.round
      })]
    );

    console.log(`  📝 BTS-${result.insertId} 등록됨`);
    return result.insertId;
  } catch (err) {
    console.error(`  ⚠️ BTS 등록 실패: ${err.message}`);
    return null;
  }
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

// 단일 시나리오 실행
async function executeScenario(browser, scenario, runDir) {
  const startTime = Date.now();
  let page;
  let context;
  let error = null;
  let screenshotPath = null;

  try {
    context = await browser.newContext({
      recordVideo: { dir: runDir }
    });
    await context.tracing.start({ screenshots: true, snapshots: true });
    page = await context.newPage();

    const testCode = scenario.test_code;
    const testData = scenario.test_data ?
      (typeof scenario.test_data === 'string' ? JSON.parse(scenario.test_data) : scenario.test_data) : {};

    if (!testCode) {
      throw new Error('테스트 코드가 없습니다');
    }

    const testFn = new Function('page', 'testData', 'BASE_URL', 'baseUrl', `
      return (async () => {
        ${testCode}
      })();
    `);

    await testFn(page, testData, BASE_URL, BASE_URL);

    screenshotPath = path.join(runDir, `scenario-${scenario.scenario_id}-success.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });

  } catch (err) {
    error = err;

    if (page) {
      try {
        screenshotPath = path.join(runDir, `scenario-${scenario.scenario_id}-error.png`);
        await page.screenshot({ path: screenshotPath, fullPage: true });
      } catch (ssErr) {
        // 스크린샷 저장 실패 무시
      }
    }
  } finally {
    if (context) {
      try {
        const tracePath = path.join(runDir, `scenario-${scenario.scenario_id}-trace.zip`);
        await context.tracing.stop({ path: tracePath });
      } catch (traceErr) {
        // Trace 저장 실패 무시
      }
      await context.close();
    }
  }

  const durationMs = Date.now() - startTime;

  return {
    scenarioId: scenario.scenario_id,
    scenarioName: scenario.name,
    category: scenario.category,
    passed: !error,
    durationMs,
    error,
    screenshotPath
  };
}

// 단일 라운드 실행
async function runSingleRound(options, roundNum, nightRunId, globalStats) {
  const { scenarioId, category, all } = options;
  let conn;
  let browser;

  const roundResults = {
    passed: 0,
    failed: 0,
    errors: [],
    startTime: Date.now(),
    endTime: null
  };

  try {
    conn = await getConnection();

    // 실행할 시나리오 목록 조회
    let scenarios = [];

    if (scenarioId) {
      const [scns] = await conn.execute(
        'SELECT * FROM test_scenario WHERE scenario_id = ?', [scenarioId]
      );
      scenarios = scns;
    } else if (category) {
      const [scns] = await conn.execute(`
        SELECT s.*, u.category FROM test_scenario s
        JOIN test_usecase u ON s.usecase_id = u.usecase_id
        WHERE u.category = ? AND u.is_active = 1
      `, [category]);
      scenarios = scns;
    } else if (all) {
      const [scns] = await conn.execute(`
        SELECT s.*, u.category FROM test_scenario s
        JOIN test_usecase u ON s.usecase_id = u.usecase_id
        WHERE u.is_active = 1
      `);
      scenarios = scns;
    }

    if (scenarios.length === 0) {
      console.log(`⚠️ Round ${roundNum}: 실행할 시나리오가 없습니다`);
      return roundResults;
    }

    console.log(`\n${'═'.repeat(60)}`);
    console.log(`🌙 Round ${roundNum} 시작 (${scenarios.length}개 시나리오)`);
    console.log(`${'═'.repeat(60)}`);

    // 새 test_run 레코드 생성
    const runType = scenarioId ? 'single' : (category ? 'category' : 'all');
    const [insertResult] = await conn.execute(
      `INSERT INTO test_run (scenario_id, run_type, status, total_count, started_at, metadata)
       VALUES (?, ?, 'running', ?, NOW(), ?)`,
      [
        scenarioId || null,
        runType,
        scenarios.length,
        JSON.stringify({
          category: category || null,
          nightRunId,
          round: roundNum
        })
      ]
    );
    const testRunId = insertResult.insertId;

    // artifacts 디렉토리 생성
    const runDir = path.join(ARTIFACTS_DIR, `night-${nightRunId}`, `round-${roundNum}`);
    ensureDir(runDir);

    // 브라우저 시작
    browser = await chromium.launch({ headless: true });

    // 테스트 실행
    for (const scenario of scenarios) {
      console.log(`  ▶️ ${scenario.name} (ID: ${scenario.scenario_id})`);

      const result = await executeScenario(browser, scenario, runDir);

      if (result.passed) {
        roundResults.passed++;
        globalStats.totalPassed++;
        console.log(`    ✅ 성공 (${result.durationMs}ms)`);
      } else {
        roundResults.failed++;
        globalStats.totalFailed++;
        roundResults.errors.push({
          scenarioId: result.scenarioId,
          name: result.scenarioName,
          error: result.error?.message || String(result.error)
        });
        console.log(`    ❌ 실패: ${result.error?.message || result.error}`);

        // BTS 버그 등록
        const bugId = await registerBug(conn, result.error, {
          id: result.scenarioId,
          name: result.scenarioName,
          category: result.category
        }, {
          nightRunId,
          round: roundNum
        });

        if (bugId) {
          globalStats.bugsRegistered.push(bugId);
        }
      }

      // DB에 상세 결과 기록
      await recordTestDetail(
        conn,
        testRunId,
        result.scenarioId,
        result.passed ? 'passed' : 'failed',
        result.durationMs,
        result.error?.message || null,
        result.screenshotPath
      );

      // 시나리오 통계 업데이트
      await updateScenarioStats(
        conn,
        result.scenarioId,
        result.passed,
        result.durationMs,
        result.error?.message || null
      );
    }

    roundResults.endTime = Date.now();
    const totalDuration = roundResults.endTime - roundResults.startTime;

    // 최종 결과 업데이트
    const errorSummary = roundResults.errors.length > 0
      ? roundResults.errors.map(e => `[${e.scenarioId}] ${e.name}: ${e.error}`).join('\n')
      : null;

    await updateTestRun(conn, testRunId, {
      status: roundResults.failed > 0 ? 'failed' : 'completed',
      passedCount: roundResults.passed,
      failedCount: roundResults.failed,
      skippedCount: 0,
      durationMs: totalDuration,
      completedAt: new Date().toISOString().slice(0, 19).replace('T', ' '),
      errorSummary
    });

    console.log(`\n  📊 Round ${roundNum} 결과: ✅${roundResults.passed} / ❌${roundResults.failed} (${(totalDuration / 1000).toFixed(1)}초)`);

  } catch (error) {
    console.error(`❌ Round ${roundNum} 실행 오류:`, error.message);
    globalStats.errors.push({
      round: roundNum,
      error: error.message
    });
  } finally {
    if (browser) await browser.close();
    if (conn) await conn.end();
  }

  return roundResults;
}

// 결과 요약 리포트 생성
function generateReport(nightRunId, options, globalStats) {
  ensureDir(REPORT_DIR);

  const reportPath = path.join(REPORT_DIR, `night-run-${nightRunId}.md`);
  const now = new Date();

  const durationMs = now - globalStats.startTime;
  const hours = Math.floor(durationMs / (1000 * 60 * 60));
  const minutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));

  const passRate = globalStats.totalPassed + globalStats.totalFailed > 0
    ? ((globalStats.totalPassed / (globalStats.totalPassed + globalStats.totalFailed)) * 100).toFixed(1)
    : 0;

  const report = `# 야간 자동화 테스트 리포트

## 실행 정보
- **실행 ID**: ${nightRunId}
- **시작 시간**: ${globalStats.startTime.toLocaleString('ko-KR')}
- **종료 시간**: ${now.toLocaleString('ko-KR')}
- **총 소요 시간**: ${hours}시간 ${minutes}분
- **총 라운드**: ${globalStats.totalRounds}회

## 실행 옵션
- **종료 조건**: ${options.until ? `${options.until}까지` : (options.count !== Infinity ? `${options.count}회 반복` : '무한')}
- **실행 간격**: ${options.interval}초
- **필터**: ${options.category ? `카테고리: ${options.category}` : (options.scenarioId ? `시나리오: ${options.scenarioId}` : '전체')}

## 테스트 결과 요약
| 항목 | 결과 |
|------|------|
| 총 테스트 실행 | ${globalStats.totalPassed + globalStats.totalFailed}회 |
| 성공 | ${globalStats.totalPassed}회 |
| 실패 | ${globalStats.totalFailed}회 |
| 성공률 | ${passRate}% |

## 등록된 버그
${globalStats.bugsRegistered.length > 0
  ? globalStats.bugsRegistered.map(id => `- BTS-${id}`).join('\n')
  : '없음'}

## 라운드별 상세
${globalStats.roundResults.map((r, i) => `
### Round ${i + 1}
- 성공: ${r.passed}
- 실패: ${r.failed}
- 소요시간: ${((r.endTime - r.startTime) / 1000).toFixed(1)}초
${r.errors.length > 0 ? `- 에러:\n${r.errors.map(e => `  - [${e.scenarioId}] ${e.name}: ${e.error}`).join('\n')}` : ''}
`).join('\n')}

## 실행 오류
${globalStats.errors.length > 0
  ? globalStats.errors.map(e => `- Round ${e.round}: ${e.error}`).join('\n')
  : '없음'}

---
_Generated by Night Runner (BTS-3350)_
`;

  fs.writeFileSync(reportPath, report, 'utf8');
  console.log(`\n📄 리포트 생성됨: ${reportPath}`);

  return reportPath;
}

// 메인 실행 함수
async function runNightAutomation(options) {
  const nightRunId = Date.now();

  const globalStats = {
    startTime: new Date(),
    totalRounds: 0,
    totalPassed: 0,
    totalFailed: 0,
    bugsRegistered: [],
    roundResults: [],
    errors: []
  };

  console.log('\n' + '═'.repeat(60));
  console.log('🌙 야간 자동화 테스트 시작');
  console.log('═'.repeat(60));
  console.log(`📌 실행 ID: ${nightRunId}`);
  console.log(`📌 시작 시간: ${globalStats.startTime.toLocaleString('ko-KR')}`);
  console.log(`📌 종료 조건: ${options.until ? `${options.until}까지` : (options.count !== Infinity ? `${options.count}회 반복` : '무한 (Ctrl+C로 중지)')}`);
  console.log(`📌 실행 간격: ${options.interval}초`);
  if (options.until) {
    console.log(`📌 남은 시간: ${getRemainingTime(options.until)}`);
  }
  console.log('═'.repeat(60));

  // Graceful shutdown 처리
  let shouldContinue = true;
  process.on('SIGINT', () => {
    console.log('\n\n⚠️ 중지 요청 감지됨. 현재 라운드 완료 후 종료합니다...');
    shouldContinue = false;
  });

  process.on('SIGTERM', () => {
    shouldContinue = false;
  });

  let roundNum = 0;

  while (shouldContinue) {
    roundNum++;
    globalStats.totalRounds = roundNum;

    // 종료 조건 확인
    if (options.count !== Infinity && roundNum > options.count) {
      console.log(`\n✅ 지정된 반복 횟수(${options.count}회) 완료`);
      break;
    }

    if (options.until && shouldStop(options.until)) {
      console.log(`\n✅ 지정된 종료 시간(${options.until}) 도달`);
      break;
    }

    // 라운드 실행
    const roundResult = await runSingleRound(options, roundNum, nightRunId, globalStats);
    globalStats.roundResults.push(roundResult);

    if (!shouldContinue) break;

    // 다음 라운드까지 대기
    if ((options.count === Infinity || roundNum < options.count) && !options.until || !shouldStop(options.until)) {
      console.log(`\n⏳ ${options.interval}초 후 다음 라운드 시작...`);
      if (options.until) {
        console.log(`   남은 시간: ${getRemainingTime(options.until)}`);
      }

      await new Promise(resolve => setTimeout(resolve, options.interval * 1000));
    }
  }

  // 최종 리포트 생성
  console.log('\n' + '═'.repeat(60));
  console.log('📊 최종 결과');
  console.log('═'.repeat(60));
  console.log(`🔄 총 라운드: ${globalStats.totalRounds}`);
  console.log(`✅ 총 성공: ${globalStats.totalPassed}`);
  console.log(`❌ 총 실패: ${globalStats.totalFailed}`);
  console.log(`📝 등록된 버그: ${globalStats.bugsRegistered.length}개`);
  if (globalStats.bugsRegistered.length > 0) {
    console.log(`   ${globalStats.bugsRegistered.map(id => `BTS-${id}`).join(', ')}`);
  }
  console.log('═'.repeat(60));

  // 리포트 파일 생성
  const reportPath = generateReport(nightRunId, options, globalStats);

  return {
    nightRunId,
    ...globalStats,
    reportPath
  };
}

// 메인 실행
const args = parseArgs();

// 기본 모드: --all 옵션이 없으면 설정
if (!args.scenarioId && !args.category && !args.all) {
  args.all = true;
}

runNightAutomation(args).then(result => {
  console.log('\n🌙 야간 자동화 완료');
  process.exit(0);
}).catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
