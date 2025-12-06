#!/usr/bin/env node
/**
 * Bug Manager (BTS-3007)
 * MySQL bugs 테이블 모니터링 및 상태 관리
 * - 10초마다 open 버그 확인 및 알림
 * - 버그 상태 추적 (open -> in_progress -> resolved)
 * - notification-worker.cjs 기능 통합
 */

import mysql from 'mysql2/promise';
import { getErrorStats, recoverStuckProcessing } from './db.js';

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'trend2024',
  database: process.env.DB_NAME || 'trend_video'
};

interface BugRecord {
  id: number;
  type: string;
  priority: string;
  title: string;
  summary: string;
  status: string;
  log_path: string | null;
  screenshot_path: string | null;
  assigned_to: string | null;
  created_at: Date;
  updated_at: Date;
}

async function getBugs(): Promise<BugRecord[]> {
  let connection;
  try {
    connection = await mysql.createConnection(dbConfig);
    const [rows] = await connection.execute(`
      SELECT id, type, priority, title, summary, status, log_path, screenshot_path,
             created_at, updated_at, assigned_to
      FROM bugs
      WHERE status != 'resolved' AND status != 'closed'
      ORDER BY
        CASE priority
          WHEN 'P0' THEN 0
          WHEN 'P1' THEN 1
          WHEN 'P2' THEN 2
          WHEN 'P3' THEN 3
          ELSE 4
        END,
        created_at ASC
      LIMIT 30
    `);
    return rows as BugRecord[];
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

async function getOpenBugCount(): Promise<number> {
  let connection;
  try {
    connection = await mysql.createConnection(dbConfig);
    const [rows] = await connection.execute(`
      SELECT COUNT(*) as count FROM bugs WHERE status = 'open'
    `);
    return (rows as any)[0].count;
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

async function getInProgressBugs(): Promise<BugRecord[]> {
  let connection;
  try {
    connection = await mysql.createConnection(dbConfig);
    const [rows] = await connection.execute(`
      SELECT id, type, priority, title, status, assigned_to, updated_at
      FROM bugs
      WHERE status = 'in_progress'
      ORDER BY updated_at ASC
    `);
    return rows as BugRecord[];
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

// 30분 이상 in_progress 상태인 버그를 open으로 복구
async function recoverStuckBugs(timeoutMinutes: number = 30): Promise<number> {
  let connection;
  try {
    connection = await mysql.createConnection(dbConfig);
    const [result] = await connection.execute(`
      UPDATE bugs
      SET status = 'open', assigned_to = NULL, updated_at = NOW()
      WHERE status = 'in_progress'
        AND updated_at < DATE_SUB(NOW(), INTERVAL ? MINUTE)
    `, [timeoutMinutes]);
    return (result as any).affectedRows;
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function bugManager() {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║           🐛 Bug Manager (BTS-3007)                          ║');
  console.log('║           MySQL bugs 테이블 모니터링                         ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log('  Ctrl+C로 종료');
  console.log('');
  console.log('────────────────────────────────────────────────────────────────');
  console.log('');

  let lastBugCount = -1;
  let lastInProgressCount = -1;

  // 시작 시 stuck 버그 복구
  const recovered = await recoverStuckBugs(30);
  if (recovered > 0) {
    console.log(`  [시작] ${recovered}개의 멈춘 버그 복구됨 (30분 초과)`);
  }

  // SQLite error_queue도 복구
  const sqliteRecovered = recoverStuckProcessing(30);
  if (sqliteRecovered > 0) {
    console.log(`  [시작] ${sqliteRecovered}개의 멈춘 에러 복구됨 (SQLite)`);
  }

  while (true) {
    try {
      const bugs = await getBugs();
      const openCount = bugs.filter(b => b.status === 'open').length;
      const inProgressBugs = bugs.filter(b => b.status === 'in_progress');
      const inProgressCount = inProgressBugs.length;

      // 5분마다 stuck 버그 체크
      const stuckRecovered = await recoverStuckBugs(30);
      if (stuckRecovered > 0) {
        console.log(`  [복구] ${stuckRecovered}개의 멈춘 버그를 open으로 복구`);
      }

      // 상태 변경 시 상세 출력
      if (openCount !== lastBugCount || inProgressCount !== lastInProgressCount) {
        const timeStr = new Date().toLocaleTimeString('ko-KR');
        console.log('');
        console.log(`  [${timeStr}] 버그 현황: open ${openCount}개 | in_progress ${inProgressCount}개`);
        console.log('  ─────────────────────────────────────────────────────────────');

        // Open 버그 상위 5개 표시
        const openBugs = bugs.filter(b => b.status === 'open').slice(0, 5);
        if (openBugs.length > 0) {
          console.log('  [Open]');
          openBugs.forEach(bug => {
            const priority = bug.priority || 'P2';
            const type = bug.type === 'spec' ? 'SPEC' : 'BUG';
            console.log(`    [${priority}] #${bug.id} [${type}] ${bug.title.substring(0, 50)}`);
          });
        }

        // In-progress 버그 표시
        if (inProgressBugs.length > 0) {
          console.log('  [In Progress]');
          inProgressBugs.forEach(bug => {
            const worker = bug.assigned_to || '(미할당)';
            console.log(`    #${bug.id} -> ${worker}`);
          });
        }

        if (openCount === 0 && inProgressCount === 0) {
          console.log('  모든 버그 처리 완료!');
        }

        lastBugCount = openCount;
        lastInProgressCount = inProgressCount;
      } else {
        // 변경 없으면 조용히 대기 (1분마다 상태 출력)
        const now = Date.now();
        if (now % 60000 < 10000) {
          const timeStr = new Date().toLocaleTimeString('ko-KR');
          process.stdout.write(`\r  [${timeStr}] 모니터링 중... (open: ${openCount}, in_progress: ${inProgressCount})    `);
        }
      }

    } catch (error: any) {
      console.error(`  [오류] DB 조회 실패:`, error.message);
    }

    await sleep(10000);
  }
}

// CLI 실행
async function main() {
  process.on('SIGINT', () => {
    console.log('\n  종료 신호 수신...');
    process.exit(0);
  });

  await bugManager();
}

main().catch(console.error);
