#!/usr/bin/env node
/**
 * bug.js - BTS 버그 관리 CLI
 *
 * 사용법:
 *   node bug.js list                    # open 버그 목록
 *   node bug.js get 3025                # 버그 상세 조회
 *   node bug.js add "제목" "요약" P1    # 버그 등록 (priority: P0~P3)
 *   node bug.js spec "제목" "요약" P2   # SPEC 등록
 *   node bug.js claim 3025              # 버그 클레임 (작업 시작)
 *   node bug.js resolve 3025 "해결내용" # 버그 해결
 *   node bug.js reopen 3025             # 버그 재오픈
 */

const mysql = require('mysql2/promise');

const dbConfig = {
  host: process.env.TREND_DB_HOST || '127.0.0.1',
  port: parseInt(process.env.TREND_DB_PORT) || 3306,
  user: 'root',
  password: 'trend2024',
  database: 'trend_video'
};

const MY_PID = process.pid;
const { execSync } = require('child_process');

// Windows에서 PID가 살아있는지 확인
function isProcessRunning(pid) {
  if (!pid) return false;
  try {
    const result = execSync(`tasklist /FI "PID eq ${pid}" /NH`, { encoding: 'utf8' });
    return result.includes(pid.toString());
  } catch { return false; }
}

async function getConnection() {
  return mysql.createConnection(dbConfig);
}

// open 버그 목록
async function listBugs() {
  const conn = await getConnection();
  const [rows] = await conn.execute(`
    SELECT id, type, priority, title, status, assigned_to, worker_pid
    FROM bugs
    WHERE status = 'open'
    ORDER BY
      CASE priority WHEN 'P0' THEN 0 WHEN 'P1' THEN 1 WHEN 'P2' THEN 2 ELSE 3 END,
      created_at ASC
    LIMIT 20
  `);

  console.log('\n=== Open Bugs ===');
  rows.forEach(r => {
    const prefix = r.type === 'spec' ? 'SPEC' : 'BTS';
    console.log(`  ${prefix}-${r.id} [${r.priority}] ${r.title.substring(0, 50)}`);
  });
  console.log(`\nTotal: ${rows.length}\n`);

  await conn.end();
}

// 버그 상세 조회
async function getBug(bugId) {
  const conn = await getConnection();
  const [rows] = await conn.execute('SELECT * FROM bugs WHERE id = ?', [bugId]);

  if (rows.length === 0) {
    console.log(`BTS-${bugId} not found`);
  } else {
    console.log(JSON.stringify(rows[0], null, 2));
  }

  await conn.end();
}

// 버그/SPEC 등록
async function addBug(title, summary, priority = 'P2', type = 'bug') {
  const conn = await getConnection();
  await conn.execute(
    'INSERT INTO bugs (title, summary, status, priority, type, created_at, updated_at) VALUES (?, ?, ?, ?, ?, NOW(), NOW())',
    [title, summary, 'open', priority, type]
  );

  const [result] = await conn.execute('SELECT LAST_INSERT_ID() as id');
  const prefix = type === 'spec' ? 'SPEC' : 'BTS';
  console.log(`${prefix}-${result[0].id} 등록 완료`);

  await conn.end();
}

// 버그 클레임
async function claimBug(bugId) {
  const conn = await getConnection();

  // 현재 상태 확인
  const [rows] = await conn.execute('SELECT status, worker_pid FROM bugs WHERE id = ?', [bugId]);
  if (rows.length === 0) {
    console.log(`BTS-${bugId} not found`);
    await conn.end();
    return;
  }

  const bug = rows[0];
  if (bug.status === 'in_progress' && bug.worker_pid && bug.worker_pid !== MY_PID) {
    // BTS-3035: 해당 PID가 죽었으면 claim 가능
    if (isProcessRunning(bug.worker_pid)) {
      console.log(`BTS-${bugId} is already claimed by PID ${bug.worker_pid} (running)`);
      await conn.end();
      return;
    }
    console.log(`PID ${bug.worker_pid} is dead, claiming for myself`);
  }

  await conn.execute(
    "UPDATE bugs SET status = 'in_progress', worker_pid = ?, assigned_to = 'Claude', updated_at = NOW() WHERE id = ?",
    [MY_PID, bugId]
  );
  console.log(`BTS-${bugId} claimed (PID: ${MY_PID})`);

  await conn.end();
}

// 버그 해결
async function resolveBug(bugId, note) {
  const conn = await getConnection();
  await conn.execute(
    "UPDATE bugs SET status = 'resolved', worker_pid = NULL, assigned_to = NULL, resolution_note = ?, updated_at = NOW() WHERE id = ?",
    [note, bugId]
  );
  console.log(`BTS-${bugId} resolved`);

  await conn.end();
}

// 버그 재오픈
async function reopenBug(bugId) {
  const conn = await getConnection();
  await conn.execute(
    "UPDATE bugs SET status = 'open', worker_pid = NULL, assigned_to = NULL, updated_at = NOW() WHERE id = ?",
    [bugId]
  );
  console.log(`BTS-${bugId} reopened`);

  await conn.end();
}

// 메인
async function main() {
  const args = process.argv.slice(2);
  const cmd = args[0];

  if (!cmd) {
    console.log(`
bug.js - BTS 버그 관리 CLI

사용법:
  node bug.js list                    # open 버그 목록
  node bug.js get <id>                # 버그 상세 조회
  node bug.js add "<제목>" "<요약>" [P0-P3]  # 버그 등록
  node bug.js spec "<제목>" "<요약>" [P0-P3] # SPEC 등록
  node bug.js claim <id>              # 버그 클레임
  node bug.js resolve <id> "<해결내용>"     # 버그 해결
  node bug.js reopen <id>             # 버그 재오픈
`);
    return;
  }

  switch (cmd) {
    case 'list':
    case 'ls':
      await listBugs();
      break;

    case 'get':
      await getBug(args[1]);
      break;

    case 'add':
      await addBug(args[1], args[2], args[3] || 'P2', 'bug');
      break;

    case 'spec':
      await addBug(args[1], args[2], args[3] || 'P2', 'spec');
      break;

    case 'claim':
      await claimBug(args[1]);
      break;

    case 'resolve':
      await resolveBug(args[1], args[2]);
      break;

    case 'reopen':
      await reopenBug(args[1]);
      break;

    default:
      console.log(`Unknown command: ${cmd}`);
  }
}

main().catch(console.error);
