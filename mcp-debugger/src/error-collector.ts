/**
 * Error Collector
 * 런타임 에러를 수집하여 자동으로 버그 등록
 *
 * 수집 대상:
 * - Next.js API 에러
 * - React 컴포넌트 에러
 * - 비동기 예외
 * - 미처리 Promise rejection
 *
 * 기능:
 * - 에러 디듀플리케이션 (중복 방지)
 * - 에러 그룹핑
 * - 자동 BTS 버그 등록
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { bugCreate } from './bug-bridge.js';
import { addError } from './db.js';

export interface CollectedError {
  id: string;
  fingerprint: string;
  type: 'uncaught' | 'unhandled_rejection' | 'api_error' | 'react_error' | 'custom';
  message: string;
  stack?: string;
  file?: string;
  line?: number;
  column?: number;
  url?: string;
  method?: string;
  statusCode?: number;
  componentStack?: string;
  context?: Record<string, any>;
  timestamp: Date;
  count: number;
}

export interface ErrorGroup {
  fingerprint: string;
  errors: CollectedError[];
  firstSeen: Date;
  lastSeen: Date;
  count: number;
  status: 'new' | 'grouped' | 'registered' | 'ignored';
  bugId?: string;
}

// 메모리 에러 저장소
const errorStore = new Map<string, ErrorGroup>();

// 에러 핑거프린트 생성
function generateFingerprint(error: Partial<CollectedError>): string {
  const key = [
    error.type,
    error.message?.slice(0, 100),
    error.file,
    error.line
  ].filter(Boolean).join('|');

  return crypto.createHash('md5').update(key).digest('hex').slice(0, 12);
}

/**
 * 에러 수집
 */
export function collectError(errorInfo: {
  type: CollectedError['type'];
  message: string;
  stack?: string;
  file?: string;
  line?: number;
  column?: number;
  url?: string;
  method?: string;
  statusCode?: number;
  componentStack?: string;
  context?: Record<string, any>;
}): CollectedError {
  const fingerprint = generateFingerprint(errorInfo);
  const id = `${fingerprint}-${Date.now()}`;

  const error: CollectedError = {
    id,
    fingerprint,
    ...errorInfo,
    timestamp: new Date(),
    count: 1
  };

  // 그룹에 추가
  if (errorStore.has(fingerprint)) {
    const group = errorStore.get(fingerprint)!;
    group.errors.push(error);
    group.lastSeen = error.timestamp;
    group.count++;
  } else {
    errorStore.set(fingerprint, {
      fingerprint,
      errors: [error],
      firstSeen: error.timestamp,
      lastSeen: error.timestamp,
      count: 1,
      status: 'new'
    });
  }

  return error;
}

/**
 * Next.js API 에러 수집
 */
export function collectApiError(
  error: Error,
  request: {
    url: string;
    method: string;
  },
  statusCode: number = 500,
  context?: Record<string, any>
): CollectedError {
  // 스택에서 파일/라인 추출
  const { file, line, column } = parseStackTrace(error.stack);

  return collectError({
    type: 'api_error',
    message: error.message,
    stack: error.stack,
    file,
    line,
    column,
    url: request.url,
    method: request.method,
    statusCode,
    context
  });
}

/**
 * React 컴포넌트 에러 수집
 */
export function collectReactError(
  error: Error,
  errorInfo?: { componentStack?: string },
  context?: Record<string, any>
): CollectedError {
  const { file, line, column } = parseStackTrace(error.stack);

  return collectError({
    type: 'react_error',
    message: error.message,
    stack: error.stack,
    file,
    line,
    column,
    componentStack: errorInfo?.componentStack,
    context
  });
}

/**
 * Uncaught Exception 수집
 */
export function collectUncaughtException(error: Error): CollectedError {
  const { file, line, column } = parseStackTrace(error.stack);

  return collectError({
    type: 'uncaught',
    message: error.message,
    stack: error.stack,
    file,
    line,
    column
  });
}

/**
 * Unhandled Promise Rejection 수집
 */
export function collectUnhandledRejection(reason: any): CollectedError {
  const message = reason instanceof Error ? reason.message : String(reason);
  const stack = reason instanceof Error ? reason.stack : undefined;
  const { file, line, column } = parseStackTrace(stack);

  return collectError({
    type: 'unhandled_rejection',
    message,
    stack,
    file,
    line,
    column
  });
}

/**
 * 스택 트레이스 파싱
 */
function parseStackTrace(stack?: string): { file?: string; line?: number; column?: number } {
  if (!stack) return {};

  // 첫 번째 유효한 스택 프레임 찾기 (node_modules 제외)
  const lines = stack.split('\n');
  for (const line of lines) {
    if (line.includes('node_modules')) continue;

    // 패턴: at Function (file:line:column) 또는 at file:line:column
    const match = line.match(/(?:at\s+)?(?:[^\s]+\s+\()?([^\s():]+):(\d+):(\d+)/);
    if (match) {
      return {
        file: match[1],
        line: parseInt(match[2], 10),
        column: parseInt(match[3], 10)
      };
    }
  }

  return {};
}

/**
 * 에러 그룹 조회
 */
export function getErrorGroups(): ErrorGroup[] {
  return Array.from(errorStore.values());
}

/**
 * 새 에러 그룹 조회 (미등록)
 */
export function getNewErrorGroups(): ErrorGroup[] {
  return Array.from(errorStore.values()).filter(g => g.status === 'new');
}

/**
 * 에러 그룹 버그 등록
 */
export async function registerErrorGroup(fingerprint: string): Promise<string | null> {
  const group = errorStore.get(fingerprint);
  if (!group) return null;

  const firstError = group.errors[0];

  // 버그 제목 생성
  const typeLabel = {
    uncaught: 'Uncaught Exception',
    unhandled_rejection: 'Unhandled Rejection',
    api_error: 'API Error',
    react_error: 'React Error',
    custom: 'Error'
  }[firstError.type];

  const title = `[${typeLabel}] ${firstError.message.slice(0, 80)}`;

  // 버그 요약 생성
  const summary = [
    `**타입**: ${typeLabel}`,
    firstError.url ? `**URL**: ${firstError.method} ${firstError.url}` : '',
    firstError.statusCode ? `**상태 코드**: ${firstError.statusCode}` : '',
    firstError.file ? `**파일**: ${firstError.file}:${firstError.line}` : '',
    `**발생 횟수**: ${group.count}회`,
    `**첫 발생**: ${group.firstSeen.toISOString()}`,
    `**마지막 발생**: ${group.lastSeen.toISOString()}`,
    '',
    '**에러 메시지**:',
    '```',
    firstError.message,
    '```',
    '',
    firstError.stack ? '**스택 트레이스**:\n```\n' + firstError.stack + '\n```' : '',
    firstError.componentStack ? '**컴포넌트 스택**:\n```\n' + firstError.componentStack + '\n```' : ''
  ].filter(Boolean).join('\n');

  const metadata: Record<string, any> = {
    source: 'error-collector',
    fingerprint: group.fingerprint,
    errorType: firstError.type,
    count: group.count,
    file: firstError.file,
    line: firstError.line,
    url: firstError.url,
    method: firstError.method,
    statusCode: firstError.statusCode
  };

  try {
    const result = await bugCreate({
      title,
      summary,
      logPath: firstError.file,
      metadata
    });

    group.status = 'registered';
    group.bugId = result?.id;

    console.log(`📋 에러 그룹 버그 등록: ${title}`);
    return result?.id || null;
  } catch (error: any) {
    console.error(`❌ 버그 등록 실패: ${error.message}`);
    return null;
  }
}

/**
 * 모든 새 에러 그룹 일괄 등록
 */
export async function registerAllNewErrors(): Promise<{
  registered: number;
  failed: number;
  bugs: Array<{ fingerprint: string; bugId: string | null }>;
}> {
  const result = {
    registered: 0,
    failed: 0,
    bugs: [] as Array<{ fingerprint: string; bugId: string | null }>
  };

  const newGroups = getNewErrorGroups();

  for (const group of newGroups) {
    const bugId = await registerErrorGroup(group.fingerprint);
    result.bugs.push({ fingerprint: group.fingerprint, bugId });

    if (bugId) {
      result.registered++;
    } else {
      result.failed++;
    }
  }

  return result;
}

/**
 * 에러 그룹 무시 처리
 */
export function ignoreErrorGroup(fingerprint: string): boolean {
  const group = errorStore.get(fingerprint);
  if (group) {
    group.status = 'ignored';
    return true;
  }
  return false;
}

/**
 * 에러 그룹 삭제
 */
export function clearErrorGroup(fingerprint: string): boolean {
  return errorStore.delete(fingerprint);
}

/**
 * 모든 에러 그룹 삭제
 */
export function clearAllErrors(): void {
  errorStore.clear();
}

/**
 * 에러 통계
 */
export function getErrorStats(): {
  totalGroups: number;
  totalErrors: number;
  byType: Record<string, number>;
  byStatus: Record<string, number>;
  recentErrors: CollectedError[];
} {
  const groups = Array.from(errorStore.values());
  const allErrors = groups.flatMap(g => g.errors);

  const byType: Record<string, number> = {};
  const byStatus: Record<string, number> = {};

  for (const group of groups) {
    const type = group.errors[0]?.type || 'unknown';
    byType[type] = (byType[type] || 0) + group.count;
    byStatus[group.status] = (byStatus[group.status] || 0) + 1;
  }

  // 최근 에러 (10개)
  const recentErrors = allErrors
    .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
    .slice(0, 10);

  return {
    totalGroups: groups.length,
    totalErrors: allErrors.length,
    byType,
    byStatus,
    recentErrors
  };
}

/**
 * 에러 리포트 생성
 */
export function generateErrorReport(): string {
  const stats = getErrorStats();
  const groups = getErrorGroups();

  let report = '# Error Collection Report\n\n';

  report += '## Summary\n\n';
  report += `- Total Error Groups: ${stats.totalGroups}\n`;
  report += `- Total Errors: ${stats.totalErrors}\n\n`;

  report += '### By Type\n\n';
  for (const [type, count] of Object.entries(stats.byType)) {
    report += `- ${type}: ${count}\n`;
  }

  report += '\n### By Status\n\n';
  for (const [status, count] of Object.entries(stats.byStatus)) {
    report += `- ${status}: ${count}\n`;
  }

  report += '\n## Error Groups\n\n';

  for (const group of groups) {
    const firstError = group.errors[0];
    const icon = {
      new: '🆕',
      grouped: '📦',
      registered: '✅',
      ignored: '🚫'
    }[group.status];

    report += `### ${icon} ${firstError.message.slice(0, 60)}\n\n`;
    report += `- **Fingerprint**: ${group.fingerprint}\n`;
    report += `- **Type**: ${firstError.type}\n`;
    report += `- **Count**: ${group.count}\n`;
    report += `- **Status**: ${group.status}\n`;
    report += `- **First Seen**: ${group.firstSeen.toISOString()}\n`;
    report += `- **Last Seen**: ${group.lastSeen.toISOString()}\n`;
    if (group.bugId) {
      report += `- **Bug ID**: ${group.bugId}\n`;
    }
    report += '\n';
  }

  return report;
}

/**
 * SQLite 에러 큐에 에러 추가 (기존 db.ts 연동)
 */
export function addToErrorQueue(error: CollectedError): void {
  addError({
    error_type: error.type,
    error_message: error.message,
    stack_trace: error.stack,
    file_path: error.file,
    line_number: error.line,
    source: 'error-collector',
    severity: error.statusCode && error.statusCode >= 500 ? 'critical' : 'error'
  });
}

/**
 * 글로벌 에러 핸들러 등록 (Node.js 환경)
 */
export function setupGlobalErrorHandlers(): void {
  // Uncaught Exception
  process.on('uncaughtException', (error: Error) => {
    const collected = collectUncaughtException(error);
    addToErrorQueue(collected);
    console.error('🚨 Uncaught Exception:', error.message);
  });

  // Unhandled Rejection
  process.on('unhandledRejection', (reason: any) => {
    const collected = collectUnhandledRejection(reason);
    addToErrorQueue(collected);
    console.error('🚨 Unhandled Rejection:', reason);
  });

  console.log('✅ Global error handlers registered');
}

/**
 * Express/Next.js 미들웨어용 에러 핸들러
 */
export function errorCollectorMiddleware(
  err: Error,
  req: any,
  res: any,
  next: any
): void {
  const collected = collectApiError(err, {
    url: req.url || req.path,
    method: req.method
  }, res.statusCode || 500);

  addToErrorQueue(collected);

  // 다음 미들웨어로 전달
  next(err);
}

// CLI 실행
if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
  const args = process.argv.slice(2);

  if (args.includes('--register')) {
    // 새 에러 일괄 등록
    registerAllNewErrors().then(result => {
      console.log(`\n✅ 에러 등록 완료:`);
      console.log(`  - 등록: ${result.registered}개`);
      console.log(`  - 실패: ${result.failed}개`);
    });
  } else if (args.includes('--report')) {
    // 에러 리포트 출력
    console.log(generateErrorReport());
  } else if (args.includes('--stats')) {
    // 통계 출력
    const stats = getErrorStats();
    console.log('\n📊 에러 통계:');
    console.log(`  - 에러 그룹: ${stats.totalGroups}개`);
    console.log(`  - 총 에러: ${stats.totalErrors}개`);
    console.log('\n타입별:');
    for (const [type, count] of Object.entries(stats.byType)) {
      console.log(`  - ${type}: ${count}`);
    }
  } else {
    console.log(`
사용법: npx tsx error-collector.ts [옵션]

옵션:
  --register   새 에러 그룹을 버그로 일괄 등록
  --report     에러 리포트 출력
  --stats      에러 통계 출력

프로그래밍 방식:
  import { collectApiError, registerAllNewErrors } from './error-collector.js';

  // API 에러 수집
  collectApiError(error, { url: '/api/test', method: 'GET' }, 500);

  // 새 에러 일괄 등록
  await registerAllNewErrors();
`);
  }
}

export default {
  collectError,
  collectApiError,
  collectReactError,
  collectUncaughtException,
  collectUnhandledRejection,
  registerErrorGroup,
  registerAllNewErrors,
  getErrorGroups,
  getNewErrorGroups,
  getErrorStats,
  generateErrorReport,
  setupGlobalErrorHandlers,
  errorCollectorMiddleware
};
