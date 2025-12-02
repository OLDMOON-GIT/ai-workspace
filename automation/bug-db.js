const mysql = require('mysql2/promise');

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'trend2024',
  database: process.env.DB_NAME || 'trend_video',
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

async function init() {
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS bugs (
      id VARCHAR(64) PRIMARY KEY,
      title TEXT NOT NULL,
      summary TEXT,
      status VARCHAR(32) NOT NULL,
      log_path TEXT,
      screenshot_path TEXT,
      video_path TEXT,
      trace_path TEXT,
      resolution_note TEXT,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL,
      assigned_to VARCHAR(64),
      metadata JSON
    )
  `);

  // bug_sequence 테이블 생성
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS bug_sequence (
      id INT PRIMARY KEY DEFAULT 1,
      next_number INT NOT NULL DEFAULT 1
    )
  `);

  // 초기 시퀀스 값 설정
  await pool.execute(`INSERT INTO bug_sequence (id, next_number) VALUES (1, 1) ON DUPLICATE KEY UPDATE id=id`);

  try {
    await pool.execute(`CREATE INDEX idx_bugs_status_created ON bugs(status, created_at)`);
  } catch (error) {
    // ER_DUP_KEYNAME (1061) means index already exists; ignore for idempotency
    if (error && error.errno !== 1061) {
      throw error;
    }
  }
  try {
    await pool.execute(`ALTER TABLE bugs ADD COLUMN resolution_note TEXT`);
  } catch (error) {
    // ER_DUP_FIELDNAME (1060) means column already exists
    if (error && error.errno !== 1060) {
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

  let bugId = id;
  if (!bugId) {
    // bug_sequence에서 다음 번호 가져오기
    await pool.execute(`UPDATE bug_sequence SET next_number = next_number + 1 WHERE id = 1`);
    const [rows] = await pool.execute(`SELECT next_number FROM bug_sequence WHERE id = 1`);
    const nextNum = rows[0].next_number;
    bugId = `BTS-${String(nextNum).padStart(7, '0')}`;
  }

  await pool.execute(
    `
      INSERT INTO bugs (
        id, title, summary, status, log_path, screenshot_path, video_path, trace_path,
        resolution_note, created_at, updated_at, assigned_to, metadata
      ) VALUES (?, ?, ?, 'open', ?, ?, ?, ?, ?, NOW(), NOW(), ?, ?)
    `,
    [
      bugId,
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
  return bugId;
}

async function claimBug(workerId) {
  await ready;
  return withTx(async (conn) => {
    const [rows] = await conn.execute(
      `
        SELECT * FROM bugs
        WHERE status = 'open'
        ORDER BY created_at ASC
        LIMIT 1
        FOR UPDATE
      `
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

    return { ...bug, status: 'in_progress', assigned_to: workerId, metadata: meta };
  });
}

async function updateBugStatus(id, workerId, status, note) {
  await ready;
  return withTx(async (conn) => {
    const [rows] = await conn.execute(`SELECT * FROM bugs WHERE id = ? FOR UPDATE`, [id]);
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
      [status, nextAssigned, JSON.stringify(meta), nextResolution, id]
    );

    return {
      ok: res.affectedRows > 0,
      bug: { ...bug, status, assigned_to: nextAssigned, metadata: meta, resolution_note: nextResolution }
    };
  });
}

async function listBugs(status = 'open', limit = 20) {
  await ready;
  const whereClause = status === 'all' ? '1=1' : 'status = ?';
  const params = status === 'all' ? [] : [status];
  const safeLimit = Math.max(1, Math.min(Number(limit) || 20, 1000));
  const [rows] = await pool.execute(
    `
      SELECT *
      FROM bugs
      WHERE ${whereClause}
      ORDER BY created_at DESC
      LIMIT ${safeLimit}
    `,
    params
  );
  return rows;
}

async function getBug(id) {
  await ready;
  const [rows] = await pool.execute(`SELECT * FROM bugs WHERE id = ?`, [id]);
  const bug = rows[0];
  if (!bug) return null;
  return { ...bug, metadata: parseMeta(bug.metadata) };
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
  dbConfig,
  closePool
};
