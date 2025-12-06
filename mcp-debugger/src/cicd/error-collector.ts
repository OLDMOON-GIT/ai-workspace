#!/usr/bin/env node
/**
 * Error Collector (BTS-3189)
 * 런타임 에러 수집 및 자동 버그 등록
 *
 * 기능:
 * 1. Next.js/React 에러 로그 수집
 * 2. Node.js 프로세스 에러 수집
 * 3. 브라우저 에러 수집 (콘솔 연동)
 * 4. API 에러 응답 수집
 */

import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';
import * as https from 'https';
import { bugCreate } from '../bug-bridge.js';

interface CollectedError {
  id: string;
  type: 'runtime' | 'api' | 'browser' | 'unhandled';
  message: string;
  stack?: string;
  file?: string;
  line?: number;
  column?: number;
  url?: string;
  method?: string;
  statusCode?: number;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

interface CollectorConfig {
  projectPath: string;
  httpPort: number;
  enableHttpServer: boolean;
  deduplicationWindow: number; // ms
  minSeverity: 'error' | 'warning' | 'info';
  ignoredPatterns: RegExp[];
}

// 무시할 에러 패턴
const DEFAULT_IGNORED_PATTERNS = [
  /ERR_CANCELED/i,
  /AbortError/i,
  /ResizeObserver loop/i,
  /Loading chunk .+ failed/i,
  /Failed to fetch/i, // 네트워크 오류는 무시
  /NetworkError/i,
];

export class ErrorCollector {
  private config: CollectorConfig;
  private errors: Map<string, CollectedError> = new Map();
  private recentHashes: Set<string> = new Set();
  private server: http.Server | null = null;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(config: Partial<CollectorConfig> = {}) {
    this.config = {
      projectPath: config.projectPath || process.cwd(),
      httpPort: config.httpPort || 3999,
      enableHttpServer: config.enableHttpServer ?? true,
      deduplicationWindow: config.deduplicationWindow || 60000, // 1분
      minSeverity: config.minSeverity || 'error',
      ignoredPatterns: config.ignoredPatterns || DEFAULT_IGNORED_PATTERNS,
    };
  }

  /**
   * 수집기 시작
   */
  async start(): Promise<void> {
    console.log('');
    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║              🔴 Error Collector (BTS-3189)                   ║');
    console.log('╚══════════════════════════════════════════════════════════════╝');
    console.log('');

    // HTTP 서버 시작 (브라우저 에러 수신용)
    if (this.config.enableHttpServer) {
      await this.startHttpServer();
    }

    // 주기적 해시 정리
    this.cleanupInterval = setInterval(() => {
      this.recentHashes.clear();
    }, this.config.deduplicationWindow);

    // 프로세스 에러 핸들러
    this.setupProcessHandlers();

    console.log('  👁️  에러 수집 중...');
    console.log('  Ctrl+C로 종료');
    console.log('');
  }

  /**
   * 수집기 중지
   */
  async stop(): Promise<void> {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    if (this.server) {
      await new Promise<void>((resolve) => {
        this.server!.close(() => resolve());
      });
    }
  }

  /**
   * HTTP 서버 시작
   */
  private async startHttpServer(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => {
        // CORS 헤더
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

        if (req.method === 'OPTIONS') {
          res.writeHead(204);
          res.end();
          return;
        }

        if (req.method === 'POST' && req.url === '/error') {
          let body = '';
          req.on('data', chunk => body += chunk);
          req.on('end', async () => {
            try {
              const error = JSON.parse(body);
              await this.collect({
                type: error.type || 'browser',
                message: error.message,
                stack: error.stack,
                file: error.file || error.filename,
                line: error.line || error.lineno,
                column: error.column || error.colno,
                url: error.url,
                metadata: error.metadata,
              });
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: true }));
            } catch (e) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Invalid request' }));
            }
          });
        } else if (req.method === 'GET' && req.url === '/errors') {
          // 수집된 에러 목록 조회
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(Array.from(this.errors.values())));
        } else {
          res.writeHead(404);
          res.end();
        }
      });

      this.server.listen(this.config.httpPort, () => {
        console.log(`  🌐 HTTP 서버: http://localhost:${this.config.httpPort}`);
        console.log(`     POST /error - 에러 수신`);
        console.log(`     GET /errors - 에러 목록`);
        resolve();
      });

      this.server.on('error', reject);
    });
  }

  /**
   * 프로세스 에러 핸들러 설정
   */
  private setupProcessHandlers(): void {
    process.on('uncaughtException', async (error) => {
      await this.collect({
        type: 'unhandled',
        message: error.message,
        stack: error.stack,
      });
    });

    process.on('unhandledRejection', async (reason) => {
      const error = reason instanceof Error ? reason : new Error(String(reason));
      await this.collect({
        type: 'unhandled',
        message: error.message,
        stack: error.stack,
      });
    });
  }

  /**
   * 에러 수집
   */
  async collect(error: Partial<CollectedError>): Promise<boolean> {
    // 필수 필드 확인
    if (!error.message) return false;

    // 무시 패턴 체크
    for (const pattern of this.config.ignoredPatterns) {
      if (pattern.test(error.message)) {
        return false;
      }
    }

    // 중복 체크
    const hash = this.hashError(error.message, error.stack);
    if (this.recentHashes.has(hash)) {
      return false;
    }
    this.recentHashes.add(hash);

    // 에러 생성
    const collected: CollectedError = {
      id: this.generateId(),
      type: error.type || 'runtime',
      message: error.message,
      stack: error.stack,
      file: error.file,
      line: error.line,
      column: error.column,
      url: error.url,
      method: error.method,
      statusCode: error.statusCode,
      timestamp: new Date(),
      metadata: error.metadata,
    };

    this.errors.set(collected.id, collected);

    // 로그 출력
    console.log(`  🚨 [${collected.type}] ${collected.message.substring(0, 60)}`);

    // 버그 등록
    await this.registerError(collected);

    return true;
  }

  /**
   * API 에러 수집 (미들웨어용)
   */
  async collectApiError(req: {
    method?: string;
    url?: string;
    body?: unknown;
  }, res: {
    statusCode?: number;
  }, error: Error): Promise<void> {
    await this.collect({
      type: 'api',
      message: error.message,
      stack: error.stack,
      url: req.url,
      method: req.method,
      statusCode: res.statusCode || 500,
      metadata: {
        requestBody: typeof req.body === 'object' ? JSON.stringify(req.body).substring(0, 500) : undefined,
      },
    });
  }

  /**
   * 에러 해시 생성
   */
  private hashError(message: string, stack?: string): string {
    const key = message + (stack?.split('\n')[0] || '');
    return key.replace(/\s+/g, '').substring(0, 100);
  }

  /**
   * ID 생성
   */
  private generateId(): string {
    return `err_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  }

  /**
   * 버그 등록
   */
  private async registerError(error: CollectedError): Promise<void> {
    try {
      // 파일 정보 추출
      let file = error.file;
      let line = error.line;

      if (!file && error.stack) {
        const stackMatch = error.stack.match(/at\s+.+\((.+):(\d+):(\d+)\)/);
        if (stackMatch) {
          file = stackMatch[1];
          line = parseInt(stackMatch[2], 10);
        }
      }

      const result = await bugCreate({
        type: 'bug',
        title: `[${error.type.toUpperCase()}] ${error.message.substring(0, 80)}`,
        summary: [
          `타입: ${error.type}`,
          error.url ? `URL: ${error.url}` : '',
          error.method ? `메소드: ${error.method}` : '',
          error.statusCode ? `상태 코드: ${error.statusCode}` : '',
          file ? `파일: ${file}` : '',
          line ? `라인: ${line}` : '',
          '',
          '에러 메시지:',
          error.message,
          '',
          error.stack ? `스택:\n${error.stack.substring(0, 800)}` : '',
        ].filter(Boolean).join('\n'),
        priority: error.type === 'unhandled' ? 'P1' : 'P2',
        metadata: {
          source: 'error-collector',
          errorType: error.type,
          errorId: error.id,
          file,
          line,
          column: error.column,
          url: error.url,
          method: error.method,
          statusCode: error.statusCode,
        },
      });

      if (result?.id) {
        console.log(`    📝 등록됨: BTS-${result.id}`);
      }
    } catch (err) {
      console.error('    ❌ 버그 등록 실패:', err);
    }
  }

  /**
   * 수집된 에러 목록
   */
  getErrors(): CollectedError[] {
    return Array.from(this.errors.values());
  }

  /**
   * 에러 클리어
   */
  clearErrors(): void {
    this.errors.clear();
    this.recentHashes.clear();
  }

  /**
   * 브라우저 스크립트 생성 (클라이언트 에러 수집용)
   */
  generateClientScript(): string {
    return `
(function() {
  var endpoint = 'http://localhost:${this.config.httpPort}/error';

  function sendError(error) {
    try {
      var xhr = new XMLHttpRequest();
      xhr.open('POST', endpoint, true);
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.send(JSON.stringify(error));
    } catch (e) {
      console.error('Error reporting failed:', e);
    }
  }

  // 전역 에러 핸들러
  window.onerror = function(message, source, lineno, colno, error) {
    sendError({
      type: 'browser',
      message: message,
      stack: error ? error.stack : null,
      file: source,
      line: lineno,
      column: colno,
      url: window.location.href
    });
    return false;
  };

  // Promise rejection 핸들러
  window.onunhandledrejection = function(event) {
    var error = event.reason;
    sendError({
      type: 'browser',
      message: error && error.message ? error.message : String(error),
      stack: error && error.stack ? error.stack : null,
      url: window.location.href
    });
  };

  // console.error 오버라이드
  var originalError = console.error;
  console.error = function() {
    var args = Array.prototype.slice.call(arguments);
    var message = args.map(function(arg) {
      return typeof arg === 'object' ? JSON.stringify(arg) : String(arg);
    }).join(' ');

    sendError({
      type: 'browser',
      message: message,
      url: window.location.href
    });

    originalError.apply(console, arguments);
  };

  console.log('[ErrorCollector] Client script loaded');
})();
`.trim();
  }
}

// Next.js API 미들웨어 팩토리
export function createErrorMiddleware(collector: ErrorCollector) {
  return async function errorMiddleware(
    req: unknown,
    res: unknown,
    next: (error?: Error) => void
  ) {
    try {
      await next();
    } catch (error) {
      await collector.collectApiError(
        req as { method?: string; url?: string; body?: unknown },
        res as { statusCode?: number },
        error as Error
      );
      throw error;
    }
  };
}

// CLI 실행
async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help')) {
    console.log('사용법: npx ts-node error-collector.ts [options]');
    console.log('');
    console.log('옵션:');
    console.log('  --port <number>       HTTP 서버 포트 (기본: 3999)');
    console.log('  --no-server           HTTP 서버 비활성화');
    console.log('  --script              클라이언트 스크립트 출력');
    process.exit(0);
  }

  if (args.includes('--script')) {
    const collector = new ErrorCollector();
    console.log(collector.generateClientScript());
    process.exit(0);
  }

  const portIndex = args.indexOf('--port');
  const port = portIndex >= 0 ? parseInt(args[portIndex + 1], 10) : 3999;

  const collector = new ErrorCollector({
    httpPort: port,
    enableHttpServer: !args.includes('--no-server'),
  });

  process.on('SIGINT', async () => {
    console.log('\n종료 중...');
    await collector.stop();
    process.exit(0);
  });

  await collector.start();
}

if (require.main === module) {
  main().catch(console.error);
}

export default ErrorCollector;
