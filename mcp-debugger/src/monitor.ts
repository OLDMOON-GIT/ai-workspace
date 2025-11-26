#!/usr/bin/env node
/**
 * Log Monitor
 * 서버 로그를 실시간 모니터링하여 에러를 큐에 추가
 */

import chokidar from 'chokidar';
import fs from 'fs';
import path from 'path';
import {
  addError,
  addLogSource,
  getLogSources,
  updateLogPosition
} from './db.js';

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
    console.log('🔍 Log Monitor 시작');

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

    console.log(`📡 ${sources.length}개 로그 파일 모니터링 중...`);
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
      await this.processFile(filePath, name, sourceId);
    });

    watcher.on('add', async () => {
      console.log(`📄 파일 감지: ${name}`);
      await this.processFile(filePath, name, sourceId);
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
