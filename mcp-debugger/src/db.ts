/**
 * Error Queue Database
 * 에러 큐를 SQLite로 관리
 *
 * DB 위치: ~/.mcp-debugger/error-queue.db
 * 어느 워크스페이스에서든 동일한 DB 사용
 */

import { createRequire } from 'module';
import { fileURLToPath, pathToFileURL } from 'url';
import { dirname, join } from 'path';

// import.meta.url에서 프로젝트 루트 계산
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// dist 또는 src 폴더의 부모 = 프로젝트 루트
const projectRoot = dirname(__dirname);
const require = createRequire(pathToFileURL(join(projectRoot, 'package.json')));
const Database = require('better-sqlite3');
import path from 'path';
import fs from 'fs';
import os from 'os';
import crypto from 'crypto';

// 사용자 홈 디렉토리에 데이터 저장 (워크스페이스 독립적)
const homeDir = os.homedir();
const dataDir = path.join(homeDir, '.mcp-debugger');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// BTS-3014: dbPath export하여 index.ts에서 시작 로그에 사용
export const dbPath = path.join(dataDir, 'error-queue.db');
const db = new Database(dbPath);

// WAL 모드 활성화
db.pragma('journal_mode = WAL');

// 테이블 생성
db.exec(`
  -- 에러 큐 테이블
  CREATE TABLE IF NOT EXISTS error_queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    error_hash TEXT UNIQUE NOT NULL,
    error_type TEXT NOT NULL,
    error_message TEXT NOT NULL,
    stack_trace TEXT,
    file_path TEXT,
    line_number INTEGER,
    source TEXT NOT NULL DEFAULT 'log',
    severity TEXT NOT NULL DEFAULT 'error',
    status TEXT NOT NULL DEFAULT 'pending',
    claimed_by TEXT,
    claimed_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- 에러 처리 기록 테이블
  CREATE TABLE IF NOT EXISTS error_resolution (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    error_id INTEGER NOT NULL,
    worker_id TEXT NOT NULL,
    action TEXT NOT NULL,
    description TEXT,
    changes_made TEXT,
    resolved BOOLEAN NOT NULL DEFAULT 0,
    started_at TEXT NOT NULL,
    completed_at TEXT,
    duration_seconds INTEGER,
    FOREIGN KEY (error_id) REFERENCES error_queue(id)
  );

  -- 워커 상태 테이블
  CREATE TABLE IF NOT EXISTS worker_status (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'idle',
    current_error_id INTEGER,
    last_heartbeat TEXT NOT NULL DEFAULT (datetime('now')),
    errors_processed INTEGER NOT NULL DEFAULT 0,
    errors_resolved INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- 로그 소스 테이블 (모니터링할 로그 파일들)
  CREATE TABLE IF NOT EXISTS log_source (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    path TEXT NOT NULL UNIQUE,
    project TEXT,
    pattern TEXT,
    enabled BOOLEAN NOT NULL DEFAULT 1,
    last_position INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- 프로젝트 테이블 (등록된 프로젝트들)
  CREATE TABLE IF NOT EXISTS project (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    path TEXT NOT NULL,
    description TEXT,
    active BOOLEAN NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- 인덱스 생성
  CREATE INDEX IF NOT EXISTS idx_error_queue_status ON error_queue(status);
  CREATE INDEX IF NOT EXISTS idx_error_queue_created ON error_queue(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_error_resolution_error ON error_resolution(error_id);
  CREATE INDEX IF NOT EXISTS idx_worker_status_heartbeat ON worker_status(last_heartbeat);
`);

// retry_count 컬럼 추가 (기존 DB 호환)
try {
  db.exec(`ALTER TABLE error_queue ADD COLUMN retry_count INTEGER NOT NULL DEFAULT 0`);
} catch (e) {
  // 이미 존재하면 무시
}

// 에러 해시 생성 (중복 방지용)
export function generateErrorHash(errorType: string, errorMessage: string, filePath?: string): string {
  const content = `${errorType}:${errorMessage}:${filePath || ''}`;
  return crypto.createHash('md5').update(content).digest('hex');
}

// 에러 타입 정의
export interface ErrorItem {
  id: number;
  error_hash: string;
  error_type: string;
  error_message: string;
  stack_trace?: string;
  file_path?: string;
  line_number?: number;
  source: string;
  severity: 'warning' | 'error' | 'critical';
  status: 'pending' | 'claimed' | 'processing' | 'resolved' | 'ignored';
  claimed_by?: string;
  claimed_at?: string;
  created_at: string;
  updated_at: string;
  bug_id?: string; // MySQL bugs 테이블 연동 시 사용
}

export interface ErrorResolution {
  id: number;
  error_id: number;
  worker_id: string;
  action: string;
  description?: string;
  changes_made?: string;
  resolved: boolean;
  started_at: string;
  completed_at?: string;
  duration_seconds?: number;
}

export interface WorkerStatus {
  id: string;
  name: string;
  status: 'idle' | 'processing' | 'offline';
  current_error_id?: number;
  last_heartbeat: string;
  errors_processed: number;
  errors_resolved: number;
  created_at: string;
}

// ==================== 에러 큐 함수들 ====================

// 에러 추가
export function addError(error: {
  error_type: string;
  error_message: string;
  stack_trace?: string;
  file_path?: string;
  line_number?: number;
  source?: string;
  severity?: 'warning' | 'error' | 'critical';
}): ErrorItem | null {
  const hash = generateErrorHash(error.error_type, error.error_message, error.file_path);

  try {
    const stmt = db.prepare(`
      INSERT INTO error_queue (
        error_hash, error_type, error_message, stack_trace,
        file_path, line_number, source, severity
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      hash,
      error.error_type,
      error.error_message,
      error.stack_trace || null,
      error.file_path || null,
      error.line_number || null,
      error.source || 'log',
      error.severity || 'error'
    );

    return getErrorById(result.lastInsertRowid as number);
  } catch (err: any) {
    // 중복 에러 (UNIQUE constraint)
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      console.log(`[DB] 중복 에러 무시: ${error.error_type}`);
      return null;
    }
    throw err;
  }
}

// 에러 조회
export function getErrorById(id: number): ErrorItem | null {
  const stmt = db.prepare('SELECT * FROM error_queue WHERE id = ?');
  return stmt.get(id) as ErrorItem | null;
}

// 대기 중인 에러 목록
export function getPendingErrors(limit: number = 50): ErrorItem[] {
  const stmt = db.prepare(`
    SELECT * FROM error_queue
    WHERE status = 'pending'
    ORDER BY
      CASE severity WHEN 'critical' THEN 1 WHEN 'error' THEN 2 ELSE 3 END,
      created_at ASC
    LIMIT ?
  `);
  return stmt.all(limit) as ErrorItem[];
}

// 에러 클레임 (워커가 가져감)
export function claimError(workerId: string): ErrorItem | null {
  const now = new Date().toISOString();

  // 트랜잭션으로 처리
  const claimTx = db.transaction(() => {
    // 가장 오래된 pending 에러 선택
    const selectStmt = db.prepare(`
      SELECT id FROM error_queue
      WHERE status = 'pending'
      ORDER BY
        CASE severity WHEN 'critical' THEN 1 WHEN 'error' THEN 2 ELSE 3 END,
        created_at ASC
      LIMIT 1
    `);

    const row = selectStmt.get() as { id: number } | undefined;
    if (!row) return null;

    // 상태 업데이트
    const updateStmt = db.prepare(`
      UPDATE error_queue
      SET status = 'claimed', claimed_by = ?, claimed_at = ?, updated_at = ?
      WHERE id = ? AND status = 'pending'
    `);

    const result = updateStmt.run(workerId, now, now, row.id);
    if (result.changes === 0) return null;

    return getErrorById(row.id);
  });

  return claimTx();
}

// 에러 상태 업데이트
export function updateErrorStatus(
  errorId: number,
  status: 'pending' | 'claimed' | 'processing' | 'resolved' | 'ignored' | 'failed',
  workerId?: string
): boolean {
  const now = new Date().toISOString();
  const stmt = db.prepare(`
    UPDATE error_queue
    SET status = ?, updated_at = ?
    WHERE id = ?
  `);

  const result = stmt.run(status, now, errorId);
  return result.changes > 0;
}

// 재시도 횟수 증가 및 실패 처리
const MAX_RETRIES = 3;
export function incrementRetryCount(errorId: number): { retry_count: number; failed: boolean } {
  const now = new Date().toISOString();

  // retry_count 증가
  const updateStmt = db.prepare(`
    UPDATE error_queue
    SET retry_count = retry_count + 1, updated_at = ?
    WHERE id = ?
  `);
  updateStmt.run(now, errorId);

  // 현재 retry_count 확인
  const selectStmt = db.prepare('SELECT retry_count FROM error_queue WHERE id = ?');
  const row = selectStmt.get(errorId) as { retry_count: number } | undefined;
  const retryCount = row?.retry_count || 0;

  // 최대 재시도 초과 시 failed로 마킹
  if (retryCount >= MAX_RETRIES) {
    updateErrorStatus(errorId, 'failed');
    return { retry_count: retryCount, failed: true };
  }

  // pending으로 되돌림
  updateErrorStatus(errorId, 'pending');
  return { retry_count: retryCount, failed: false };
}

// 에러 해결 기록
export function recordResolution(resolution: {
  error_id: number;
  worker_id: string;
  action: string;
  description?: string;
  changes_made?: string;
  resolved: boolean;
  started_at: string;
}): ErrorResolution | null {
  const now = new Date().toISOString();
  const duration = Math.floor(
    (new Date(now).getTime() - new Date(resolution.started_at).getTime()) / 1000
  );

  const stmt = db.prepare(`
    INSERT INTO error_resolution (
      error_id, worker_id, action, description,
      changes_made, resolved, started_at, completed_at, duration_seconds
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const result = stmt.run(
    resolution.error_id,
    resolution.worker_id,
    resolution.action,
    resolution.description || null,
    resolution.changes_made || null,
    resolution.resolved ? 1 : 0,
    resolution.started_at,
    now,
    duration
  );

  // 에러 상태 업데이트
  if (resolution.resolved) {
    updateErrorStatus(resolution.error_id, 'resolved', resolution.worker_id);
  }

  const getStmt = db.prepare('SELECT * FROM error_resolution WHERE id = ?');
  return getStmt.get(result.lastInsertRowid) as ErrorResolution | null;
}

// ==================== 워커 관리 ====================

// 워커 등록/업데이트
export function registerWorker(workerId: string, name: string): WorkerStatus {
  const now = new Date().toISOString();

  const stmt = db.prepare(`
    INSERT INTO worker_status (id, name, last_heartbeat)
    VALUES (?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      last_heartbeat = excluded.last_heartbeat
  `);

  stmt.run(workerId, name, now);

  const getStmt = db.prepare('SELECT * FROM worker_status WHERE id = ?');
  return getStmt.get(workerId) as WorkerStatus;
}

// 워커 상태 업데이트
export function updateWorkerStatus(
  workerId: string,
  status: 'idle' | 'processing' | 'offline',
  currentErrorId?: number
): boolean {
  const now = new Date().toISOString();

  const stmt = db.prepare(`
    UPDATE worker_status
    SET status = ?, current_error_id = ?, last_heartbeat = ?
    WHERE id = ?
  `);

  const result = stmt.run(status, currentErrorId || null, now, workerId);
  return result.changes > 0;
}

// 워커 통계 업데이트
export function incrementWorkerStats(workerId: string, resolved: boolean): void {
  const field = resolved ? 'errors_resolved' : 'errors_processed';
  const stmt = db.prepare(`
    UPDATE worker_status
    SET ${field} = ${field} + 1, errors_processed = errors_processed + 1
    WHERE id = ?
  `);
  stmt.run(workerId);
}

// 활성 워커 목록 (최근 1분 이내)
export function getActiveWorkers(): WorkerStatus[] {
  const oneMinuteAgo = new Date(Date.now() - 1 * 60 * 1000).toISOString();

  const stmt = db.prepare(`
    SELECT * FROM worker_status
    WHERE last_heartbeat > ?
    ORDER BY last_heartbeat DESC
  `);

  return stmt.all(oneMinuteAgo) as WorkerStatus[];
}

// ==================== 통계 및 리포트 ====================

// BTS-2991: 오래된 processing 에러를 pending으로 되돌림
export function recoverStuckProcessing(timeoutMinutes: number = 30): number {
  const cutoff = new Date(Date.now() - timeoutMinutes * 60 * 1000).toISOString();
  const now = new Date().toISOString();

  const stmt = db.prepare(`
    UPDATE error_queue
    SET status = 'pending', claimed_by = NULL, claimed_at = NULL, updated_at = ?
    WHERE status IN ('processing', 'claimed') AND updated_at < ?
  `);

  const result = stmt.run(now, cutoff);
  if (result.changes > 0) {
    console.log(`[DB] ${result.changes}개의 멈춘 에러를 pending으로 되돌림 (${timeoutMinutes}분 초과)`);
  }
  return result.changes;
}

// 에러 통계
export function getErrorStats(): {
  total: number;
  pending: number;
  processing: number;
  resolved: number;
  ignored: number;
  by_severity: { [key: string]: number };
  by_type: { [key: string]: number };
} {
  const stats: any = {
    total: 0,
    pending: 0,
    processing: 0,
    resolved: 0,
    ignored: 0,
    by_severity: {},
    by_type: {}
  };

  // 상태별 카운트
  const statusStmt = db.prepare(`
    SELECT status, COUNT(*) as count FROM error_queue GROUP BY status
  `);

  for (const row of statusStmt.all() as any[]) {
    stats[row.status] = row.count;
    stats.total += row.count;
  }

  // 심각도별 카운트
  const severityStmt = db.prepare(`
    SELECT severity, COUNT(*) as count FROM error_queue
    WHERE status = 'pending' GROUP BY severity
  `);

  for (const row of severityStmt.all() as any[]) {
    stats.by_severity[row.severity] = row.count;
  }

  // 타입별 카운트
  const typeStmt = db.prepare(`
    SELECT error_type, COUNT(*) as count FROM error_queue
    WHERE status = 'pending' GROUP BY error_type
    ORDER BY count DESC LIMIT 10
  `);

  for (const row of typeStmt.all() as any[]) {
    stats.by_type[row.error_type] = row.count;
  }

  return stats;
}

// 해결 기록 조회
export function getResolutionHistory(limit: number = 20): (ErrorResolution & { error_type: string; error_message: string })[] {
  const stmt = db.prepare(`
    SELECT r.*, e.error_type, e.error_message
    FROM error_resolution r
    JOIN error_queue e ON r.error_id = e.id
    ORDER BY r.completed_at DESC
    LIMIT ?
  `);

  return stmt.all(limit) as any[];
}

// ==================== 프로젝트 관리 ====================

export function addProject(name: string, projectPath: string, description?: string): void {
  const stmt = db.prepare(`
    INSERT INTO project (name, path, description)
    VALUES (?, ?, ?)
    ON CONFLICT(name) DO UPDATE SET path = excluded.path, description = excluded.description
  `);
  stmt.run(name, projectPath, description || null);
}

export function getProjects(): { id: number; name: string; path: string; description?: string; active: boolean }[] {
  const stmt = db.prepare('SELECT * FROM project WHERE active = 1');
  return stmt.all() as any[];
}

export function removeProject(name: string): boolean {
  const stmt = db.prepare('UPDATE project SET active = 0 WHERE name = ?');
  return stmt.run(name).changes > 0;
}

// ==================== 로그 소스 관리 ====================

export function addLogSource(name: string, logPath: string, project?: string, pattern?: string): void {
  const stmt = db.prepare(`
    INSERT INTO log_source (name, path, project, pattern)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(path) DO UPDATE SET name = excluded.name, project = excluded.project, pattern = excluded.pattern
  `);
  stmt.run(name, logPath, project || null, pattern || null);
}

export function getLogSources(project?: string): { id: number; name: string; path: string; project?: string; pattern?: string; enabled: boolean; last_position: number }[] {
  if (project) {
    const stmt = db.prepare('SELECT * FROM log_source WHERE enabled = 1 AND project = ?');
    return stmt.all(project) as any[];
  }
  const stmt = db.prepare('SELECT * FROM log_source WHERE enabled = 1');
  return stmt.all() as any[];
}

export function removeLogSource(logPath: string): boolean {
  const stmt = db.prepare('UPDATE log_source SET enabled = 0 WHERE path = ?');
  return stmt.run(logPath).changes > 0;
}

export function updateLogPosition(sourceId: number, position: number): void {
  const stmt = db.prepare('UPDATE log_source SET last_position = ? WHERE id = ?');
  stmt.run(position, sourceId);
}

// ==================== 수동 에러 추가 ====================

export function addErrorManually(
  errorType: string,
  errorMessage: string,
  options?: {
    file_path?: string;
    line_number?: number;
    project?: string;
    severity?: 'warning' | 'error' | 'critical';
  }
): ErrorItem | null {
  return addError({
    error_type: errorType,
    error_message: errorMessage,
    file_path: options?.file_path,
    line_number: options?.line_number,
    source: options?.project || 'manual',
    severity: options?.severity || 'error'
  });
}

export default db;
