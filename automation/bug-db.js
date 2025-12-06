const mysql = require('mysql2/promise');
const Redis = require('../mcp-debugger/node_modules/ioredis');

const dbConfig = {
  host: process.env.TREND_DB_HOST || '127.0.0.1',
  port: parseInt(process.env.TREND_DB_PORT) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'trend2024',
  database: process.env.DB_NAME || 'trend_video',
  charset: 'utf8mb4',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
};

const pool = mysql.createPool(dbConfig);

// Redis publish channel for bug/spec events (event push to spawning-pool)
const REDIS_CONFIG = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
};
const BUG_EVENT_CHANNEL = 'bts.bug.created';
let redisClient = null;

function getRedisClient() {
  if (process.env.DISABLE_BUG_EVENT_PUSH === '1') return null;
  if (redisClient) return redisClient;
  try {
    redisClient = new Redis(REDIS_CONFIG);
    redisClient.on('error', (err) => {
      console.warn(`[bug-db] Redis publish error: ${err.message}`);
    });
    return redisClient;
  } catch (error) {
    console.warn(`[bug-db] Redis init failed: ${error.message}`);
    redisClient = null;
    return null;
  }
}

async function publishBugCreatedEvent(payload) {
  const client = getRedisClient();
  if (!client) return;
  try {
    await client.publish(BUG_EVENT_CHANNEL, JSON.stringify({
      ...payload,
      timestamp: new Date().toISOString(),
    }));
  } catch (error) {
    console.warn(`[bug-db] Failed to publish bug event: ${error.message}`);
  }
}

function now() {
  // BTS-3360: MySQL DATETIME 형식으로 반환 (ISO 형식 T와 Z 제거)
  return new Date().toISOString().replace('T', ' ').replace('Z', '').split('.')[0];
}

// BTS-3023: PID 기반 worker ID 생성
function getWorkerIdByPid(pid) {
  const usePid = pid || process.pid;
  return `worker-${usePid}`;
}

// BTS-3023: assigned_to가 자기 PID인지 확인
function isMyWorker(assignedTo, myPid) {
  if (!assignedTo) return false;
  const pid = myPid || process.pid;
  return assignedTo === `worker-${pid}`;
}


function parseMeta(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return { ...raw };
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

// 숫자 ID를 BTS- 형식 문자열로 변환
function formatBugId(numId) {
  return `BTS-${String(numId).padStart(7, '0')}`;
}

// BTS- 접두사만 허용 (SPEC- 접두사 사용 금지, type 컬럼으로 bug/spec 구분)
function parseBugId(id) {
  if (typeof id === 'number') return id;
  if (typeof id === 'string') {
    const cleaned = id.replace(/^BTS-/i, '').trim();
    const parsed = parseInt(cleaned, 10);
    if (!Number.isNaN(parsed)) return parsed;
  }
  const parsed = parseInt(id, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

async function init() {
  try {
    await pool.execute('CREATE INDEX idx_bugs_status_created ON bugs(status, created_at)');
  } catch (error) {
    if (error && error.errno !== 1061) {
      throw error;
    }
  }
}

const ready = init();

async function withTx(fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const res = await fn(conn);
    await conn.commit();
    return res;
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

async function createBug({
  id,
  type = 'bug',
  priority = 'P2',
  title,
  summary,
  logPath,
  screenshotPath,
  videoPath,
  tracePath,
  metadata = {},
  worker
}) {
  await ready;

  let numericId = id ? parseBugId(id) : null;

  // BTS-14912: title 기반 중복 체크 (같은 title이 open/in_progress 상태면 스킵)
  if (!numericId && title) {
    const normalizedTitle = title.trim().substring(0, 100); // 앞 100자만 비교
    const [existingRows] = await pool.execute(
      `SELECT id, title, status FROM bugs
       WHERE status IN ('open', 'in_progress')
       AND LEFT(title, 100) = LEFT(?, 100)
       LIMIT 1`,
      [normalizedTitle]
    );
    if (existingRows && existingRows[0]) {
      const existing = existingRows[0];
      console.log(`[bug-db] 중복 버그 스킵: ${formatBugId(existing.id)} (${existing.status})`);
      return formatBugId(existing.id); // 기존 버그 ID 반환
    }
  }

  try {
    if (numericId) {
      await pool.execute(
        `
          INSERT INTO bugs (
            id, type, priority, title, summary, status, log_path, screenshot_path, video_path, trace_path,
            resolution_note, created_at, updated_at, assigned_to, metadata
          ) VALUES (?, ?, ?, ?, ?, 'open', ?, ?, ?, ?, ?, NOW(), NOW(), ?, ?)
        `,
        [
          numericId,
          type,
          priority,
          title,
          summary,
          logPath || null,
          screenshotPath || null,
          videoPath || null,
          tracePath || null,
          null,
          worker || null,
          JSON.stringify(metadata || {})
        ]
      );
    } else {
      const [result] = await pool.execute(
        `
          INSERT INTO bugs (
            type, priority, title, summary, status, log_path, screenshot_path, video_path, trace_path,
            resolution_note, created_at, updated_at, assigned_to, metadata
          ) VALUES (?, ?, ?, ?, 'open', ?, ?, ?, ?, ?, NOW(), NOW(), ?, ?)
        `,
        [
          type,
          priority,
          title,
          summary,
          logPath || null,
          screenshotPath || null,
          videoPath || null,
          tracePath || null,
          null,
          worker || null,
          JSON.stringify(metadata || {})
        ]
      );
      numericId = result.insertId;
    }
  } catch (error) {
    if (error && error.code === 'ER_DUP_ENTRY') {
      const queryId = numericId ?? parseBugId(id);
      const [rows] = await pool.execute(
        'SELECT id, title, status, created_at, updated_at FROM bugs WHERE id = ? LIMIT 1',
        [queryId]
      );
      const existing = rows && rows[0];
      if (existing) {
        const createdAt = existing.created_at
          ? new Date(existing.created_at).toISOString().replace('T', ' ').replace('Z', '')
          : '';
        const updatedAt = existing.updated_at
          ? new Date(existing.updated_at).toISOString().replace('T', ' ').replace('Z', '')
          : '';
        throw new Error(
          `${formatBugId(existing.id)}? ?대? ?깅줉??踰꾧렇?낅땲??\n` +
          `  - 제목: ${existing.title || ''}\n` +
          `  - 상태: ${existing.status || ''}\n` +
          `  - 생성시: ${createdAt}\n` +
          `  - 수정시: ${updatedAt}`
        );
      }
    }
    throw error;
  }
  return formatBugId(numericId);
}

async function claimBug(workerId, type) {
  await ready;
  return withTx(async (conn) => {
    const [rows] = await conn.execute(
      `
        SELECT * FROM bugs
        WHERE status = 'open' AND (? IS NULL OR type = ?)
        ORDER BY created_at ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      `,
      [type || null, type || null]
    );
    const bug = rows[0];
    if (!bug) return null;

    const meta = parseMeta(bug.metadata);
    meta.claimed_at = now();
    meta.claimed_by = workerId;

    const [result] = await conn.execute(
      `
        UPDATE bugs
        SET status = 'in_progress', assigned_to = ?, metadata = ?, updated_at = NOW()
        WHERE id = ? AND status = 'open'
      `,
      [workerId, JSON.stringify(meta), bug.id]
    );
    if (result.affectedRows === 0) return null;

    return { ...bug, id: formatBugId(bug.id), status: 'in_progress', assigned_to: workerId, metadata: meta };
  });
}

async function updateBugStatus(id, workerId, status, note) {
  await ready;
  const numericId = parseBugId(id);
  if (!numericId) return { ok: false, reason: 'invalid_id' };

  return withTx(async (conn) => {
    const [rows] = await conn.execute('SELECT * FROM bugs WHERE id = ? FOR UPDATE', [numericId]);
    const bug = rows[0];
    if (!bug) return { ok: false, reason: 'not_found' };

    if (['resolved', 'closed'].includes(bug.status)) {
      return { ok: false, reason: 'already_done' };
    }

    if (bug.assigned_to && bug.assigned_to !== workerId) {
      return { ok: false, reason: `assigned_to_${bug.assigned_to}` };
    }

    const meta = parseMeta(bug.metadata);
    if (note) {
      meta.notes = meta.notes || [];
      meta.notes.push({ worker: workerId, note, at: now() });
    }

    const nextAssigned = bug.assigned_to || workerId;
    const nextResolution = ['resolved', 'closed'].includes(status) && note ? note : bug.resolution_note || null;
    const [res] = await conn.execute(
      `
        UPDATE bugs
        SET status = ?, assigned_to = ?, metadata = ?, resolution_note = ?, updated_at = NOW()
        WHERE id = ?
      `,
      [status, nextAssigned, JSON.stringify(meta), nextResolution, numericId]
    );

    return {
      ok: res.affectedRows > 0,
      bug: { ...bug, id: formatBugId(bug.id), status, assigned_to: nextAssigned, metadata: meta, resolution_note: nextResolution }
    };
  });
}

async function listBugs(status = 'open', limit = 20, type = null) {
  await ready;
  const whereClauses = [];
  const params = [];

  if (status !== 'all') {
    whereClauses.push('status = ?');
    params.push(status);
  } else {
    whereClauses.push('1=1');
  }

  if (type && type !== 'all') {
    whereClauses.push('type = ?');
    params.push(type);
  }

  const whereClause = whereClauses.join(' AND ');
  const safeLimit = Math.max(1, Math.min(Number(limit) || 20, 1000));
  const [rows] = await pool.execute(
    `SELECT * FROM bugs WHERE ${whereClause} ORDER BY created_at DESC LIMIT ${safeLimit}`,
    params
  );

  return rows.map(bug => ({ ...bug, id: formatBugId(bug.id), metadata: parseMeta(bug.metadata) }));
}

async function getBug(id) {
  await ready;
  const numericId = parseBugId(id);
  if (!numericId) return null;
  const [rows] = await pool.execute('SELECT * FROM bugs WHERE id = ?', [numericId]);
  const bug = rows[0];
  if (!bug) return null;
  return { ...bug, id: formatBugId(bug.id), metadata: parseMeta(bug.metadata) };
}

async function closePool() {
  try {
    await pool.end();
  } catch (error) {
    // ignore close errors
  }
}

init().catch((e) => {
  console.error('Failed to init bug DB:', e.message);
});

module.exports = {createBug,
  claimBug,
  updateBugStatus,
  listBugs,
  getBug,
  formatBugId,
  parseBugId,
  dbConfig,
  closePool,
  getWorkerIdByPid,
  isMyWorker
};
