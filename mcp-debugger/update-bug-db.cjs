const fs = require('fs');
const path = require('path');

const content = `const mysql = require('mysql2/promise');

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'trend2024',
  database: process.env.DB_NAME || 'trend_video',
  charset: 'utf8mb4',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
};

const pool = mysql.createPool(dbConfig);

function now() {
  return new Date().toISOString();
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

// ?レ옄 ID瑜?BTS- ?뺤떇 臾몄옄?대줈 蹂??function formatBugId(numId) {
  return \`BTS-\${String(numId).padStart(7, '0')}\`;
}

// BTS- 형식 문자열을 숫자로 변환 (BTS-0001234 -> 1234)
function parseBugId(idStr) {
  if (typeof idStr === 'number') return idStr;
  if (typeof idStr === 'string') {
    return parseInt(idStr.replace(/^BTS-/i, ''), 10);
  }
  return parseInt(idStr, 10);
}

async function init() {
  // bugs ?뚯씠釉붿? ?댁젣 INT AUTO_INCREMENT id ?ъ슜
  // 湲곗〈 ?뚯씠釉붿씠 留덉씠洹몃젅?댁뀡?섏뼱 ?덈떎怨?媛??
  try {
    await pool.execute('CREATE INDEX idx_bugs_status_created ON bugs(status, created_at)');
  } catch (error) {
    // ER_DUP_KEYNAME (1061) means index already exists; ignore for idempotency
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

  // id媛 ?덉쑝硫?BTS- ?꾨━?쎌뒪 ?쒓굅 ???レ옄濡??ъ슜
  let numericId = id ? parseBugId(id) : null;

  try {
    if (numericId) {
      // 紐낆떆??ID 吏??      await pool.execute(
        \`INSERT INTO bugs (
            id, type, title, summary, status, log_path, screenshot_path, video_path, trace_path,
            resolution_note, created_at, updated_at, assigned_to, metadata
          ) VALUES (?, ?, ?, ?, 'open', ?, ?, ?, ?, ?, NOW(), NOW(), ?, ?)\`,
        [
          numericId, type, title, summary,
          logPath || null, screenshotPath || null, videoPath || null, tracePath || null,
          null, worker || null, JSON.stringify(metadata || {})
        ]
      );
    } else {
      // AUTO_INCREMENT ?ъ슜 (id 而щ읆 ?앸왂)
      const [result] = await pool.execute(
        \`INSERT INTO bugs (
            type, title, summary, status, log_path, screenshot_path, video_path, trace_path,
            resolution_note, created_at, updated_at, assigned_to, metadata
          ) VALUES (?, ?, ?, 'open', ?, ?, ?, ?, ?, NOW(), NOW(), ?, ?)\`,
        [
          type, title, summary,
          logPath || null, screenshotPath || null, videoPath || null, tracePath || null,
          null, worker || null, JSON.stringify(metadata || {})
        ]
      );
      numericId = result.insertId;
    }
  } catch (error) {
    if (error && error.code === 'ER_DUP_ENTRY') {
      const queryId = numericId || parseBugId(id);
      const [rows] = await pool.execute(
        'SELECT id, title, status, created_at, updated_at FROM bugs WHERE id = ? LIMIT 1',
        [queryId]
      );
      const existing = rows && rows[0];
      if (existing) {
        const createdAt = existing.created_at ? new Date(existing.created_at).toISOString().replace('T', ' ').replace('Z', '') : '';
        const updatedAt = existing.updated_at ? new Date(existing.updated_at).toISOString().replace('T', ' ').replace('Z', '') : '';
        throw new Error(
          \`\${formatBugId(existing.id)}? ?대? ?깅줉??踰꾧렇?낅땲??\\n\` +
          \`  - ?쒕ぉ: \${existing.title || ''}\\n\` +
          \`  - ?곹깭: \${existing.status || ''}\\n\` +
          \`  - ?앹꽦?쇱떆: \${createdAt}\\n\` +
          \`  - ?섏젙?쇱떆: \${updatedAt}\`
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
      \`SELECT * FROM bugs
        WHERE status = 'open' AND (? IS NULL OR type = ?)
        ORDER BY created_at ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED\`,
      [type || null, type || null]
    );
    const bug = rows[0];
    if (!bug) return null;

    const meta = parseMeta(bug.metadata);
    meta.claimed_at = now();
    meta.claimed_by = workerId;

    const [result] = await conn.execute(
      \`UPDATE bugs
        SET status = 'in_progress', assigned_to = ?, metadata = ?, updated_at = NOW()
        WHERE id = ? AND status = 'open'\`,
      [workerId, JSON.stringify(meta), bug.id]
    );
    if (result.affectedRows === 0) return null;

    return { ...bug, id: formatBugId(bug.id), status: 'in_progress', assigned_to: workerId, metadata: meta };
  });
}

async function updateBugStatus(id, workerId, status, note) {
  await ready;
  const numericId = parseBugId(id);

  return withTx(async (conn) => {
    const [rows] = await conn.execute('SELECT * FROM bugs WHERE id = ? FOR UPDATE', [numericId]);
    const bug = rows[0];
    if (!bug) return { ok: false, reason: 'not_found' };

    if (['resolved', 'closed'].includes(bug.status)) {
      return { ok: false, reason: 'already_done' };
    }

    if (bug.assigned_to && bug.assigned_to !== workerId) {
      return { ok: false, reason: \`assigned_to_\${bug.assigned_to}\` };
    }

    const meta = parseMeta(bug.metadata);
    if (note) {
      meta.notes = meta.notes || [];
      meta.notes.push({ worker: workerId, note, at: now() });
    }

    const nextAssigned = bug.assigned_to || workerId;
    const nextResolution = ['resolved', 'closed'].includes(status) && note ? note : bug.resolution_note || null;
    const [res] = await conn.execute(
      \`UPDATE bugs
        SET status = ?, assigned_to = ?, metadata = ?, resolution_note = ?, updated_at = NOW()
        WHERE id = ?\`,
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
    \`SELECT * FROM bugs WHERE \${whereClause} ORDER BY created_at DESC LIMIT \${safeLimit}\`,
    params
  );

  return rows.map(bug => ({ ...bug, id: formatBugId(bug.id) }));
}

async function getBug(id) {
  await ready;
  const numericId = parseBugId(id);
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

module.exports = {
  createBug,
  claimBug,
  updateBugStatus,
  listBugs,
  getBug,
  formatBugId,
  parseBugId,
  dbConfig,
  closePool
};
`;

const targetPath = path.join(__dirname, '..', 'automation', 'bug-db.js');
fs.writeFileSync(targetPath, content, 'utf-8');
console.log('Updated:', targetPath);
