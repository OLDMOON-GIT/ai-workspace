#!/usr/bin/env node
/**
 * Spawning Pool (BTS-3007)
 * Worker spawn process
 * - MySQL bugs: claim open bug -> in_progress marking
 * - claude/codex/gemini worker spawn
 * - Auto rollback on spawn failure (in_progress -> open)
 * - Worker heartbeat monitoring (30s timeout)
 *
 * BTS-3025: worker_pid column stores actual PID, assigned_to stores worker type only
 * BTS-3024: Rollback guarantee on spawn failure (try-finally), spawned process self-marking support
 * BTS-3028: Fixed infinite spawn loop - detached process close event ignored,
 *           cleanup via periodic PID check only (30s grace period)
 * BTS-3044: Fix rollback for completed tasks - check DB status and worker_pid before rollback
 */

// BTS-3060: ?묒뾽 愿由ъ옄?먯꽌 ?꾨줈?몄뒪 ?앸퀎 媛?ν븯?꾨줉 ?ㅼ젙
process.title = 'SpawningPool';

import { spawn, ChildProcess, execSync } from 'child_process';
import * as mysql from 'mysql2/promise';
import * as os from 'os';

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'trend2024',
  database: process.env.DB_NAME || 'trend_video'
};

// Worker settings
const MAX_WORKERS = 10;
const SPAWN_TIMEOUT_MS = 30000; // 30s timeout
const SPAWN_DELAY_MS = 3000;    // spawn interval

const WORKER_COMMANDS = [
  { name: 'claude-1', cmd: 'claude', args: ['--dangerously-skip-permissions', '-p'], limit: 1, usePromptArg: true, enabled: true },
  { name: 'claude-2', cmd: 'claude', args: ['--dangerously-skip-permissions', '-p'], limit: 1, usePromptArg: true, enabled: true },
  // BTS-3040: Codex/Gemini ?쇱떆 鍮꾪솢?깊솕
  { name: 'codex', cmd: 'codex', args: ['--yolo'], limit: 1, usePromptArg: false, enabled: false },
  { name: 'gemini', cmd: 'gemini', args: ['--yolo'], limit: 1, usePromptArg: false, enabled: false },
];

interface SpawnedWorker {
  workerId: string;
  workerType: string;
  bugId: number;
  spawnedAt: Date;
  process: ChildProcess | null;
  pid: number | null;
  status: 'spawning' | 'running' | 'failed' | 'completed';
}

interface BugRecord {
  id: number;
  type: string;
  priority: string;
  title: string;
  summary: string;
  status: string;
  assigned_to: string | null;
}

// Spawning pool state
const activeWorkers: Map<string, SpawnedWorker> = new Map();
const workerTypeCounts: Map<string, number> = new Map();
let workerIdCounter = 0;

// Consecutive failure tracking (per worker type)
const failureCounts: Map<string, number> = new Map();
const MAX_CONSECUTIVE_FAILURES = 3;
const disabledWorkerTypes: Set<string> = new Set();

// BTS-3024: Rollback state tracking (prevent duplicate rollback)
const rolledBackBugs: Set<number> = new Set();

// BTS-3027: PID濡??꾨줈?몄뒪 議댁옱 ?щ? ?뺤씤
function isProcessRunning(pid: number): boolean {
  try {
    if (os.platform() === 'win32') {
      // Windows: tasklist濡??뺤씤
      const result = execSync(`tasklist /FI "PID eq ${pid}" /NH`, { encoding: 'utf8' });
      return result.includes(pid.toString());
    } else {
      // Unix: kill 0?쇰줈 ?뺤씤 (?ㅼ젣 kill ?꾨떂)
      process.kill(pid, 0);
      return true;
    }
  } catch {
    return false;
  }
}

async function getOpenBug(): Promise<BugRecord | null> {
  let connection;
  try {
    connection = await mysql.createConnection(dbConfig);
    const [rows] = await connection.execute(`
      SELECT id, type, priority, title, summary, status, assigned_to
      FROM bugs
      WHERE status = 'open'
      ORDER BY
        CASE priority
          WHEN 'P0' THEN 0
          WHEN 'P1' THEN 1
          WHEN 'P2' THEN 2
          WHEN 'P3' THEN 3
          ELSE 4
        END,
        created_at ASC
      LIMIT 1
    `);
    const bugs = rows as BugRecord[];
    return bugs.length > 0 ? bugs[0] : null;
  } finally {
    if (connection) await connection.end();
  }
}

// BTS-3025: Temporary marking (before spawn, using spawning-pool PID)
async function claimBugTemporary(bugId: number, workerType: string): Promise<boolean> {
  let connection;
  try {
    connection = await mysql.createConnection(dbConfig);
    const [result] = await connection.execute(`
      UPDATE bugs
      SET status = 'in_progress', assigned_to = ?, worker_pid = ?, updated_at = NOW()
      WHERE id = ? AND status = 'open'
    `, [workerType, process.pid, bugId]);
    return (result as any).affectedRows > 0;
  } finally {
    if (connection) await connection.end();
  }
}

// BTS-3025: Update with actual PID
async function updateBugWithPid(bugId: number, pid: number): Promise<void> {
  let connection;
  try {
    connection = await mysql.createConnection(dbConfig);
    await connection.execute(`
      UPDATE bugs
      SET worker_pid = ?, updated_at = NOW()
      WHERE id = ?
    `, [pid, bugId]);
    console.log(`  [PID] #${bugId} worker_pid = ${pid}`);
  } finally {
    if (connection) await connection.end();
  }
}

// BTS-3024: Improved rollback function - prevent duplicate rollback
async function releaseBug(bugId: number): Promise<void> {
  if (rolledBackBugs.has(bugId)) {
    console.log(`  [rollback] #${bugId} already rolled back - skip`);
    return;
  }

  let connection;
  try {
    connection = await mysql.createConnection(dbConfig);
    const [result] = await connection.execute(`
      UPDATE bugs
      SET status = 'open', assigned_to = NULL, worker_pid = NULL, updated_at = NOW()
      WHERE id = ? AND status = 'in_progress'
    `, [bugId]);

    if ((result as any).affectedRows > 0) {
      rolledBackBugs.add(bugId);
      console.log(`  [rollback] #${bugId} -> open status restored`);

      // Remove from rollback tracking after 1 minute (allow retry)
      setTimeout(() => {
        rolledBackBugs.delete(bugId);
      }, 60000);
    }
  } finally {
    if (connection) await connection.end();
  }
}

/**
 * BTS-3024: Spawned process bug status check and self-marking
 * If spawned process (Claude/Codex/Gemini) checks BTS and it's not in_progress, self-mark
 *
 * @param bugId Bug ID
 * @param workerId Worker ID (e.g., 'Claude-1', 'Codex-1')
 * @returns Bug info or null (if another worker is working or not found)
 */
export async function ensureBugClaimed(bugId: number, workerId: string): Promise<BugRecord | null> {
  let connection;
  try {
    connection = await mysql.createConnection(dbConfig);

    // 1. Check current bug status
    const [rows] = await connection.execute(`
      SELECT id, type, priority, title, summary, status, assigned_to
      FROM bugs
      WHERE id = ?
    `, [bugId]);

    const bugs = rows as BugRecord[];
    if (bugs.length === 0) {
      console.log(`  [BTS-3024] Bug #${bugId} not found`);
      return null;
    }

    const bug = bugs[0];

    // 2. If already in_progress and another worker is working, return null
    if (bug.status === 'in_progress' && bug.assigned_to && bug.assigned_to !== workerId) {
      console.log(`  [BTS-3024] Bug #${bugId} is being worked on by ${bug.assigned_to} - skip`);
      return null;
    }

    // 3. If not in_progress, or no assigned_to, or self -> self-mark
    if (bug.status !== 'in_progress' || !bug.assigned_to || bug.assigned_to === workerId) {
      const [result] = await connection.execute(`
        UPDATE bugs
        SET status = 'in_progress', assigned_to = ?, updated_at = NOW()
        WHERE id = ?
      `, [workerId, bugId]);

      if ((result as any).affectedRows > 0) {
        console.log(`  [BTS-3024] Bug #${bugId} self-claimed by ${workerId}`);
        bug.status = 'in_progress';
        bug.assigned_to = workerId;
      }
    }

    return bug;
  } finally {
    if (connection) await connection.end();
  }
}

function getAvailableWorkerType(): typeof WORKER_COMMANDS[0] | null {
  for (const cfg of WORKER_COMMANDS) {
    // BTS-3040: enabled媛 false硫??ㅽ궢
    if (cfg.enabled === false) {
      continue;
    }
    if (disabledWorkerTypes.has(cfg.name)) {
      continue;
    }

    const count = workerTypeCounts.get(cfg.name) || 0;
    if (count < cfg.limit) {
      return cfg;
    }
  }
  return null;
}

// BTS-3024: Spawn failure rollback guarantee (try-finally pattern)
async function spawnWorker(bug: BugRecord): Promise<void> {
  const workerId = `worker-${++workerIdCounter}`;
  const workerCfg = getAvailableWorkerType();

  if (!workerCfg) {
    console.log('  [!] No available worker type');
    return;
  }

  // 1. Bug claim (in_progress marking)
  const claimed = await claimBugTemporary(bug.id, workerCfg.name);
  if (!claimed) {
    console.log(`  [!] Bug #${bug.id} claim failed (already in progress)`);
    return;
  }

  // 2. Register worker state
  const worker: SpawnedWorker = {
    workerId,
    workerType: workerCfg.name,
    bugId: bug.id,
    spawnedAt: new Date(),
    process: null,
    pid: null,
    status: 'spawning'
  };
  activeWorkers.set(workerId, worker);
  workerTypeCounts.set(workerCfg.name, (workerTypeCounts.get(workerCfg.name) || 0) + 1);

  console.log('');
  console.log('  +-------------------------------------------------------------');
  console.log(`  | Spawn: ${workerId} (${workerCfg.name})`);
  console.log(`  | Bug #${bug.id}: ${bug.title.substring(0, 50)}`);
  console.log('  +-------------------------------------------------------------');

  // BTS-3024: Track spawn success
  let spawnSuccess = false;

  // 3. Worker spawn (delayed) - BTS-3024: try-finally for rollback guarantee
  setTimeout(async () => {
    try {
      const btsId = `BTS-${bug.id}`;
      const summaryText = (bug.summary || '').substring(0, 500);
      const titleText = (bug.title || '').trim();
      const bugType = bug.type === 'spec' ? 'SPEC' : 'BUG';

      let finalArgs: string[];

      if (workerCfg.usePromptArg) {
        // Claude: -p ?듭뀡 ?ъ슜, ?곸꽭 ?꾨＼?꾪듃 ?꾨떖
        const prompt = `?뱀떊? ?뚰봽?몄썾??媛쒕컻?먯엯?덈떎.
?ㅼ쓬 ?묒뾽???섑뻾?댁＜?몄슂.

?묒뾽 ?뺣낫:
- BTS ID: ${btsId}
- ?좏삎: ${bugType}
- ?쒕ぉ: ${titleText}
- ?ㅻ챸: ${summaryText}
- ?묒뾽 ?붾젆?좊━: ${process.cwd()}

?묒뾽???꾨즺????諛섎뱶??bug.js瑜??ъ슜?섏뿬 踰꾧렇瑜?resolve 泥섎━?댁＜?몄슂:
node bug.js resolve ${bug.id} "?닿껐 ?댁슜 ?붿빟"

JSON ?뺤떇?쇰줈 寃곌낵瑜?諛섑솚?댁＜?몄슂:
{
    "success": true ?먮뒗 false,
    "summary": "?섑뻾???묒뾽 ?붿빟",
    "files_modified": ["?섏젙???뚯씪 紐⑸줉"],
    "error": "?먮윭 硫붿떆吏 (?ㅽ뙣??寃쎌슦)"
}`;
        finalArgs = [...workerCfg.args, prompt];
      } else {
        // Codex/Gemini: 湲곗〈 諛⑹떇 (?⑥닚 硫붿떆吏)
        const rawMsg = `${btsId} ${titleText}\n\n${summaryText}`;
        const msg = rawMsg
          .replace(/\\n/g, ' ')
          .replace(/[\r\n]+/g, ' ')
          .replace(/["'`]/g, '')
          .replace(/\s+/g, ' ')
          .trim()
          .substring(0, 500);
        finalArgs = [...workerCfg.args, msg];
      }
      const quotedArgs = finalArgs.map(a => (/\s/.test(a) ? `"${a}"` : a)).join(' ');
      const commandLine = `${workerCfg.cmd} ${quotedArgs}`.trim();

      // BTS-3028: Windows?먯꽌 claude/codex/gemini 紐낅졊?대? 李얠쑝?ㅻ㈃ shell: true ?꾩슂
      // detached: true濡?遺紐??꾨줈?몄뒪? 遺꾨━?섏뿬 ?낅┰ ?ㅽ뻾
      const proc = spawn(workerCfg.cmd, finalArgs, {
        cwd: process.cwd(),
        stdio: 'ignore',
        detached: true,
        shell: true,  // BTS-3028: Windows PATH?먯꽌 紐낅졊??李얘린 ?꾪빐 ?꾩슂
        windowsHide: true  // SPEC-3057: ?ㅻ뱶由ъ뒪 紐⑤뱶 - cmd 李??④?
      });

      // detached ?꾨줈?몄뒪??遺紐⑥? 遺꾨━
      proc.unref();

      worker.process = proc;
      worker.status = 'running';
      spawnSuccess = true;

      if (proc.pid) {
        worker.pid = proc.pid;
        await updateBugWithPid(bug.id, proc.pid);
      }

      failureCounts.set(workerCfg.name, 0);

      // BTS-3042: ?ㅽ룿 ???꾩껜 濡쒓렇 異쒕젰
      console.log(`  [+] Spawn complete: ${workerId} (PID: ${proc.pid})`);
      console.log(`  [CMD] ${workerCfg.cmd}`);
      console.log(`  [ARGS]`);
      for (let i = 0; i < finalArgs.length; i++) {
        console.log(`    [${i}] ${finalArgs[i]}`);
      }
      console.log(`  [FULL] ${commandLine}`);

      proc.on('close', (code) => {
        handleWorkerExit(workerId, code);
      });

      proc.on('error', (err) => {
        console.error(`  [!] Spawn error: ${workerId}`, err.message);
        handleSpawnFailure(workerId, workerCfg.name);
      });

    } catch (error: any) {
      console.error(`  [!] Spawn exception: ${workerId}`, error.message);
      spawnSuccess = false;
    } finally {
      // BTS-3024: Rollback on spawn failure
      if (!spawnSuccess && worker.status === 'spawning') {
        console.log(`  [BTS-3024] Spawn failure detected - finally rollback`);
        await handleSpawnFailure(workerId, workerCfg.name);
      }
    }
  }, SPAWN_DELAY_MS);

  // 4. Timeout check
  setTimeout(async () => {
    const w = activeWorkers.get(workerId);
    if (w && w.status === 'spawning') {
      console.log(`  [!] Spawn timeout: ${workerId} (${SPAWN_TIMEOUT_MS}ms)`);
      await handleSpawnFailure(workerId, workerCfg.name);
    }
  }, SPAWN_TIMEOUT_MS);
}

async function handleSpawnFailure(workerId: string, workerType: string) {
  const worker = activeWorkers.get(workerId);
  if (!worker) return;

  // BTS-3024: Skip if already failed
  if (worker.status === 'failed') {
    return;
  }

  worker.status = 'failed';

  await releaseBug(worker.bugId);

  activeWorkers.delete(workerId);
  const count = workerTypeCounts.get(workerType) || 0;
  workerTypeCounts.set(workerType, Math.max(0, count - 1));

  const failures = (failureCounts.get(workerType) || 0) + 1;
  failureCounts.set(workerType, failures);

  if (failures >= MAX_CONSECUTIVE_FAILURES) {
    console.log(`  [!] ${workerType} ${failures} consecutive failures -> temporarily disabled`);
    disabledWorkerTypes.add(workerType);

    setTimeout(() => {
      disabledWorkerTypes.delete(workerType);
      failureCounts.set(workerType, 0);
      console.log(`  [+] ${workerType} re-enabled`);
    }, 5 * 60 * 1000);
  }
}

function handleWorkerExit(workerId: string, code: number | null) {
  const worker = activeWorkers.get(workerId);
  if (!worker) return;

  // BTS-3028: detached + unref ?꾨줈?몄뒪??close ?대깽?몃? ?꾩쟾??臾댁떆
  // ?ㅽ룿 吏곹썑 ?뚯씠??遺꾨━濡??명빐 close ?대깽?멸? 利됱떆 諛쒖깮?섏?留?  // ?ㅼ젣 ?꾨줈?몄뒪???낅┰?곸쑝濡??ㅽ뻾 以묒엫
  // ?뚯빱 ?뺣━??cleanupDeadWorkers()?먯꽌留??섑뻾
  if (worker.status === 'running') {
    console.log(`  [BTS-3028] Worker ${workerId} close event ignored (detached process, cleanup via periodic check)`);
    return;
  }

  // spawning ?곹깭?먯꽌??close??spawn ?ㅽ뙣
  if (worker.status === 'spawning') {
    console.log(`  [!] Worker spawn failed: ${workerId} (code: ${code})`);
    releaseBug(worker.bugId);
    activeWorkers.delete(workerId);
    const count = workerTypeCounts.get(worker.workerType) || 0;
    workerTypeCounts.set(worker.workerType, Math.max(0, count - 1));
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// BTS-3028: 二쇨린?곸쑝濡??뚯빱 ?곹깭 ?뺤씤 諛??뺣━
// 理쒖냼 30珥??댁긽 吏???뚯빱留??뺣━ (?ㅽ룿 吏곹썑 ?ㅽ깘 諛⑹?)
const MIN_WORKER_AGE_MS = 30000;

async function cleanupDeadWorkers(): Promise<void> {
  const now = Date.now();
  const deadWorkers: string[] = [];

  for (const [workerId, worker] of activeWorkers) {
    if (worker.status === 'running' && worker.pid) {
      // ?ㅽ룿 ??30珥??댁긽 吏???뚯빱留?泥댄겕
      const age = now - worker.spawnedAt.getTime();
      if (age < MIN_WORKER_AGE_MS) {
        continue;
      }

      // BTS-3044: DB?먯꽌 ?꾩옱 ?곹깭? worker_pid ?뺤씤
      // (?뚯빱媛 ?먯떊??PID濡??낅뜲?댄듃?섍굅??resolved 泥섎━?덉쓣 ???덉쓬)
      let connection;
      let dbWorkerPid: number | null = null;
      let dbStatus: string | null = null;
      try {
        connection = await mysql.createConnection(dbConfig);
        const [rows] = await connection.execute(
          'SELECT status, worker_pid FROM bugs WHERE id = ?',
          [worker.bugId]
        );
        const bugs = rows as any[];
        if (bugs.length > 0) {
          dbStatus = bugs[0].status;
          dbWorkerPid = bugs[0].worker_pid;
        }
      } finally {
        if (connection) await connection.end();
      }

      // condition check
      if (dbStatus === 'resolved' || dbWorkerPid === null) {
        console.log(`  [BTS-3044] Worker ${workerId} bug #${worker.bugId} already ${dbStatus || 'completed'} - cleanup only`);
        deadWorkers.push(workerId);
        continue;
      }

      // BTS-3044: DB??worker_pid媛 ?ㅻⅤ硫??뚯빱媛 ?먯떊??PID濡??낅뜲?댄듃??寃?      // ?대떦 PID媛 ?댁븘?덉쑝硫?skip
      if (dbWorkerPid !== worker.pid) {
        if (isProcessRunning(dbWorkerPid)) {
          console.log(`  [BTS-3044] Worker ${workerId} bug #${worker.bugId} taken over by PID ${dbWorkerPid} - skip cleanup`);
          worker.pid = dbWorkerPid;
          continue;
        }
      }

      // 원래 PID 또는 DB의 PID 모두 죽었으면 정리 대상
      if (!isProcessRunning(worker.pid) && (!dbWorkerPid || !isProcessRunning(dbWorkerPid))) {
        console.log(`  [BTS-3028] Worker ${workerId} (PID: ${worker.pid}) no longer running after ${Math.round(age/1000)}s - cleaning up`);
        deadWorkers.push(workerId);
      }
    }
  }

  for (const workerId of deadWorkers) {
    const worker = activeWorkers.get(workerId);
    if (worker) {
      // BTS-3044: 踰꾧렇 ?곹깭 ?ы솗??(?대? ?꾩뿉??泥댄겕?덉?留?race condition 諛⑹?)
      let connection;
      try {
        connection = await mysql.createConnection(dbConfig);
        const [rows] = await connection.execute(
          'SELECT status, worker_pid FROM bugs WHERE id = ?',
          [worker.bugId]
        );
        const bugs = rows as any[];
        // BTS-3044: in_progress?닿퀬 worker_pid媛 ?덉쓣 ?뚮쭔 濡ㅻ갚
        // BTS-3044: in_progress이고 worker_pid가 있을 때만 롤백
        // resolved이거나 worker_pid가 NULL이면 이미 완료된 것
        if (bugs.length > 0 && bugs[0].status === 'in_progress' && bugs[0].worker_pid !== null) {
          await releaseBug(worker.bugId);
        } else if (bugs.length > 0) {
          console.log(`  [BTS-3044] Bug #${worker.bugId} status=${bugs[0].status}, worker_pid=${bugs[0].worker_pid} - no rollback`);
        }
      } finally {
        if (connection) await connection.end();
      }

      activeWorkers.delete(workerId);
      const count = workerTypeCounts.get(worker.workerType) || 0;
      workerTypeCounts.set(worker.workerType, Math.max(0, count - 1));
    }
  }
}


// BTS-3081: 시작 시 및 매 루프마다 죽은 워커의 in_progress 버그를 open으로 롤백
async function cleanupOrphanedBugs(): Promise<number> {
  let connection;
  let cleaned = 0;
  try {
    connection = await mysql.createConnection(dbConfig);

    // in_progress 상태이고 worker_pid가 있는 버그 조회
    const [rows] = await connection.execute(`
      SELECT id, worker_pid, assigned_to, title
      FROM bugs
      WHERE status = 'in_progress' AND worker_pid IS NOT NULL
    `);
    const bugs = rows as any[];

    for (const bug of bugs) {
      // 해당 PID가 죽었으면 롤백
      if (!isProcessRunning(bug.worker_pid)) {
        console.log(`  [BTS-3081] Orphaned bug #${bug.id} (PID ${bug.worker_pid} dead) -> open`);
        await connection.execute(`
          UPDATE bugs
          SET status = 'open', worker_pid = NULL, assigned_to = NULL, updated_at = NOW()
          WHERE id = ? AND status = 'in_progress'
        `, [bug.id]);
        cleaned++;
      }
    }

    return cleaned;
  } finally {
    if (connection) await connection.end();
  }
}

async function spawningPool() {
  console.log('');
  console.log('================================================================');
  console.log('           Spawning Pool (BTS-3007, BTS-3024, BTS-3028)');
  console.log('           Worker spawn + auto rollback + PID monitoring');
  console.log('           BTS-3028: Fixed infinite spawn loop');
  console.log('           BTS-3044: Fixed rollback for completed tasks');
  console.log('           BTS-3081: Startup orphan cleanup');
  console.log('================================================================');
  console.log('');
  console.log(`  Max workers: ${MAX_WORKERS}`);
  console.log(`  Spawn timeout: ${SPAWN_TIMEOUT_MS / 1000}s`);
  console.log('');
  console.log('----------------------------------------------------------------');
  console.log('');

  // BTS-3081: 시작 시 orphaned 버그 정리
  const orphanCount = await cleanupOrphanedBugs();
  if (orphanCount > 0) {
    console.log(`  [BTS-3081] Cleaned up ${orphanCount} orphaned bug(s) at startup`);
  }
  console.log('');

  console.log('  Press Ctrl+C to exit');
  console.log('----------------------------------------------------------------');
  console.log('');

  let loopCount = 0;

  while (true) {
    try {
      // BTS-3027: 留?猷⑦봽留덈떎 二쎌? ?뚯빱 ?뺣━
      // BTS-3081: 매 루프마다 orphaned 버그 정리
      await cleanupOrphanedBugs();
      await cleanupDeadWorkers();

      const currentWorkers = activeWorkers.size;

      if (currentWorkers < MAX_WORKERS && getAvailableWorkerType()) {
        const bug = await getOpenBug();

        if (bug) {
          await spawnWorker(bug);
        }
      }

      loopCount++;
      // 12??(??60珥?留덈떎 ?곹깭 異쒕젰
      if (loopCount % 12 === 0) {
        const timeStr = new Date().toLocaleTimeString('ko-KR');
        const disabled = disabledWorkerTypes.size > 0 ? ` (disabled: ${Array.from(disabledWorkerTypes).join(', ')})` : '';
        const workerList = Array.from(activeWorkers.values())
          .map(w => `${w.workerType}:${w.pid || '?'}`)
          .join(', ');
        console.log(`  [${timeStr}] Active: ${activeWorkers.size}/${MAX_WORKERS} [${workerList}]${disabled}`);
      }

    } catch (error: any) {
      console.error(`  [error]`, error.message);
    }

    await sleep(5000);
  }
}

async function main() {
  process.on('SIGINT', async () => {
    console.log('\n  Shutdown signal received...');

    for (const [, worker] of Array.from(activeWorkers)) {
      if (worker.status === 'spawning' || worker.status === 'running') {
        console.log(`  [shutdown] #${worker.bugId} rollback`);
        await releaseBug(worker.bugId);
      }
    }

    process.exit(0);
  });

  await spawningPool();
}

main().catch(console.error);
