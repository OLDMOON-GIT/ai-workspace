/**
 * Server log monitor - ?고????먮윭 ?먮룞 媛먯? 諛?踰꾧렇 ?깅줉
 *
 * Usage:
 *   node automation/log-monitor.js [--watch]
 *
 * 湲곕뒫:
 *   - server.log ?뚯씪?먯꽌 ?먮윭 ?⑦꽩 媛먯?
 *   - TypeError, Error, ?ㅽ깮 ?몃젅?댁뒪 媛먯?
 *   - 以묐났 ?먮윭 ?쒖쇅 (理쒓렐 1?쒓컙 ???숈씪 ?먮윭)
 *   - ?먮룞?쇰줈 bugs ?뚯씠釉붿뿉 ?깅줉
 */

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

// MySQL 접속 설정
const DB_CONFIG = {
  host: process.env.TREND_DB_HOST || '127.0.0.1',
  port: parseInt(process.env.TREND_DB_PORT) || 3306,
  user: 'root',
  password: 'trend2024',
  database: 'trend_video',
  charset: 'utf8mb4'
};

// 濡쒓렇 ?뚯씪 寃쎈줈
const LOG_DIR = path.join(__dirname, '..', 'trend-video-frontend', 'logs');
const SERVER_LOG = path.join(LOG_DIR, 'server.log');
const TASKS_DIR = path.join(__dirname, '..', 'trend-video-backend', 'tasks');

// 理쒖떊 ?뚯씪 媛먯떆 ?쒓컙 (1?쒓컙)
const MAX_AGE_MS = 60 * 60 * 1000;

// 1?쒓컙 二쇨린 泥댄겕
const HOURLY_CHECK_INTERVAL = 60 * 60 * 1000;

// ?먮윭 ?⑦꽩
const ERROR_PATTERNS = [
  /TypeError:.*\n.*at /,
  /Error:.*\n.*at /,
  /ReferenceError:.*\n.*at /,
  /SyntaxError:.*\n.*at /,
  /RangeError:.*\n.*at /,
  /UnhandledPromiseRejection/,
  /\[.*ERROR.*\]/i,
  // SQL ?먮윭
  /ER_BAD_FIELD_ERROR/,
  /Unknown column.*in 'field list'/,
  /ER_NO_SUCH_TABLE/,
  /ER_DUP_ENTRY/,
  /ER_PARSE_ERROR/,
  /ER_TRUNCATED_WRONG_VALUE/,  // datetime ?뺤떇 ?ㅻ쪟
  /Incorrect datetime value/i,
  /INSERT.*?ㅽ뙣/,
  /content INSERT ?ㅽ뙣/,
  // ?쒕쾭 ?고????먮윭 (???대え吏濡??쒖옉)
  /??*?ㅻ쪟:/,
  /??*?ㅽ뙣:/,
  /??*?먮윭:/,
  // JSON ?뚯떛 ?먮윭 (?ㅽ깮 ?몃젅?댁뒪 ?놁씠??媛먯?)
  /JSON ?뚯떛 ?ㅽ뙣/,
  /?뚯떛 ?ㅽ뙣.*JSON/i,
  /Unexpected.*JSON.*position/i,
  /SyntaxError: Unexpected/,
  // story.json 愿???먮윭
  /story\.json.*?뚯떛/i,
  /story\.json.*?ㅽ뙣/i,
  // Python ?먮윭 (?ㅽ깮 ?몃젅?댁뒪 ?놁씠??媛먯?)
  /\[Python Error\]/,
  /selenium\.common\.exceptions/,
  /cannot connect to chrome/i
];

// ?쒖쇅???⑦꽩 (?뺤긽?곸씤 ?ъ슜???≪뀡?대굹 ?덉긽???먮윭)
const IGNORE_PATTERNS = [
  /stopped by user/i,
  /Automation stopped/i,
  /Browser.*(?:closed|has been closed)/i  // BTS-3167,
  /User canceled/i,
  /User aborted/i,
  /file_missing.*\/story/i,  // story ?뚯씪 ?꾩쭅 ?앹꽦 ?덈맖
  /HTTP 404.*story/i,       // story ?뚯씪 ?꾩쭅 ?앹꽦 ?덈맖
  /GET.*story.*500/i,       // story API ?먮윭 (?묒뾽 吏꾪뻾 以?
  /?λ쭅???ㅻ쪟.*?대쾲 ?ㅽ뻾 ?ㅽ궢/i,  // ?λ쭅???앹꽦 ?ㅽ뙣 ???ㅽ궢 (?뺤긽 ?숈옉)
  /?곹뭹 ?쒕ぉ ?앹꽦 ?ㅽ뙣.*?λ쭅??i,  // ?곹뭹 移댄뀒怨좊━ ?ㅽ궢 (?뺤긽 ?숈옉)
  /story.json ?뚯씪 ?놁쓬/i,  // story.json ?꾩쭅 ?앹꽦 ?덈맖 (?묒뾽 吏꾪뻾 以?
  // BTS-1240: ?꾨옒 ?⑦꽩???쒓굅 - JSON5 ?ъ떆?????ㅽ뙣?섎㈃ ?ㅼ젣 ?먮윭??  // - /story.json 泥섎━ ?ㅽ뙣.*{/i  (?쒓굅: JSON5 ?뚯떛???ㅽ뙣?섎㈃ 踰꾧렇 ?깅줉 ?꾩슂)
  // - /?쒖? JSON ?뚯떛 ?ㅽ뙣.*JSON5濡??ъ떆??i  (?쒓굅: ?ъ떆?????깃났/?ㅽ뙣 援щ텇 遺덇?)
  /GET.*story.*404/i,  // story API 404 (?묒뾽 吏꾪뻾 以?
  /??*?쎄린 ?깃났/,              // ?뺤긽 ?깃났 濡쒓렇,
  /??*?꾨즺/,                   // ?뺤긽 ?꾨즺 濡쒓렇,
  /GET.*200 in/,              // HTTP 200 ?깃났 ?묐떟,
  /^\s*\[\s*$/,               // ?⑥닚 ?愿꾪샇 ?쇱씤 (JSON 媛앹껜 異쒕젰),
  /^\s*\]\s*$/,               // ?⑥닚 ?愿꾪샇 ?リ린 ?쇱씤,
  /^\s*\{\s*$/,               // ?⑥닚 以묎큵???쇱씤 (JSON 媛앹껜 異쒕젰),
  /^\s*\}\s*$/                // ?⑥닚 以묎큵???リ린 ?쇱씤
];

// 留덉?留?泥댄겕 ?꾩튂 ???let lastPosition = 0;
const POSITION_FILE = path.join(__dirname, '.log-monitor-position');

// 以묐났 泥댄겕???댁떆 ???(理쒓렐 1?쒓컙)
const seenErrors = new Map();
const ERROR_COOLDOWN = 60 * 60 * 1000; // 1?쒓컙

/**
 * 留덉?留?泥댄겕 ?꾩튂 濡쒕뱶
 */
function loadLastPosition() {
  try {
    if (fs.existsSync(POSITION_FILE)) {
      const data = fs.readFileSync(POSITION_FILE, 'utf-8');
      const parsed = JSON.parse(data);
      lastPosition = parsed.position || 0;
      console.log(`?뱧 留덉?留?泥댄겕 ?꾩튂: ${lastPosition} bytes`);
    } else {
      // 泥섏쓬 ?ㅽ뻾 ???뚯씪 ?앹뿉???쒖옉
      if (fs.existsSync(SERVER_LOG)) {
        const stat = fs.statSync(SERVER_LOG);
        lastPosition = stat.size;
        console.log(`?뱧 珥덇린 ?꾩튂 ?ㅼ젙: ${lastPosition} bytes (?뚯씪 ??`);
      }
    }
  } catch (err) {
    console.error('??留덉?留??꾩튂 濡쒕뱶 ?ㅽ뙣:', err);
  }
}

/**
 * 留덉?留?泥댄겕 ?꾩튂 ??? */
function saveLastPosition(position) {
  try {
    fs.writeFileSync(POSITION_FILE, JSON.stringify({ position, timestamp: Date.now() }));
    lastPosition = position;
  } catch (err) {
    console.error('???꾩튂 ????ㅽ뙣:', err);
  }
}

/**
 * ?먮윭 ?댁떆 ?앹꽦 (以묐났 泥댄겕??
 */
function getErrorHash(errorText) {
  // 泥?3以꾨쭔 ?ъ슜 (?먮윭 ???+ 硫붿떆吏 + 泥?踰덉㎏ ?ㅽ깮)
  const lines = errorText.split('\n').slice(0, 3).join('\n');
  return lines.trim();
}

/**
 * 以묐났 ?먮윭 泥댄겕
 */
function isDuplicateError(errorHash) {
  const now = Date.now();

  // ?ㅻ옒????ぉ ?뺣━
  for (const [hash, timestamp] of seenErrors.entries()) {
    if (now - timestamp > ERROR_COOLDOWN) {
      seenErrors.delete(hash);
    }
  }

  // 以묐났 泥댄겕
  if (seenErrors.has(errorHash)) {
    return true;
  }

  seenErrors.set(errorHash, now);
  return false;
}

/**
 * ?レ옄 ID瑜?BTS- ?뺤떇 臾몄옄?대줈 蹂?? */
function formatBugId(numId) {
  return `BTS-${String(numId).padStart(7, '0')}`;
}

/**
 * 踰꾧렇 DB???깅줉 (AUTO_INCREMENT ?ъ슜)
 */
async function registerBug(errorInfo) {
  const conn = await mysql.createConnection(DB_CONFIG);

  try {
    const title = errorInfo.type || 'Server Runtime Error';
    // summary??而⑦뀓?ㅽ듃 ?ы븿 (理쒕? 2000??
    const summary = errorInfo.fullText.substring(0, 2000);
    const logPath = errorInfo.logPath || SERVER_LOG;

    const [result] = await conn.execute(`
      INSERT INTO bugs (
        title, summary, status, log_path,
        created_at, updated_at, assigned_to, metadata
      ) VALUES (?, ?, ?, ?, NOW(), NOW(), ?, ?)
    `, [
      title,
      summary,
      'open',
      logPath,
      'auto',
      JSON.stringify({
        type: 'runtime-error',
        source: 'log-monitor',
        error_type: errorInfo.type,
        stack: errorInfo.stack,
        timestamp: errorInfo.timestamp,
        log_file: logPath
      })
    ]);

    const bugId = formatBugId(result.insertId);
    console.log(`??踰꾧렇 ?깅줉: ${bugId} - ${title}`);
    return bugId;
  } finally {
    await conn.end();
  }
}

/**
 * 濡쒓렇?먯꽌 ?먮윭 異붿텧 (二쇰? 而⑦뀓?ㅽ듃 ?ы븿)
 */
function extractErrors(logContent) {
  const errors = [];
  const lines = logContent.split('\n');
  const CONTEXT_BEFORE = 10; // ?먮윭 ??10以?  const CONTEXT_AFTER = 5;   // ?먮윭 ??5以?
  let currentError = null;
  let errorLineIndex = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // ?먮윭 ?⑦꽩 媛먯?
    for (const pattern of ERROR_PATTERNS) {
      if (pattern.test(line)) {
        // ?댁쟾 ?먮윭 ???(而⑦뀓?ㅽ듃 異붽?)
        if (currentError && errorLineIndex >= 0) {
          // ?먮윭 ??而⑦뀓?ㅽ듃 異붽?
          const beforeStart = Math.max(0, errorLineIndex - CONTEXT_BEFORE);
          const contextBefore = lines.slice(beforeStart, errorLineIndex).join('\n');
          if (contextBefore.trim()) {
            currentError.contextBefore = contextBefore;
            currentError.fullText = `--- ?먮윭 ??而⑦뀓?ㅽ듃 (${CONTEXT_BEFORE}以? ---\n${contextBefore}\n--- ?먮윭 ---\n${currentError.fullText}`;
          }
          errors.push(currentError);
        }

        // ???먮윭 ?쒖옉
        errorLineIndex = i;
        currentError = {
          timestamp: extractTimestamp(line),
          type: extractErrorType(line),
          message: line.trim(),
          stack: [line],
          fullText: line,
          contextBefore: '',
          contextAfter: ''
        };
        break;
      }
    }

    // ?ㅽ깮 ?몃젅?댁뒪 ?섏쭛
    if (currentError && (line.trim().startsWith('at ') || line.includes('src\\'))) {
      currentError.stack.push(line);
      currentError.fullText += '\n' + line;
    }
  }

  // 留덉?留??먮윭 ???(而⑦뀓?ㅽ듃 異붽?)
  if (currentError && errorLineIndex >= 0) {
    // ?먮윭 ??而⑦뀓?ㅽ듃 異붽?
    const beforeStart = Math.max(0, errorLineIndex - CONTEXT_BEFORE);
    const contextBefore = lines.slice(beforeStart, errorLineIndex).join('\n');

    // ?먮윭 ??而⑦뀓?ㅽ듃 異붽?
    const stackEndIndex = errorLineIndex + currentError.stack.length;
    const afterEnd = Math.min(lines.length, stackEndIndex + CONTEXT_AFTER);
    const contextAfter = lines.slice(stackEndIndex, afterEnd).join('\n');

    if (contextBefore.trim() || contextAfter.trim()) {
      currentError.contextBefore = contextBefore;
      currentError.contextAfter = contextAfter;
      currentError.fullText =
        (contextBefore.trim() ? `--- ?먮윭 ??而⑦뀓?ㅽ듃 (${CONTEXT_BEFORE}以? ---\n${contextBefore}\n` : '') +
        `--- ?먮윭 ---\n${currentError.fullText}` +
        (contextAfter.trim() ? `\n--- ?먮윭 ??而⑦뀓?ㅽ듃 (${CONTEXT_AFTER}以? ---\n${contextAfter}` : '');
    }
    errors.push(currentError);
  }

  return errors;
}

/**
 * ??꾩뒪?ы봽 異붿텧
 */
function extractTimestamp(line) {
  const match = line.match(/\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\]/);
  return match ? match[1] : new Date().toISOString();
}

/**
 * ?먮윭 ???異붿텧
 */
function extractErrorType(line) {
  const match = line.match(/(TypeError|Error|ReferenceError|SyntaxError|RangeError|UnhandledPromiseRejection)/);
  return match ? match[1] : 'Unknown Error';
}

/**
 * 理쒖떊 task 濡쒓렇 ?뚯씪 李얘린
 */
function getRecentTaskLogs() {
  const recentLogs = [];
  const now = Date.now();

  if (!fs.existsSync(TASKS_DIR)) {
    return recentLogs;
  }

  try {
    const taskDirs = fs.readdirSync(TASKS_DIR);

    for (const taskId of taskDirs) {
      const taskPath = path.join(TASKS_DIR, taskId);
      const stat = fs.statSync(taskPath);

      if (!stat.isDirectory()) continue;

      // 理쒓렐 ?섏젙???붾젆?좊━留??뺤씤
      if (now - stat.mtimeMs > MAX_AGE_MS) continue;

      // *.log ?뚯씪 李얘린
      const files = fs.readdirSync(taskPath);
      for (const file of files) {
        if (!file.endsWith('.log')) continue;

        const logPath = path.join(taskPath, file);
        const logStat = fs.statSync(logPath);

        // 理쒖떊 ?뚯씪留?        if (now - logStat.mtimeMs <= MAX_AGE_MS) {
          recentLogs.push({
            path: logPath,
            taskId,
            filename: file,
            mtime: logStat.mtimeMs
          });
        }
      }
    }
  } catch (err) {
    console.error('??Task 濡쒓렇 ?ㅼ틪 ?ㅽ뙣:', err);
  }

  return recentLogs;
}

/**
 * ?⑥씪 濡쒓렇 ?뚯씪 泥댄겕
 */
async function checkSingleLog(logPath, logName = 'server.log') {
  if (!fs.existsSync(logPath)) {
    return;
  }

  const stat = fs.statSync(logPath);
  const fileSize = stat.size;

  // ?덈Т ???뚯씪? ??遺遺꾨쭔 ?쎄린 (理쒓렐 100KB)
  const readSize = Math.min(fileSize, 100 * 1024);
  const startPos = Math.max(0, fileSize - readSize);

  const stream = fs.createReadStream(logPath, {
    start: startPos,
    encoding: 'utf-8'
  });

  let content = '';
  for await (const chunk of stream) {
    content += chunk;
  }

  // ?먮윭 異붿텧
  const errors = extractErrors(content);

  if (errors.length > 0) {
    console.log(`\n?슚 [${logName}] ${errors.length}媛??먮윭 媛먯?`);

    for (const error of errors) {
      const errorHash = getErrorHash(error.fullText);

      if (isDuplicateError(errorHash)) {
        console.log(`??툘  以묐났 ?먮윭 ?ㅽ궢: ${error.type}`);
        continue;
      }

      // IGNORE_PATTERNS 泥댄겕
      let shouldIgnore = false;
      for (const pattern of IGNORE_PATTERNS) {
        if (pattern.test(error.fullText)) {
          console.log(`??툘  ?뺤긽 耳?댁뒪 ?ㅽ궢: ${error.message.substring(0, 60)}`);
          shouldIgnore = true;
          break;
        }
      }
      if (shouldIgnore) continue;

      console.log(`\n?뱧 ${error.type}: ${error.message.substring(0, 100)}`);

      try {
        // 濡쒓렇 寃쎈줈 ?ы븿?섏뿬 踰꾧렇 ?깅줉
        error.logPath = logPath;
        await registerBug(error);
      } catch (err) {
        console.error('??踰꾧렇 ?깅줉 ?ㅽ뙣:', err);
      }
    }
  }
}

/**
 * 濡쒓렇 ?뚯씪 泥댄겕 (server.log)
 */
async function checkServerLog() {
  if (!fs.existsSync(SERVER_LOG)) {
    console.log('?좑툘 server.log ?뚯씪???놁뒿?덈떎.');
    return;
  }

  const stat = fs.statSync(SERVER_LOG);
  const currentSize = stat.size;

  // ?덈줈???댁슜???덈뒗吏 ?뺤씤
  if (currentSize <= lastPosition) {
    // ?뚯씪??濡쒗뀒?댁뀡?섏뿀?????덉쓬
    if (currentSize < lastPosition) {
      console.log('?봽 濡쒓렇 ?뚯씪 濡쒗뀒?댁뀡 媛먯?');
      lastPosition = 0;
    } else {
      return; // 蹂寃??놁쓬
    }
  }

  // ?덈줈???댁슜 ?쎄린
  const stream = fs.createReadStream(SERVER_LOG, {
    start: lastPosition,
    encoding: 'utf-8'
  });

  let newContent = '';
  for await (const chunk of stream) {
    newContent += chunk;
  }

  // ?먮윭 異붿텧
  const errors = extractErrors(newContent);

  if (errors.length > 0) {
    console.log(`\n?슚 [server.log] ${errors.length}媛??먮윭 媛먯?`);

    for (const error of errors) {
      const errorHash = getErrorHash(error.fullText);

      if (isDuplicateError(errorHash)) {
        console.log(`??툘  以묐났 ?먮윭 ?ㅽ궢: ${error.type}`);
        continue;
      }

      // IGNORE_PATTERNS 泥댄겕
      let shouldIgnore = false;
      for (const pattern of IGNORE_PATTERNS) {
        if (pattern.test(error.fullText)) {
          console.log(`??툘  ?뺤긽 耳?댁뒪 ?ㅽ궢: ${error.message.substring(0, 60)}`);
          shouldIgnore = true;
          break;
        }
      }
      if (shouldIgnore) continue;

      console.log(`\n?뱧 ${error.type}: ${error.message.substring(0, 100)}`);

      try {
        error.logPath = SERVER_LOG;
        await registerBug(error);
      } catch (err) {
        console.error('??踰꾧렇 ?깅줉 ?ㅽ뙣:', err);
      }
    }
  }

  // ?꾩튂 ???  saveLastPosition(currentSize);
}

/**
 * task_queue?먯꽌 failed ?곹깭?닿퀬 踰꾧렇 誘몃벑濡앹씤 ??ぉ 李얘린
 */
async function checkFailedTasksWithoutBugs() {
  const conn = await mysql.createConnection(DB_CONFIG);

  try {
    // 理쒓렐 1?쒓컙 ??failed ?곹깭??task 議고쉶
    const [failedTasks] = await conn.execute(`
      SELECT tq.task_id, tq.type, tq.error, tq.updated_at,
             c.title, c.prompt_format
      FROM task_queue tq
      LEFT JOIN content c ON tq.task_id = c.content_id
      WHERE tq.status = 'failed'
        AND tq.updated_at > DATE_SUB(NOW(), INTERVAL 1 HOUR)
      ORDER BY tq.updated_at DESC
    `);

    if (failedTasks.length === 0) {
      console.log('??理쒓렐 1?쒓컙 ???ㅽ뙣??task ?놁쓬');
      return;
    }

    console.log(`\n?뵇 ?ㅽ뙣??task ${failedTasks.length}媛??뺤씤 以?..`);

    for (const task of failedTasks) {
      const taskId = task.task_id;
      const errorMsg = task.error || 'Unknown error';

      // ?대? ?깅줉??踰꾧렇?몄? ?뺤씤 (summary??taskId ?ы븿)
      const [existingBugs] = await conn.execute(`
        SELECT id FROM bugs
        WHERE (summary LIKE ? OR metadata LIKE ?)
          AND created_at > DATE_SUB(NOW(), INTERVAL 24 HOUR)
        LIMIT 1
      `, [`%${taskId}%`, `%${taskId}%`]);

      if (existingBugs.length > 0) {
        console.log(`??툘  ?대? 踰꾧렇 ?깅줉?? ${taskId}`);
        continue;
      }

      // 濡쒓렇 ?뚯씪 ?뺤씤
      const taskDir = path.join(TASKS_DIR, taskId);
      let logContent = '';
      let logPath = '';

      if (fs.existsSync(taskDir)) {
        // type??留욌뒗 濡쒓렇 ?뚯씪 李얘린
        const logFile = `${task.type}.log`;
        const logFilePath = path.join(taskDir, logFile);

        if (fs.existsSync(logFilePath)) {
          logContent = fs.readFileSync(logFilePath, 'utf-8');
          logPath = logFilePath;
        }
      }

      // 踰꾧렇 ?깅줉 (AUTO_INCREMENT ?ъ슜)
      const title = `[${task.type}] ${task.title || taskId} ?ㅽ뙣`;
      const summary = `Task: ${taskId}
Type: ${task.type}
Format: ${task.prompt_format || 'N/A'}
Error: ${errorMsg}
Time: ${task.updated_at}

--- Log Content (理쒓렐 2000?? ---
${logContent.slice(-2000)}`;

      const [result] = await conn.execute(`
        INSERT INTO bugs (
          title, summary, status, log_path,
          created_at, updated_at, assigned_to, metadata
        ) VALUES (?, ?, ?, ?, NOW(), NOW(), ?, ?)
      `, [
        title,
        summary.substring(0, 4000),
        'open',
        logPath || null,
        'auto',
        JSON.stringify({
          type: 'task-failed',
          source: 'log-monitor',
          task_id: taskId,
          task_type: task.type,
          error: errorMsg
        })
      ]);

      const bugId = formatBugId(result.insertId);
      console.log(`??踰꾧렇 ?깅줉: ${bugId} - ${title}`);
    }
  } catch (err) {
    console.error('??Failed tasks 泥댄겕 ?ㅽ뙣:', err);
  } finally {
    await conn.end();
  }
}

/**
 * 紐⑤뱺 濡쒓렇 泥댄겕
 */
async function checkAllLogs() {
  // 1. server.log 泥댄겕
  await checkServerLog();

  // 2. task 濡쒓렇 泥댄겕 (理쒖떊 寃껊쭔)
  const taskLogs = getRecentTaskLogs();

  if (taskLogs.length > 0) {
    console.log(`\n?뱛 ${taskLogs.length}媛?Task 濡쒓렇 泥댄겕 以?..`);

    for (const log of taskLogs) {
      await checkSingleLog(log.path, `${log.taskId}/${log.filename}`);
    }
  }

  // 3. task_queue?먯꽌 failed ?곹깭????ぉ 泥댄겕
  await checkFailedTasksWithoutBugs();
}

/**
 * Watch 紐⑤뱶
 */
function watchLogs() {
  console.log('?? 濡쒓렇 媛먯떆 ?쒖옉...');
  console.log(`?뱛 Server: ${SERVER_LOG}`);
  console.log(`?뱛 Tasks: ${TASKS_DIR}\n`);

  // 珥덇린 泥댄겕
  checkAllLogs().catch(console.error);

  // 10珥덈쭏???ㅼ떆媛?泥댄겕 (server.log, 理쒖떊 task 濡쒓렇)
  setInterval(() => {
    checkServerLog().catch(console.error);

    // 理쒓렐 10遺???task 濡쒓렇留?鍮좊Ⅴ寃?泥댄겕
    const recentLogs = getRecentTaskLogs();
    for (const log of recentLogs) {
      checkSingleLog(log.path, `${log.taskId}/${log.filename}`).catch(console.error);
    }
  }, 10000);

  // 1?쒓컙留덈떎 ?꾩껜 泥댄겕 (failed tasks ?ы븿)
  setInterval(() => {
    console.log('\n??[1?쒓컙 二쇨린] ?꾩껜 濡쒓렇 泥댄겕 ?쒖옉...');
    checkAllLogs().catch(console.error);
  }, HOURLY_CHECK_INTERVAL);

  console.log('??1?쒓컙留덈떎 ?먮룞 泥댄겕 ?쒖꽦?붾맖');
}

/**
 * 硫붿씤
 */
async function main() {
  const args = process.argv.slice(2);
  const watch = args.includes('--watch') || args.includes('-w');

  console.log('?붴븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븮');
  console.log('??          ?뱤 Log Monitor (Server + Tasks)                    ??);
  console.log('??          ?고????먮윭 ?먮룞 媛먯? 諛?踰꾧렇 ?깅줉                 ??);
  console.log('?싢븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븴\n');

  loadLastPosition();

  if (watch) {
    watchLogs();
  } else {
    await checkAllLogs();
    console.log('\n??濡쒓렇 泥댄겕 ?꾨즺');
  }
}

main().catch(console.error);

