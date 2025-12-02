/**
 * Auto Tester Database
 * 테스트 실행 결과 및 프로젝트 관리
 *
 * DB 위치: ~/.mcp-auto-tester/test-results.db
 */

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import os from 'os';
import crypto from 'crypto';

// 사용자 홈 디렉토리에 데이터 저장
const homeDir = os.homedir();
const dataDir = path.join(homeDir, '.mcp-auto-tester');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'test-results.db');
console.error(`[MCP-AutoTester] DB: ${dbPath}`);
const db: InstanceType<typeof Database> = new Database(dbPath);

// WAL 모드 활성화
db.pragma('journal_mode = WAL');

// 테이블 생성
db.exec(`
  -- 프로젝트 테이블
  CREATE TABLE IF NOT EXISTS project (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    path TEXT NOT NULL,
    test_command TEXT NOT NULL DEFAULT 'npm test',
    watch_patterns TEXT DEFAULT '**/*.{ts,tsx,js,jsx}',
    enabled BOOLEAN NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- 테스트 실행 기록
  CREATE TABLE IF NOT EXISTS test_run (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    trigger TEXT NOT NULL, -- 'auto', 'manual', 'file-change'
    triggered_by TEXT, -- 변경된 파일 경로
    status TEXT NOT NULL, -- 'running', 'passed', 'failed', 'error'
    total_tests INTEGER,
    passed_tests INTEGER,
    failed_tests INTEGER,
    skipped_tests INTEGER,
    duration_ms INTEGER,
    output TEXT,
    error_message TEXT,
    started_at TEXT NOT NULL DEFAULT (datetime('now')),
    completed_at TEXT,
    FOREIGN KEY (project_id) REFERENCES project(id)
  );

  -- 개별 테스트 결과
  CREATE TABLE IF NOT EXISTS test_case (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    test_run_id INTEGER NOT NULL,
    suite_name TEXT,
    test_name TEXT NOT NULL,
    status TEXT NOT NULL, -- 'passed', 'failed', 'skipped'
    duration_ms INTEGER,
    error_message TEXT,
    stack_trace TEXT,
    FOREIGN KEY (test_run_id) REFERENCES test_run(id)
  );

  -- 파일 변경 감지 기록
  CREATE TABLE IF NOT EXISTS file_change (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    file_path TEXT NOT NULL,
    change_type TEXT NOT NULL, -- 'add', 'change', 'unlink'
    test_run_id INTEGER,
    detected_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (project_id) REFERENCES project(id),
    FOREIGN KEY (test_run_id) REFERENCES test_run(id)
  );

  -- 인덱스 생성
  CREATE INDEX IF NOT EXISTS idx_test_run_project ON test_run(project_id);
  CREATE INDEX IF NOT EXISTS idx_test_run_status ON test_run(status);
  CREATE INDEX IF NOT EXISTS idx_test_case_run ON test_case(test_run_id);
  CREATE INDEX IF NOT EXISTS idx_file_change_project ON file_change(project_id);
`);

// ==================== 타입 정의 ====================

export interface Project {
  id: number;
  name: string;
  path: string;
  test_command: string;
  watch_patterns: string;
  enabled: boolean;
  created_at: string;
}

export interface TestRun {
  id: number;
  project_id: number;
  trigger: 'auto' | 'manual' | 'file-change';
  triggered_by?: string;
  status: 'running' | 'passed' | 'failed' | 'error';
  total_tests?: number;
  passed_tests?: number;
  failed_tests?: number;
  skipped_tests?: number;
  duration_ms?: number;
  output?: string;
  error_message?: string;
  started_at: string;
  completed_at?: string;
}

export interface TestCase {
  id: number;
  test_run_id: number;
  suite_name?: string;
  test_name: string;
  status: 'passed' | 'failed' | 'skipped';
  duration_ms?: number;
  error_message?: string;
  stack_trace?: string;
}

export interface FileChange {
  id: number;
  project_id: number;
  file_path: string;
  change_type: 'add' | 'change' | 'unlink';
  test_run_id?: number;
  detected_at: string;
}

// ==================== 프로젝트 관리 ====================

export function addProject(name: string, projectPath: string, testCommand?: string, watchPatterns?: string): Project {
  const stmt = db.prepare(`
    INSERT INTO project (name, path, test_command, watch_patterns)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(name) DO UPDATE SET
      path = excluded.path,
      test_command = excluded.test_command,
      watch_patterns = excluded.watch_patterns
  `);

  stmt.run(
    name,
    projectPath,
    testCommand || 'npm test',
    watchPatterns || '**/*.{ts,tsx,js,jsx}'
  );

  const getStmt = db.prepare('SELECT * FROM project WHERE name = ?');
  return getStmt.get(name) as Project;
}

export function getProjects(enabledOnly: boolean = true): Project[] {
  if (enabledOnly) {
    const stmt = db.prepare('SELECT * FROM project WHERE enabled = 1');
    return stmt.all() as Project[];
  }
  const stmt = db.prepare('SELECT * FROM project');
  return stmt.all() as Project[];
}

export function getProjectById(id: number): Project | null {
  const stmt = db.prepare('SELECT * FROM project WHERE id = ?');
  return stmt.get(id) as Project | null;
}

export function getProjectByName(name: string): Project | null {
  const stmt = db.prepare('SELECT * FROM project WHERE name = ?');
  return stmt.get(name) as Project | null;
}

export function removeProject(name: string): boolean {
  const stmt = db.prepare('UPDATE project SET enabled = 0 WHERE name = ?');
  return stmt.run(name).changes > 0;
}

// ==================== 테스트 실행 관리 ====================

export function startTestRun(
  projectId: number,
  trigger: 'auto' | 'manual' | 'file-change',
  triggeredBy?: string
): TestRun {
  const stmt = db.prepare(`
    INSERT INTO test_run (project_id, trigger, triggered_by, status)
    VALUES (?, ?, ?, 'running')
  `);

  const result = stmt.run(projectId, trigger, triggeredBy || null);
  const id = result.lastInsertRowid as number;

  const getStmt = db.prepare('SELECT * FROM test_run WHERE id = ?');
  return getStmt.get(id) as TestRun;
}

export function completeTestRun(
  runId: number,
  status: 'passed' | 'failed' | 'error',
  results: {
    total?: number;
    passed?: number;
    failed?: number;
    skipped?: number;
    duration_ms?: number;
    output?: string;
    error_message?: string;
  }
): void {
  const now = new Date().toISOString();

  const stmt = db.prepare(`
    UPDATE test_run
    SET status = ?,
        total_tests = ?,
        passed_tests = ?,
        failed_tests = ?,
        skipped_tests = ?,
        duration_ms = ?,
        output = ?,
        error_message = ?,
        completed_at = ?
    WHERE id = ?
  `);

  stmt.run(
    status,
    results.total || null,
    results.passed || null,
    results.failed || null,
    results.skipped || null,
    results.duration_ms || null,
    results.output || null,
    results.error_message || null,
    now,
    runId
  );
}

export function getTestRun(id: number): TestRun | null {
  const stmt = db.prepare('SELECT * FROM test_run WHERE id = ?');
  return stmt.get(id) as TestRun | null;
}

export function getRecentTestRuns(projectId?: number, limit: number = 20): TestRun[] {
  if (projectId) {
    const stmt = db.prepare(`
      SELECT * FROM test_run
      WHERE project_id = ?
      ORDER BY started_at DESC
      LIMIT ?
    `);
    return stmt.all(projectId, limit) as TestRun[];
  }

  const stmt = db.prepare(`
    SELECT * FROM test_run
    ORDER BY started_at DESC
    LIMIT ?
  `);
  return stmt.all(limit) as TestRun[];
}

// ==================== 테스트 케이스 관리 ====================

export function addTestCase(
  testRunId: number,
  testName: string,
  status: 'passed' | 'failed' | 'skipped',
  options?: {
    suite_name?: string;
    duration_ms?: number;
    error_message?: string;
    stack_trace?: string;
  }
): void {
  const stmt = db.prepare(`
    INSERT INTO test_case (test_run_id, suite_name, test_name, status, duration_ms, error_message, stack_trace)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    testRunId,
    options?.suite_name || null,
    testName,
    status,
    options?.duration_ms || null,
    options?.error_message || null,
    options?.stack_trace || null
  );
}

export function getTestCases(testRunId: number): TestCase[] {
  const stmt = db.prepare('SELECT * FROM test_case WHERE test_run_id = ?');
  return stmt.all(testRunId) as TestCase[];
}

export function getFailedTests(projectId?: number, limit: number = 20): (TestCase & { run_started_at: string })[] {
  if (projectId) {
    const stmt = db.prepare(`
      SELECT tc.*, tr.started_at as run_started_at
      FROM test_case tc
      JOIN test_run tr ON tc.test_run_id = tr.id
      WHERE tc.status = 'failed' AND tr.project_id = ?
      ORDER BY tr.started_at DESC
      LIMIT ?
    `);
    return stmt.all(projectId, limit) as any[];
  }

  const stmt = db.prepare(`
    SELECT tc.*, tr.started_at as run_started_at
    FROM test_case tc
    JOIN test_run tr ON tc.test_run_id = tr.id
    WHERE tc.status = 'failed'
    ORDER BY tr.started_at DESC
    LIMIT ?
  `);
  return stmt.all(limit) as any[];
}

// ==================== 파일 변경 감지 ====================

export function recordFileChange(
  projectId: number,
  filePath: string,
  changeType: 'add' | 'change' | 'unlink',
  testRunId?: number
): void {
  const stmt = db.prepare(`
    INSERT INTO file_change (project_id, file_path, change_type, test_run_id)
    VALUES (?, ?, ?, ?)
  `);

  stmt.run(projectId, filePath, changeType, testRunId || null);
}

// ==================== 통계 ====================

export function getProjectStats(projectId: number): {
  total_runs: number;
  passed_runs: number;
  failed_runs: number;
  success_rate: number;
  avg_duration_ms: number;
  recent_status: string;
} {
  const stmt = db.prepare(`
    SELECT
      COUNT(*) as total_runs,
      SUM(CASE WHEN status = 'passed' THEN 1 ELSE 0 END) as passed_runs,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_runs,
      AVG(duration_ms) as avg_duration_ms
    FROM test_run
    WHERE project_id = ? AND status != 'running'
  `);

  const stats = stmt.get(projectId) as any;

  const recentStmt = db.prepare(`
    SELECT status FROM test_run
    WHERE project_id = ? AND status != 'running'
    ORDER BY started_at DESC
    LIMIT 1
  `);
  const recent = recentStmt.get(projectId) as any;

  return {
    total_runs: stats.total_runs || 0,
    passed_runs: stats.passed_runs || 0,
    failed_runs: stats.failed_runs || 0,
    success_rate: stats.total_runs > 0 ? Math.round((stats.passed_runs / stats.total_runs) * 100) : 0,
    avg_duration_ms: Math.round(stats.avg_duration_ms || 0),
    recent_status: recent?.status || 'unknown'
  };
}

export default db;
