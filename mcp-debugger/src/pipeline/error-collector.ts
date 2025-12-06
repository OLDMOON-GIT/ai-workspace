/**
 * Error Collector
 * 런타임 에러 수집 및 버그 자동 등록
 */

import * as fs from 'fs';
import * as path from 'path';
import { bugCreate } from '../bug-bridge.js';
import { addError } from '../db.js';

export interface RuntimeError {
  type: string;
  message: string;
  stack?: string;
  filePath?: string;
  lineNumber?: number;
  columnNumber?: number;
  timestamp: Date;
  url?: string;
  userAgent?: string;
  metadata?: Record<string, any>;
}

export interface ErrorReport {
  id: string;
  errors: RuntimeError[];
  session: {
    startTime: Date;
    endTime: Date;
    duration: number;
    url?: string;
    userAgent?: string;
  };
  summary: {
    total: number;
    byType: Record<string, number>;
    byFile: Record<string, number>;
  };
}

/**
 * Next.js 에러 로그 파싱
 */
export function parseNextJSErrorLog(logContent: string): RuntimeError[] {
  const errors: RuntimeError[] = [];
  const lines = logContent.split('\n');

  let currentError: Partial<RuntimeError> | null = null;
  let stackBuffer: string[] = [];

  for (const line of lines) {
    // 에러 시작 (Error: message 또는 TypeError: message 등)
    const errorMatch = line.match(/^\s*(Error|TypeError|ReferenceError|SyntaxError|RangeError|URIError):\s*(.+)$/);
    if (errorMatch) {
      // 이전 에러 저장
      if (currentError) {
        currentError.stack = stackBuffer.join('\n');
        errors.push(currentError as RuntimeError);
      }

      currentError = {
        type: errorMatch[1],
        message: errorMatch[2],
        timestamp: new Date()
      };
      stackBuffer = [];
      continue;
    }

    // 스택 트레이스 라인 (at function (file:line:col))
    const stackMatch = line.match(/^\s+at\s+(.+?)\s+\((.+):(\d+):(\d+)\)$/);
    if (stackMatch && currentError) {
      stackBuffer.push(line);

      // 첫 번째 스택 라인에서 파일 정보 추출
      if (!currentError.filePath) {
        currentError.filePath = stackMatch[2];
        currentError.lineNumber = parseInt(stackMatch[3]);
        currentError.columnNumber = parseInt(stackMatch[4]);
      }
      continue;
    }

    // HTTP 에러 (GET /api/xxx 500)
    const httpMatch = line.match(/(GET|POST|PUT|PATCH|DELETE|OPTIONS)\s+([^\s]+)\s+(\d{3})/);
    if (httpMatch && parseInt(httpMatch[3]) >= 400) {
      errors.push({
        type: 'HTTPError',
        message: `${httpMatch[1]} ${httpMatch[2]} returned ${httpMatch[3]}`,
        timestamp: new Date(),
        url: httpMatch[2],
        metadata: {
          method: httpMatch[1],
          statusCode: parseInt(httpMatch[3])
        }
      });
      continue;
    }

    // Unhandled Promise Rejection
    const unhandledMatch = line.match(/Unhandled\s+(?:Promise\s+)?Rejection:\s*(.+)/i);
    if (unhandledMatch) {
      errors.push({
        type: 'UnhandledRejection',
        message: unhandledMatch[1],
        timestamp: new Date()
      });
    }
  }

  // 마지막 에러 저장
  if (currentError) {
    currentError.stack = stackBuffer.join('\n');
    errors.push(currentError as RuntimeError);
  }

  return errors;
}

/**
 * 브라우저 에러 리포트 파싱 (Sentry/LogRocket 형식)
 */
export function parseBrowserErrorReport(report: any): RuntimeError[] {
  const errors: RuntimeError[] = [];

  if (report.exception?.values) {
    for (const exc of report.exception.values) {
      const error: RuntimeError = {
        type: exc.type || 'Error',
        message: exc.value || '',
        timestamp: new Date(report.timestamp || Date.now()),
        userAgent: report.contexts?.browser?.name
      };

      if (exc.stacktrace?.frames) {
        const topFrame = exc.stacktrace.frames[exc.stacktrace.frames.length - 1];
        error.filePath = topFrame?.filename;
        error.lineNumber = topFrame?.lineno;
        error.columnNumber = topFrame?.colno;
        error.stack = exc.stacktrace.frames
          .map((f: any) => `    at ${f.function || 'anonymous'} (${f.filename}:${f.lineno}:${f.colno})`)
          .reverse()
          .join('\n');
      }

      errors.push(error);
    }
  }

  return errors;
}

/**
 * 에러 중복 제거 (유사한 에러 그룹화)
 */
export function deduplicateErrors(errors: RuntimeError[]): RuntimeError[] {
  const seen = new Map<string, RuntimeError>();

  for (const error of errors) {
    const key = `${error.type}:${error.message}:${error.filePath || ''}`;

    if (!seen.has(key)) {
      seen.set(key, error);
    }
  }

  return Array.from(seen.values());
}

/**
 * 에러를 SQLite 큐에 추가
 */
export function addErrorToQueue(error: RuntimeError): void {
  addError({
    error_type: error.type,
    error_message: error.message,
    stack_trace: error.stack,
    file_path: error.filePath,
    line_number: error.lineNumber,
    source: 'error-collector',
    severity: categorizeErrorSeverity(error)
  });
}

/**
 * 에러 심각도 분류
 */
function categorizeErrorSeverity(error: RuntimeError): 'warning' | 'error' | 'critical' {
  const message = error.message.toLowerCase();
  const type = error.type.toLowerCase();

  // Critical
  if (message.includes('out of memory') ||
      message.includes('maximum call stack') ||
      message.includes('ENOSPC') ||
      type.includes('fatal')) {
    return 'critical';
  }

  // Warning
  if (message.includes('deprecated') ||
      message.includes('warning') ||
      type === 'warning') {
    return 'warning';
  }

  return 'error';
}

/**
 * 에러를 버그로 등록
 */
export async function registerErrorAsBug(error: RuntimeError): Promise<void> {
  const severity = categorizeErrorSeverity(error);
  const priority = severity === 'critical' ? 'P0' : severity === 'error' ? 'P1' : 'P2';

  await bugCreate({
    title: `[${error.type}] ${error.message.substring(0, 100)}`,
    summary: `${error.message}\n\n${error.stack || ''}`,
    priority,
    type: 'bug',
    logPath: error.filePath,
    metadata: {
      error_type: error.type,
      line_number: error.lineNumber,
      column_number: error.columnNumber,
      url: error.url,
      user_agent: error.userAgent,
      timestamp: error.timestamp.toISOString(),
      source: 'error-collector'
    }
  });
}

/**
 * 에러 리포트 생성
 */
export function generateErrorReport(errors: RuntimeError[]): ErrorReport {
  const dedupedErrors = deduplicateErrors(errors);
  const byType: Record<string, number> = {};
  const byFile: Record<string, number> = {};

  for (const error of dedupedErrors) {
    byType[error.type] = (byType[error.type] || 0) + 1;
    if (error.filePath) {
      byFile[error.filePath] = (byFile[error.filePath] || 0) + 1;
    }
  }

  const timestamps = errors.map(e => e.timestamp.getTime());
  const startTime = new Date(Math.min(...timestamps));
  const endTime = new Date(Math.max(...timestamps));

  return {
    id: `report-${Date.now()}`,
    errors: dedupedErrors,
    session: {
      startTime,
      endTime,
      duration: endTime.getTime() - startTime.getTime()
    },
    summary: {
      total: dedupedErrors.length,
      byType,
      byFile
    }
  };
}

/**
 * 로그 파일 감시 및 에러 수집
 */
export function watchLogFile(
  logPath: string,
  onError: (error: RuntimeError) => void
): fs.FSWatcher {
  let lastPosition = 0;

  if (fs.existsSync(logPath)) {
    lastPosition = fs.statSync(logPath).size;
  }

  const watcher = fs.watch(logPath, (eventType) => {
    if (eventType !== 'change') return;

    try {
      const stats = fs.statSync(logPath);

      if (stats.size < lastPosition) {
        // 파일이 truncate 됨
        lastPosition = 0;
      }

      if (stats.size === lastPosition) return;

      const fd = fs.openSync(logPath, 'r');
      const buffer = Buffer.alloc(stats.size - lastPosition);
      fs.readSync(fd, buffer, 0, buffer.length, lastPosition);
      fs.closeSync(fd);

      const newContent = buffer.toString('utf-8');
      const errors = parseNextJSErrorLog(newContent);

      for (const error of errors) {
        onError(error);
      }

      lastPosition = stats.size;
    } catch (err) {
      console.error('Error reading log file:', err);
    }
  });

  console.log(`👀 Watching log file: ${logPath}`);
  return watcher;
}

/**
 * 에러 수집기 시작
 */
export function startErrorCollector(config: {
  logPaths: string[];
  autoRegisterBugs: boolean;
  deduplicationWindow: number; // ms
}): { stop: () => void } {
  const watchers: fs.FSWatcher[] = [];
  const recentErrors = new Map<string, number>(); // key -> timestamp

  const handleError = async (error: RuntimeError) => {
    const key = `${error.type}:${error.message}:${error.filePath || ''}`;
    const now = Date.now();
    const lastSeen = recentErrors.get(key);

    // 중복 제거 윈도우 내에서는 스킵
    if (lastSeen && now - lastSeen < config.deduplicationWindow) {
      return;
    }

    recentErrors.set(key, now);

    // SQLite 큐에 추가
    addErrorToQueue(error);

    console.log(`🚨 Error collected: [${error.type}] ${error.message.substring(0, 60)}...`);

    // 자동 버그 등록
    if (config.autoRegisterBugs) {
      try {
        await registerErrorAsBug(error);
        console.log(`🐛 Bug registered for error: ${error.type}`);
      } catch (err) {
        console.error('Failed to register bug:', err);
      }
    }
  };

  // 모든 로그 파일 감시
  for (const logPath of config.logPaths) {
    if (fs.existsSync(logPath)) {
      watchers.push(watchLogFile(logPath, handleError));
    }
  }

  // 오래된 중복 기록 정리 (1분마다)
  const cleanupInterval = setInterval(() => {
    const cutoff = Date.now() - config.deduplicationWindow;
    for (const [key, timestamp] of recentErrors.entries()) {
      if (timestamp < cutoff) {
        recentErrors.delete(key);
      }
    }
  }, 60000);

  return {
    stop: () => {
      for (const watcher of watchers) {
        watcher.close();
      }
      clearInterval(cleanupInterval);
      console.log('🛑 Error collector stopped');
    }
  };
}

export default {
  parseNextJSErrorLog,
  parseBrowserErrorReport,
  deduplicateErrors,
  addErrorToQueue,
  registerErrorAsBug,
  generateErrorReport,
  watchLogFile,
  startErrorCollector
};
