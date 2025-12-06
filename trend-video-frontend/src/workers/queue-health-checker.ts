#!/usr/bin/env npx ts-node
/**
 * Queue Health Checker Worker
 * task_queue와 tasks 폴더 상태 비교하여 불일치 자동 수정
 */

import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';

const DB_PATH = path.join(process.cwd(), 'data', 'database.sqlite');
const TASKS_PATH = path.join(process.cwd(), '..', 'trend-video-backend', 'tasks');

// 좀비 판정 기준 (밀리초)
const ZOMBIE_THRESHOLD_MS = 60 * 60 * 1000; // 1시간

// 로컬 시간 헬퍼
function getLocalDateTime(): string {
  const now = new Date();
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}

interface QueueTask {
  task_id: string;
  type: string;
  status: string;
  started_at: string | null;
  created_at: string;
  error: string | null;
}

interface HealthCheckResult {
  task_id: string;
  queue_status: string;
  actual_status: string;
  reason: string;
  fixed: boolean;
}

class QueueHealthChecker {
  private db: Database.Database;
  private results: HealthCheckResult[] = [];

  constructor() {
    this.db = new Database(DB_PATH);
  }

  /**
   * 모든 처리 중/대기 중 작업 검사
   */
  async checkAll(): Promise<HealthCheckResult[]> {
    this.results = [];

    // processing, waiting 상태 작업 조회
    const tasks = this.db.prepare(`
      SELECT task_id, type, status, started_at, created_at, error
      FROM task_queue
      WHERE status IN ('processing', 'waiting')
    `).all() as QueueTask[];

    console.log(`\n🔍 검사 대상: ${tasks.length}개 작업\n`);

    for (const task of tasks) {
      await this.checkTask(task);
    }

    return this.results;
  }

  /**
   * 개별 작업 검사
   */
  private async checkTask(task: QueueTask): Promise<void> {
    const taskPath = path.join(TASKS_PATH, task.task_id);

    // 폴더 존재 확인
    if (!fs.existsSync(taskPath)) {
      this.recordResult(task, 'failed', '작업 폴더 없음', true);
      return;
    }

    // 1. final.mp4 확인 (완료 판정)
    if (this.hasCompleted(taskPath, task.type)) {
      this.recordResult(task, 'completed', 'final.mp4/완료 파일 존재', true);
      return;
    }

    // 2. 에러 로그 확인 (실패 판정)
    const errorReason = this.checkErrorLogs(taskPath, task.type);
    if (errorReason) {
      this.recordResult(task, 'failed', errorReason, true);
      return;
    }

    // 3. 좀비 processing 확인 → timeout 상태로 마킹
    if (task.status === 'processing' && this.isZombie(task)) {
      this.recordResult(task, 'timeout', `타임아웃 (1시간+ 처리중, 응답 없음)`, true);
      return;
    }

    // 정상
    console.log(`  ✅ ${task.task_id.substring(0, 8)}... (${task.type}|${task.status}) - 정상`);
  }

  /**
   * 완료 파일 존재 확인
   */
  private hasCompleted(taskPath: string, type: string): boolean {
    const completionIndicators = [
      'final.mp4',
      'final_shorts.mp4',
      'output.mp4',
    ];

    for (const indicator of completionIndicators) {
      if (fs.existsSync(path.join(taskPath, indicator))) {
        return true;
      }
    }

    // video 타입: generated_videos 폴더에 scene*.mp4가 있고 병합만 남은 경우는 완료 아님
    return false;
  }

  /**
   * 에러 로그 확인
   */
  private checkErrorLogs(taskPath: string, type: string): string | null {
    const logFiles = ['video.log', 'script.log', 'image_crawl.log'];
    const errorPatterns = [
      /❌\s*오류\s*발생/,
      /❌\s*실패/,
      /Python 프로세스가 코드 1로 종료/,
      /Error:/i,
      /Exception:/i,
      /✗\s*실패!/,
    ];

    for (const logFile of logFiles) {
      const logPath = path.join(taskPath, logFile);
      if (!fs.existsSync(logPath)) continue;

      try {
        const content = fs.readFileSync(logPath, 'utf-8');
        // 마지막 50줄만 확인
        const lines = content.split('\n').slice(-50);

        for (const line of lines) {
          for (const pattern of errorPatterns) {
            if (pattern.test(line)) {
              return `${logFile}: ${line.substring(0, 100)}`;
            }
          }
        }
      } catch (e) {
        // 읽기 실패 무시
      }
    }

    return null;
  }

  /**
   * 좀비 상태 확인
   */
  private isZombie(task: QueueTask): boolean {
    if (!task.started_at) return false;

    const startedAt = new Date(task.started_at).getTime();
    const now = Date.now();
    return (now - startedAt) > ZOMBIE_THRESHOLD_MS;
  }

  /**
   * 결과 기록 및 DB 업데이트
   */
  private recordResult(task: QueueTask, actualStatus: string, reason: string, fix: boolean): void {
    const result: HealthCheckResult = {
      task_id: task.task_id,
      queue_status: task.status,
      actual_status: actualStatus,
      reason: reason,
      fixed: false,
    };

    if (fix && task.status !== actualStatus) {
      // DB 업데이트
      const stmt = this.db.prepare(`
        UPDATE task_queue
        SET status = ?, completed_at = ?, error = ?
        WHERE task_id = ?
      `);

      stmt.run(
        actualStatus,
        getLocalDateTime(),
        actualStatus === 'failed' ? reason : null,
        task.task_id
      );

      result.fixed = true;
      console.log(`  🔧 ${task.task_id.substring(0, 8)}... ${task.status} → ${actualStatus}`);
      console.log(`     사유: ${reason}`);
    }

    this.results.push(result);
  }

  /**
   * 리포트 출력
   */
  printReport(): void {
    const fixed = this.results.filter(r => r.fixed);
    const total = this.results.length;

    console.log('\n' + '═'.repeat(60));
    console.log('📊 Queue Health Check Report');
    console.log('═'.repeat(60));
    console.log(`  검사: ${total}개 | 수정: ${fixed.length}개`);

    if (fixed.length > 0) {
      console.log('\n수정된 작업:');
      for (const r of fixed) {
        console.log(`  • ${r.task_id.substring(0, 8)}... ${r.queue_status} → ${r.actual_status}`);
        console.log(`    ${r.reason}`);
      }
    }

    console.log('═'.repeat(60) + '\n');
  }

  close(): void {
    this.db.close();
  }
}

// 한 번 실행
async function runOnce() {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║           🏥 Queue Health Checker                            ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');

  const checker = new QueueHealthChecker();

  try {
    await checker.checkAll();
    checker.printReport();
  } finally {
    checker.close();
  }
}

// 주기적 실행 (watch 모드)
async function runWatch(intervalMinutes: number = 5) {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║           🏥 Queue Health Checker (Watch Mode)               ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log(`\n  ⏰ ${intervalMinutes}분 간격으로 검사 중...\n`);

  const check = async () => {
    const checker = new QueueHealthChecker();
    try {
      const results = await checker.checkAll();
      const fixed = results.filter(r => r.fixed);
      if (fixed.length > 0) {
        checker.printReport();
      } else {
        console.log(`[${new Date().toLocaleTimeString('ko-KR')}] ✅ 검사 완료 - 이상 없음`);
      }
    } finally {
      checker.close();
    }
  };

  // 초기 실행
  await check();

  // 주기적 실행
  setInterval(check, intervalMinutes * 60 * 1000);
}

// CLI로 실행 시
const args = process.argv.slice(2);
if (args.includes('--watch') || args.includes('-w')) {
  const intervalArg = args.find(a => a.startsWith('--interval='));
  const interval = intervalArg ? parseInt(intervalArg.split('=')[1]) : 5;
  runWatch(interval).catch(console.error);
} else {
  runOnce().catch(console.error);
}

export { QueueHealthChecker };
