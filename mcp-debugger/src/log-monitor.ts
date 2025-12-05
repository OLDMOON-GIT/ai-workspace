#!/usr/bin/env node
/**
 * Log Monitor (BTS-3007 통합)
 * 1. 서버 로그 실시간 모니터링 → SQLite error_queue + MySQL bugs 등록
 * 2. MySQL bugs 테이블 상태 모니터링 (Bug Manager 기능 통합)
 * 3. stuck 버그/에러 자동 복구
 */

// BTS-3060: 작업 관리자에서 프로세스 식별 가능하도록 설정
process.title = 'LogMonitor';

import chokidar from 'chokidar';
import fs from 'fs';
import path from 'path';
import mysql from 'mysql2/promise';
import {
  addError,
  addLogSource,
  getLogSources,
  updateLogPosition,
  getErrorStats,
  recoverStuckProcessing
} from './db.js';
import { bugCreate } from './bug-bridge.js';

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'trend2024',
  database: process.env.DB_NAME || 'trend_video'
};

// 무시 패턴
const IGNORE_PATTERNS = [
  /GET\s+\/admin\/bts\s+500/i,
  /\(?딥링크 오류\)?.*이번 실행 스킵/i,
  /이번 실행 스킵/i,
  /상품 제목 생성 실패.*딥링크/i,
  /stopped by user/i,
  /Browser.*(?:closed|has been closed)/i,
  /User canceled/i,
  /file_missing.*\/story/i,
  /ENOENT/i,
  /no such file or directory/i,
  // BTS-3062: 성공 메시지가 "에러" 키워드 포함으로 잘못 감지되는 경우
  /이메일 전송 완료/i,
  // BTS-3140: story.json 파일 경로만 있는 에러 (파일 없음 에러는 시스템 버그 아님)
  /story\.json$/i,
  /tasks[\\\/][a-f0-9-]+[\\\/]story\.json/i,
];

// 에러 패턴
const ERROR_PATTERNS = [
  { pattern: /You have exhausted your capacity on this model.*Your quota will reset after\s*(\d+h(?:\d+m)?(?:\d+s)?)/i, type: 'gemini_quota_error', severity: 'critical' as const },
  { pattern: /(?:Error|TypeError|ReferenceError|SyntaxError):\s*(.+)/, type: 'runtime_error', severity: 'error' as const },
  { pattern: /Unhandled Runtime Error/, type: 'runtime_error', severity: 'critical' as const },
  { pattern: /(?:500|502|503|504)\s+(?:Internal Server Error|Bad Gateway|Service Unavailable|Gateway Timeout)/i, type: 'http_error', severity: 'error' as const },
  { pattern: /\b(?:GET|POST|PUT|PATCH|DELETE|OPTIONS)\s+[^\s]+\s+(?:500|502|503|504)\b/i, type: 'http_error', severity: 'error' as const },
  { pattern: /(?:SQLITE_ERROR|no such table|syntax error|SQL error):\s*(.+)/i, type: 'database_error', severity: 'critical' as const },
  { pattern: /\[(?:ERROR|error|ERR)\]\s*(.+)/, type: 'logged_error', severity: 'error' as const },
  { pattern: /(?:failed|Failed|FAILED)(?:\s+to|\s*:)\s*(.+)/, type: 'failure', severity: 'error' as const },
  { pattern: /(?:파싱 실패|처리 실패|파일 없음|추가 실패|실패|오류|에러)[\s:]+(.+)/, type: 'logged_error', severity: 'error' as const },
  { pattern: /(?:Traceback \(most recent call last\)|raise \w+Error)/, type: 'python_error', severity: 'error' as const }
];

const STACK_TRACE_PATTERN = /^\s+at\s+.+\(.+:\d+:\d+\)/;
const FILE_LINE_PATTERN = /(?:at\s+)?(.+):(\d+)(?::\d+)?/;

// Gemini 쿼터 리셋 시간 파싱 함수
function parseGeminiQuotaResetTime(resetTimeStr: string): string | null {
  // 예: "1h30m15s" -> ISO 형식으로 변환
  const match = resetTimeStr.match(/(\d+)h(?:(\d+)m)?(?:(\d+)s)?/);
  if (!match) return null;

  const hours = parseInt(match[1] || '0', 10);
  const minutes = parseInt(match[2] || '0', 10);
  const seconds = parseInt(match[3] || '0', 10);

  const resetDate = new Date();
  resetDate.setHours(resetDate.getHours() + hours);
  resetDate.setMinutes(resetDate.getMinutes() + minutes);
  resetDate.setSeconds(resetDate.getSeconds() + seconds);

  return resetDate.toISOString();
}

// MySQL 버그 상태 조회
async function getBugStats(): Promise<{ open: number; inProgress: number }> {
  let connection;
  try {
    connection = await mysql.createConnection(dbConfig);
    const [rows] = await connection.execute(`
      SELECT
        SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) as open,
        SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) as inProgress
      FROM bugs
      WHERE status IN ('open', 'in_progress')
    `);
    const r = (rows as any)[0];
    return { open: r.open || 0, inProgress: r.inProgress || 0 };
  } finally {
    if (connection) await connection.end();
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
    if (connection) await connection.end();
  }
}

class LogMonitor {
  private watchers: Map<string, chokidar.FSWatcher> = new Map();
  private filePositions: Map<string, number> = new Map();
  private running: boolean = false;
  private errorBuffer: Map<string, { lines: string[]; timestamp: Date }> = new Map();
  private watchedTaskLogs: Set<string> = new Set();
  private lastBugStats = { open: -1, inProgress: -1 };

  async start() {
    this.running = true;
    console.log('');
    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║           📡 Log Monitor (BTS-3007 통합)                     ║');
    console.log('║           로그 감시 + 버그 관리 통합                         ║');
    console.log('╚══════════════════════════════════════════════════════════════╝');
    console.log('');

    // 시작 시 stuck 복구
    const sqliteRecovered = recoverStuckProcessing(30);
    if (sqliteRecovered > 0) {
      console.log(`  [시작] SQLite: ${sqliteRecovered}개 멈춘 에러 복구`);
    }
    const mysqlRecovered = await recoverStuckBugs(30);
    if (mysqlRecovered > 0) {
      console.log(`  [시작] MySQL: ${mysqlRecovered}개 멈춘 버그 복구`);
    }

    const sources = getLogSources();
    if (sources.length === 0) {
      console.log('  등록된 로그 소스가 없습니다.');
      console.log('  사용법: npm run log-monitor -- --add <path> --name <name>');
      return;
    }

    for (const source of sources) {
      this.filePositions.set(source.path, source.last_position);
      await this.watchFile(source.path, source.name, source.id);
    }

    const stats = getErrorStats();
    const bugStats = await getBugStats();
    console.log('');
    console.log(`  ${sources.length}개 로그 파일 모니터링`);
    console.log(`  SQLite: 대기 ${stats.pending}개 | 처리중 ${stats.processing}개`);
    console.log(`  MySQL:  open ${bugStats.open}개 | in_progress ${bugStats.inProgress}개`);
    console.log('');
    console.log('────────────────────────────────────────────────────────────────');
    console.log('  Ctrl+C로 종료');
    console.log('────────────────────────────────────────────────────────────────');

    // tasks 폴더 스캔 (5초마다)
    const tasksDir = path.resolve(process.cwd(), '..', 'trend-video-backend', 'tasks');
    this.scanTasksFolder(tasksDir);
    setInterval(() => this.scanTasksFolder(tasksDir), 5000);

    // 상태 모니터링 (10초마다)
    setInterval(async () => {
      // stuck 복구 (5분마다 실행되도록 카운터 사용)
      recoverStuckProcessing(30);
      await recoverStuckBugs(30);

      // 상태 출력
      const stats = getErrorStats();
      const bugStats = await getBugStats();
      const timeStr = new Date().toLocaleTimeString('ko-KR');

      // 변경 시에만 출력
      if (bugStats.open !== this.lastBugStats.open || bugStats.inProgress !== this.lastBugStats.inProgress) {
        console.log(`  [${timeStr}] MySQL: open ${bugStats.open} | in_progress ${bugStats.inProgress} | SQLite: pending ${stats.pending}`);
        this.lastBugStats = bugStats;
      }
    }, 10000);

    // 1분마다 상태 유지 로그
    setInterval(async () => {
      const stats = getErrorStats();
      const bugStats = await getBugStats();
      const timeStr = new Date().toLocaleTimeString('ko-KR');
      console.log(`  [${timeStr}] (상태) MySQL: open ${bugStats.open} | in_progress ${bugStats.inProgress} | SQLite: pending ${stats.pending}`);
    }, 60000);
  }

  private scanTasksFolder(tasksDir: string) {
    if (!fs.existsSync(tasksDir)) return;

    try {
      const oneHourAgo = Date.now() - 60 * 60 * 1000;
      const taskFolders = fs.readdirSync(tasksDir, { withFileTypes: true })
        .filter(d => d.isDirectory())
        .map(d => d.name);

      const recentFolders: string[] = [];
      for (const name of taskFolders) {
        const taskDir = path.join(tasksDir, name);
        const logFiles = ['script.log', 'image.log', 'video.log', 'youtube.log'];
        const allWatched = logFiles.every(lf => this.watchedTaskLogs.has(path.join(taskDir, lf)));
        if (allWatched) continue;

        try {
          const stat = fs.statSync(taskDir);
          if (stat.mtime.getTime() > oneHourAgo) {
            recentFolders.push(name);
          }
        } catch { }

        if (recentFolders.length >= 50) break;
      }

      for (const taskId of recentFolders) {
        const taskDir = path.join(tasksDir, taskId);
        const logFiles = ['script.log', 'image.log', 'video.log', 'youtube.log'];

        for (const logFile of logFiles) {
          const logPath = path.join(taskDir, logFile);
          if (!this.watchedTaskLogs.has(logPath) && fs.existsSync(logPath)) {
            this.watchedTaskLogs.add(logPath);
            // BTS-3015: 전체 경로 표시 (tasks/taskId/파일.log)
            this.watchTaskLog(logPath, `tasks/${taskId}/${logFile}`);
          }
        }
      }
    } catch { }
  }

  private watchTaskLog(logPath: string, name: string) {
    const watcher = chokidar.watch(logPath, {
      persistent: true,
      usePolling: true,
      interval: 2000
    });

    watcher.on('change', async () => {
      try {
        await this.processFile(logPath, name, -1);
      } catch { }
    });

    this.watchers.set(logPath, watcher);
  }

  async watchFile(filePath: string, name: string, sourceId: number) {
    if (!fs.existsSync(filePath)) {
      console.log(`  파일 없음 (대기): ${filePath}`);
    }

    const watcher = chokidar.watch(filePath, {
      persistent: true,
      usePolling: true,
      interval: 1000
    });

    watcher.on('change', async () => {
      try {
        await this.processFile(filePath, name, sourceId);
      } catch (error) {
        console.error(`  파일 처리 오류 (${name}):`, error);
      }
    });

    watcher.on('add', async () => {
      try {
        await this.processFile(filePath, name, sourceId);
      } catch (error) {
        console.error(`  파일 처리 오류 (${name}):`, error);
      }
    });

    this.watchers.set(filePath, watcher);
    console.log(`  모니터링: ${name}`);
  }

  async processFile(filePath: string, name: string, sourceId: number) {
    try {
      const stats = fs.statSync(filePath);
      const lastPosition = this.filePositions.get(filePath) || 0;

      if (stats.size < lastPosition) {
        this.filePositions.set(filePath, 0);
        return;
      }

      if (stats.size === lastPosition) {
        return;
      }

      const fd = fs.openSync(filePath, 'r');
      const buffer = Buffer.alloc(stats.size - lastPosition);
      fs.readSync(fd, buffer, 0, buffer.length, lastPosition);
      fs.closeSync(fd);

      const newContent = buffer.toString('utf-8');
      const lines = newContent.split('\n').filter(line => line.trim());

      for (const line of lines) {
        await this.analyzeLine(line, name, filePath);
      }

      this.filePositions.set(filePath, stats.size);
      updateLogPosition(sourceId, stats.size);

    } catch (error: any) {
      console.error(`  파일 처리 오류 (${name}):`, error.message);
    }
  }

  async analyzeLine(line: string, source: string, filePath: string) {
    if (STACK_TRACE_PATTERN.test(line)) {
      this.appendToBuffer(source, line);
      return;
    }

    for (const pattern of IGNORE_PATTERNS) {
      if (pattern.test(line)) {
        return;
      }
    }

    for (const { pattern, type, severity } of ERROR_PATTERNS) {
      const match = line.match(pattern);
      if (match) {
        const buffered = this.flushBuffer(source);
        const stackTrace = buffered.length > 0 ? buffered.join('\n') : undefined;

        let errorFilePath: string | undefined;
        let lineNumber: number | undefined;

        const fileMatch = line.match(FILE_LINE_PATTERN);
        if (fileMatch) {
          errorFilePath = fileMatch[1];
          lineNumber = parseInt(fileMatch[2], 10);
        }

        let errorMessage = line; // Default to full line

        // For most patterns, match[1] is the error message.
        // For gemini_quota_error, match[0] is the full line, match[1] is the time.
        if (type !== 'gemini_quota_error' && match[1]) {
          errorMessage = match[1];
        }
        let resetTime: string | null = null; // Declare outside for loop

        if (type === 'gemini_quota_error') {
          const resetTimeStr = match[1];
          if (resetTimeStr) {
            resetTime = parseGeminiQuotaResetTime(resetTimeStr);
          }
        }

        const added = addError({
          error_type: type,
          error_message: errorMessage.substring(0, 500),
          stack_trace: stackTrace?.substring(0, 2000),
          file_path: errorFilePath,
          line_number: lineNumber,
          source: source,
          severity: severity
        });

        if (added) {
          console.log(`  [에러] [${type}] ${errorMessage.substring(0, 60)}...`);

          const metadata: any = {
            error_id: added.id,
            source: source,
            severity: severity,
            stack_trace: stackTrace?.substring(0, 2000),
            line_number: lineNumber
          };

          if (resetTime) {
            metadata.gemini_quota_reset_time = resetTime;
          }

          bugCreate({
            title: `[${type}] ${errorMessage.substring(0, 100)}`,
            summary: errorMessage.substring(0, 500),
            logPath: errorFilePath,
            metadata: metadata
          }).catch(err => {
            console.error('  Bug 생성 실패:', err.message);
          });
        }

        return;
      }
    }
  }

  appendToBuffer(source: string, line: string) {
    const existing = this.errorBuffer.get(source);
    if (existing) {
      existing.lines.push(line);
      if (existing.lines.length > 20) {
        existing.lines.shift();
      }
    } else {
      this.errorBuffer.set(source, { lines: [line], timestamp: new Date() });
    }
  }

  flushBuffer(source: string): string[] {
    const buffered = this.errorBuffer.get(source);
    if (buffered) {
      const lines = buffered.lines;
      this.errorBuffer.delete(source);
      return lines;
    }
    return [];
  }

  stop() {
    this.running = false;
    for (const [, watcher] of this.watchers) {
      watcher.close();
    }
    this.watchers.clear();
    console.log('  모니터링 중지됨');
  }
}

// CLI
async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--add')) {
    const pathIndex = args.indexOf('--add') + 1;
    const nameIndex = args.indexOf('--name') + 1;
    if (!args[pathIndex]) {
      console.error('  경로를 지정해주세요: --add <path>');
      process.exit(1);
    }
    const logPath = path.resolve(args[pathIndex]);
    const name = args[nameIndex] || path.basename(logPath);
    addLogSource(name, logPath);
    console.log(`  로그 소스 추가됨: ${name} (${logPath})`);
    return;
  }

  if (args.includes('--list')) {
    const sources = getLogSources();
    console.log('\n  등록된 로그 소스:');
    for (const source of sources) {
      const exists = fs.existsSync(source.path) ? 'O' : 'X';
      console.log(`  [${exists}] ${source.name}: ${source.path}`);
    }
    return;
  }

  const monitor = new LogMonitor();

  process.on('SIGINT', () => {
    console.log('\n  종료 신호 수신...');
    monitor.stop();
    process.exit(0);
  });

  await monitor.start();
}

main().catch(console.error);
