#!/usr/bin/env node
/**
 * Log Monitor
 * 서버 로그를 실시간 모니터링하여 에러를 큐에 추가
 */

import chokidar from 'chokidar';
import fs from 'fs';
import path from 'path';
import { spawn, ChildProcess } from 'child_process';
import {
  addError,
  addLogSource,
  getLogSources,
  updateLogPosition,
  getActiveWorkers,
  getErrorStats,
  getPendingErrors,
  claimError,
  updateErrorStatus
} from './db.js';
import { bugCreate } from './bug-bridge.js';

// 워커 풀 관리
const MAX_WORKERS = 10;
const SPAWN_DELAY_MS = 5000;
const WORKER_COMMANDS: { name: string; cmd: string; args: string[]; limit: number }[] = [
  { name: 'claude-1', cmd: 'claude', args: ['--dangerously-skip-permissions', 'auto-worker'], limit: 1 },
  { name: 'claude-2', cmd: 'claude', args: ['--dangerously-skip-permissions', 'auto-worker'], limit: 1 },
  { name: 'codex', cmd: 'codex', args: ['-a', 'never', '-s', 'danger-full-access'], limit: 1 },
  { name: 'gemini', cmd: 'gemini', args: ['--yolo'], limit: 1 },
];
const workerProcesses: Map<string, ChildProcess> = new Map();
const workerMeta: Map<string, string> = new Map(); // workerId -> command name
let workerIdCounter = 0;

function spawnWorker(): string {
  const workerId = `auto-worker-${++workerIdCounter}`;

  // 에러 정보 가져오기
  const error = claimError(workerId);
  if (!error) return workerId;

  // 상태 선반영 (processing)
  updateErrorStatus(error.id, 'processing', workerId);

  // 상세 에러 정보 출력
  console.log('');
  console.log('  ┌─────────────────────────────────────────────────────────────');
  console.log(`  │ 🚨 에러 #${error.id} [${error.error_type}]`);
  console.log(`  │ 📝 ${error.error_message.substring(0, 80)}`);
  if (error.file_path) {
    console.log(`  │ 📁 ${error.file_path}${error.line_number ? ':' + error.line_number : ''}`);
  }
  if (error.stack_trace) {
    const firstLine = error.stack_trace.split('\n')[0];
    console.log(`  │ 📚 ${firstLine.substring(0, 60)}`);
  }
  console.log(`  │ 💡 수정 필요: ${error.source}에서 발생`);
  console.log('  └─────────────────────────────────────────────────────────────');
  console.log('');

  const activeCounts: Record<string, number> = {};
  for (const name of workerMeta.values()) {
    activeCounts[name] = (activeCounts[name] || 0) + 1;
  }
  const workerCfg = WORKER_COMMANDS.find(cfg => (activeCounts[cfg.name] || 0) < cfg.limit);
  if (!workerCfg) {
    console.log('  [!] 워커 한도 도달 - 추가 스폰 스킵');
    return workerId;
  }

  // ??: ?? ?? ??? ?? ??? ????? ?? ??
  workerMeta.set(workerId, workerCfg.name);

  
  setTimeout(() => {
    const btsId = error.bug_id ? error.bug_id : `BTS-${error.id}`;
    const msg = `${btsId} ${error.error_message || ''}`.replace(/"/g, "'").replace(/\s+/g, ' ').trim();
    const finalArgs = [...workerCfg.args, msg];
    const quotedArgs = finalArgs.map(a => (/\s/.test(a) ? `"${a}"` : a)).join(' ');
    const commandLine = `${workerCfg.cmd} ${quotedArgs}`.trim();

    const proc = spawn('powershell.exe', ['-NoLogo', '-NoExit', '-Command', commandLine], {
      cwd: process.cwd(),
      stdio: 'ignore',
      windowsHide: false,
      shell: false
    });

    proc.on('close', () => {
      workerProcesses.delete(workerId);
      workerMeta.delete(workerId);
    });
    proc.on('error', (err) => {
      console.error(`  [!] ?? ?? ??: ${workerId} (${workerCfg.name})`, err);
      workerProcesses.delete(workerId);
      workerMeta.delete(workerId);
    });

    workerProcesses.set(workerId, proc);
    console.log(`  [+] ?? ??: ${workerId} (${workerCfg.name}) - cmd: ${commandLine}`);
  }, SPAWN_DELAY_MS);


  return workerId;
}

function killWorker(workerId: string) {
  const proc = workerProcesses.get(workerId);
  if (proc) {
    proc.kill();
    workerProcesses.delete(workerId);
  }
}

function scaleWorkers() {
  const stats = getErrorStats();
  const pending = stats.pending;
  const currentWorkers = workerProcesses.size;

  // 필요한 워커 수 계산 (에러 1개당 워커 1개, 최대 20개)
  const needed = Math.min(pending, MAX_WORKERS);

  if (needed > currentWorkers) {
    // 워커 추가
    const toAdd = needed - currentWorkers;
    for (let i = 0; i < toAdd; i++) {
      const id = spawnWorker();
      console.log(`  [+] 워커 추가: ${id} (대기 에러: ${pending}개)`);
    }
  } else if (needed < currentWorkers && pending === 0) {
    // 에러가 없으면 워커 축소
    const toRemove = currentWorkers - needed;
    const workerIds = Array.from(workerProcesses.keys());
    for (let i = 0; i < toRemove; i++) {
      const id = workerIds[i];
      killWorker(id);
      console.log(`  [-] 워커 제거: ${id}`);
    }
  }
}

// 무시 패턴 (정상적인 동작이나 예상된 메시지)
const IGNORE_PATTERNS = [
  /GET\s+\/admin\/bts\s+500/i,             // BTS-1490: GET /admin/bts 500 에러는 무시
  /\(?딥링크 오류\)?.*이번 실행 스킵/i, // 딥링크 생성 실패 시 스킵 (정상 동작)
  /이번 실행 스킵/i,                     // 실행 스킵은 정상 동작
  /상품 제목 생성 실패.*딥링크/i,       // 상품 카테고리 스킵 (정상 동작)
  /stopped by user/i,                    // 사용자 중지
  /Browser or page has been closed/i,   // 브라우저 닫힘
  /User canceled/i,                      // 사용자 취소
  /file_missing.*\/story/i,             // story 파일 아직 생성 안됨
];

// 에러 패턴 정의
const ERROR_PATTERNS = [
  // JavaScript/TypeScript 에러
  {
    pattern: /(?:Error|TypeError|ReferenceError|SyntaxError):\s*(.+)/,
    type: 'runtime_error',
    severity: 'error' as const
  },
  // Next.js / React 에러
  {
    pattern: /Unhandled Runtime Error/,
    type: 'runtime_error',
    severity: 'critical' as const
  },
  // API 에러
  {
    pattern: /(?:500|502|503|504)\s+(?:Internal Server Error|Bad Gateway|Service Unavailable|Gateway Timeout)/i,
    type: 'http_error',
    severity: 'error' as const
  },
  {
    pattern: /\b(?:GET|POST|PUT|PATCH|DELETE|OPTIONS)\s+[^\s]+\s+(?:500|502|503|504)\b/i,
    type: 'http_error',
    severity: 'error' as const
  },
  {
    pattern: /\b(?:GET|POST|PUT|PATCH|DELETE|OPTIONS)\s+([^\s]+story[^\s]*)\s+404\b/i,
    type: 'file_missing',
    severity: 'warning' as const
  },
  // SQL 에러
  {
    pattern: /(?:SQLITE_ERROR|no such table|syntax error|SQL error):\s*(.+)/i,
    type: 'database_error',
    severity: 'critical' as const
  },
  // 일반 에러 로그
  {
    pattern: /\[(?:ERROR|error|ERR)\]\s*(.+)/,
    type: 'logged_error',
    severity: 'error' as const
  },
  // 경고
  {
    pattern: /\[(?:WARN|warning|WARNING)\]\s*(.+)/,
    type: 'warning',
    severity: 'warning' as const
  },
  // 실패 메시지
  {
    pattern: /(?:failed|Failed|FAILED)(?:\s+to|\s*:)\s*(.+)/,
    type: 'failure',
    severity: 'error' as const
  },
  {
    pattern: /(?:파싱 실패|처리 실패|파일 없음|실패|오류|에러)[:\s-]+\s*(.+)/,
    type: 'logged_error',
    severity: 'error' as const
  },
  {
    pattern: /JSON5?:\s*(invalid|unexpected|Unexpected)[^\n]+/i,
    type: 'runtime_error',
    severity: 'error' as const
  },
  // Python 에러
  {
    pattern: /(?:Traceback \(most recent call last\)|raise \w+Error)/,
    type: 'python_error',
    severity: 'error' as const
  }
];

// 스택 트레이스 패턴
const STACK_TRACE_PATTERN = /^\s+at\s+.+\(.+:\d+:\d+\)/;
const FILE_LINE_PATTERN = /(?:at\s+)?(.+):(\d+)(?::\d+)?/;

class LogMonitor {
  private watchers: Map<string, chokidar.FSWatcher> = new Map();
  private filePositions: Map<string, number> = new Map();
  private running: boolean = false;
  private errorBuffer: Map<string, { lines: string[]; timestamp: Date }> = new Map();

  async start() {
    this.running = true;
    console.log('');
    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║              🔍 MCP Debugger - Log Monitor                   ║');
    console.log('╚══════════════════════════════════════════════════════════════╝');
    console.log('');

    // 기존 로그 소스 로드
    const sources = getLogSources();

    if (sources.length === 0) {
      console.log('⚠️  등록된 로그 소스가 없습니다.');
      console.log('   사용법: npm run monitor -- --add <path> --name <name>');
      return;
    }

    for (const source of sources) {
      this.filePositions.set(source.path, source.last_position);
      await this.watchFile(source.path, source.name, source.id);
    }

    // 현재 상태 표시
    const stats = getErrorStats();

    console.log('');
    console.log(`📡 ${sources.length}개 로그 파일 모니터링 중...`);
    console.log('');
    console.log('📊 현재 상태:');
    console.log(`   대기 에러: ${stats.pending}개`);
    console.log(`   처리 중: ${stats.processing}개`);
    console.log(`   해결됨: ${stats.resolved}개`);
    console.log(`   워커 자동 스케일링: 최대 ${MAX_WORKERS}개`);
    console.log(`   (에러 수에 따라 워커 자동 생성/삭제)`)
    console.log('');
    console.log('────────────────────────────────────────────────────────────────');
    console.log('  에러 발생 시 자동으로 큐에 추가됩니다. (Ctrl+C 종료)');
    console.log('────────────────────────────────────────────────────────────────');

    // 초기 워커 스케일링
    scaleWorkers();

    // 10초마다 워커 스케일링 + 상태 출력
    setInterval(() => {
      scaleWorkers();
      const now = new Date().toLocaleTimeString('ko-KR');
      const stats = getErrorStats();
      console.log(`  [${now}] 대기: ${stats.pending}개 | 처리중: ${stats.processing}개 | 워커: ${workerProcesses.size}/${MAX_WORKERS}`);
    }, 10000);
  }

  async watchFile(filePath: string, name: string, sourceId: number) {
    if (!fs.existsSync(filePath)) {
      console.log(`⚠️  파일 없음 (대기 중): ${filePath}`);
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
        console.error(`[Monitor] Unhandled error processing file ${filePath}:`, error);
      }
    });

    watcher.on('add', async () => {
      try {
        console.log(`📄 파일 감지: ${name}`);
        await this.processFile(filePath, name, sourceId);
      } catch (error) {
        console.error(`[Monitor] Unhandled error processing new file ${filePath}:`, error);
      }
    });

    this.watchers.set(filePath, watcher);
    console.log(`👁️  모니터링: ${name} (${filePath})`);
  }

  async processFile(filePath: string, name: string, sourceId: number) {
    try {
      const stats = fs.statSync(filePath);
      const lastPosition = this.filePositions.get(filePath) || 0;

      if (stats.size < lastPosition) {
        // 파일이 truncate된 경우
        this.filePositions.set(filePath, 0);
        return;
      }

      if (stats.size === lastPosition) {
        return; // 변경 없음
      }

      // 새로운 내용만 읽기
      const fd = fs.openSync(filePath, 'r');
      const buffer = Buffer.alloc(stats.size - lastPosition);
      fs.readSync(fd, buffer, 0, buffer.length, lastPosition);
      fs.closeSync(fd);

      const newContent = buffer.toString('utf-8');
      const lines = newContent.split('\n').filter(line => line.trim());

      for (const line of lines) {
        await this.analyzeLine(line, name, filePath);
      }

      // 위치 업데이트
      this.filePositions.set(filePath, stats.size);
      updateLogPosition(sourceId, stats.size);

    } catch (error: any) {
      console.error(`❌ 파일 처리 오류 (${name}):`, error.message);
    }
  }

  async analyzeLine(line: string, source: string, filePath: string) {
    // 스택 트레이스인지 확인
    if (STACK_TRACE_PATTERN.test(line)) {
      this.appendToBuffer(source, line);
      return;
    }

    // 무시 패턴 체크 (정상적인 동작이나 예상된 메시지는 건너뜀)
    for (const pattern of IGNORE_PATTERNS) {
      if (pattern.test(line)) {
        return; // 무시 패턴에 매칭되면 에러로 처리하지 않음
      }
    }

    // 에러 패턴 매칭
    for (const { pattern, type, severity } of ERROR_PATTERNS) {
      const match = line.match(pattern);
      if (match) {
        // 이전 버퍼 내용 가져오기 (스택 트레이스)
        const buffered = this.flushBuffer(source);
        const stackTrace = buffered.length > 0 ? buffered.join('\n') : undefined;

        // 파일 경로/라인 추출
        let errorFilePath: string | undefined;
        let lineNumber: number | undefined;

        const fileMatch = line.match(FILE_LINE_PATTERN);
        if (fileMatch) {
          errorFilePath = fileMatch[1];
          lineNumber = parseInt(fileMatch[2], 10);
        }

        const errorMessage = match[1] || line;

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
          console.log(`🚨 에러 감지: [${type}] ${errorMessage.substring(0, 80)}...`);

          // MySQL bugs 테이블에도 자동 등록
          bugCreate({
            title: `[${type}] ${errorMessage.substring(0, 100)}`,
            summary: errorMessage.substring(0, 500),
            logPath: errorFilePath,
            metadata: {
              error_id: added.id,
              source: source,
              severity: severity,
              stack_trace: stackTrace?.substring(0, 2000),
              line_number: lineNumber
            }
          }).catch(err => {
            console.error('❌ Bug 생성 실패:', err.message);
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
      // 버퍼 크기 제한
      if (existing.lines.length > 20) {
        existing.lines.shift();
      }
    } else {
      this.errorBuffer.set(source, {
        lines: [line],
        timestamp: new Date()
      });
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
    for (const [path, watcher] of this.watchers) {
      watcher.close();
      console.log(`👋 모니터링 중지: ${path}`);
    }
    this.watchers.clear();
  }
}

// CLI 실행
async function main() {
  const args = process.argv.slice(2);

  // 로그 소스 추가
  if (args.includes('--add')) {
    const pathIndex = args.indexOf('--add') + 1;
    const nameIndex = args.indexOf('--name') + 1;

    if (!args[pathIndex]) {
      console.error('❌ 경로를 지정해주세요: --add <path>');
      process.exit(1);
    }

    const logPath = path.resolve(args[pathIndex]);
    const name = args[nameIndex] || path.basename(logPath);

    addLogSource(name, logPath);
    console.log(`✅ 로그 소스 추가됨: ${name} (${logPath})`);
    return;
  }

  // 로그 소스 목록
  if (args.includes('--list')) {
    const sources = getLogSources();
    console.log('\n📋 등록된 로그 소스:');
    for (const source of sources) {
      const exists = fs.existsSync(source.path) ? '✅' : '❌';
      console.log(`  ${exists} ${source.name}: ${source.path}`);
    }
    return;
  }

  // 모니터링 시작
  const monitor = new LogMonitor();

  process.on('SIGINT', () => {
    console.log('\n📛 종료 신호 수신...');
    monitor.stop();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    console.log('\n📛 종료 신호 수신...');
    monitor.stop();
    process.exit(0);
  });

  await monitor.start();
}

main().catch(console.error);

export default LogMonitor;
