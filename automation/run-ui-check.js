const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { createBug } = require('./bug-db');

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

function stamp() {
  return new Date().toISOString();
}

function readRecordingFlag() {
  try {
    const configPath = path.join(__dirname, 'data', 'bugs-recording.json');
    const raw = fs.readFileSync(configPath, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed.enabled === 'boolean' ? parsed.enabled : true;
  } catch (err) {
    // 파일 없으면 기본값 true
    return true;
  }
}

async function run() {
  const args = parseArgs();
  const targetUrl = args.url || process.env.UI_TEST_URL || 'http://localhost:3000';
  const runName = args.name || 'ui-healthcheck';
  const worker = args.worker || process.env.BUG_WORKER || 'cli-worker';
  const timeoutMs = Number(args.timeout || process.env.UI_TEST_TIMEOUT || 15000);
  const recordEnabled = readRecordingFlag();

  const artifactsDir = path.join(__dirname, 'artifacts');
  ensureDir(artifactsDir);

  const runId = `${runName}-${Date.now()}`;
  const logFile = path.join(artifactsDir, `${runId}.log`);
  const screenshotPath = path.join(artifactsDir, `${runId}.png`);
  const tracePath = path.join(artifactsDir, `${runId}-trace.zip`);

  const writeLog = (line) => {
    const entry = `[${stamp()}] ${line}`;
    console.log(entry);
    fs.appendFileSync(logFile, `${entry}\n`, 'utf8');
  };

  writeLog(`Starting UI check: ${targetUrl}`);

  let browser;
  let context;
  let page;
  let videoHandle = null;
  let traceSaved = false;

  try {
    browser = await chromium.launch({ headless: true });
    context = await browser.newContext(
      recordEnabled
        ? { recordVideo: { dir: artifactsDir } }
        : {}
    );
    if (recordEnabled) {
      await context.tracing.start({ screenshots: true, snapshots: true });
    }

    page = await context.newPage();
    videoHandle = page.video();

    page.on('console', (msg) => writeLog(`[console] ${msg.type()} ${msg.text()}`));
    page.on('pageerror', (err) => writeLog(`[pageerror] ${err.message}`));
    page.on('response', (response) => {
      if (response.status() >= 400) {
        writeLog(`[network] ${response.status()} ${response.url()}`);
      }
    });

    const response = await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
    if (!response) {
      throw new Error('No HTTP response received');
    }
    if (!response.ok()) {
      throw new Error(`HTTP ${response.status()} ${response.statusText()}`);
    }

    await page.waitForTimeout(1500);

    const bodyLength = await page.evaluate(() => document.body.innerText.trim().length);
    if (bodyLength < 32) {
      throw new Error(`Body text too short (${bodyLength})`);
    }

    await page.screenshot({ path: screenshotPath, fullPage: true });
    writeLog('Page rendered and screenshot captured');

    if (recordEnabled) {
      await context.tracing.stop({ path: tracePath });
      traceSaved = true;
    }
    await browser.close();

    const videoPath = recordEnabled && videoHandle ? await videoHandle.path() : null;

    writeLog('UI check completed without errors');
    writeLog(
      `Artifacts: screenshot=${screenshotPath}${recordEnabled ? `, trace=${tracePath}` : ''}${
        videoPath ? `, video=${videoPath}` : ''
      }`
    );
    process.exit(0);
  } catch (error) {
    writeLog(`[error] ${error.stack || error.message}`);

    if (recordEnabled && context && !traceSaved) {
      try {
        await context.tracing.stop({ path: tracePath });
      } catch (traceError) {
        writeLog(`[warn] Failed to save trace: ${traceError.message}`);
      }
    }

    if (browser) {
      await browser.close().catch(() => {});
    }

    const videoPath = recordEnabled && videoHandle ? await videoHandle.path().catch(() => null) : null;
    const bugId = await createBug({
      title: `UI check failed: ${runName}`,
      summary: error.message,
      logPath: logFile,
      screenshotPath: fs.existsSync(screenshotPath) ? screenshotPath : null,
      videoPath,
      tracePath: fs.existsSync(tracePath) ? tracePath : null,
      metadata: {
        url: targetUrl,
        runName,
        runId,
        timeoutMs,
        worker
      }
    });

    const reportPath = path.join(artifactsDir, `${bugId}.md`);
    const reportBody = [
      `# ${bugId}`,
      '',
      `- Title: UI check failed - ${runName}`,
      `- URL: ${targetUrl}`,
      `- Error: ${error.message}`,
      `- Log: ${logFile}`,
      `- Screenshot: ${fs.existsSync(screenshotPath) ? screenshotPath : 'n/a'}`,
      `- Trace: ${fs.existsSync(tracePath) ? tracePath : 'n/a'}`,
      `- Video: ${videoPath || 'n/a'}`,
      `- Worker: ${worker}`,
      `- Recorded: ${stamp()}`,
      ''
    ].join('\n');
    fs.writeFileSync(reportPath, reportBody, 'utf8');

    writeLog(`Bug captured as ${bugId}`);
    writeLog(`Report: ${reportPath}`);
    process.exit(1);
  }
}

run();
