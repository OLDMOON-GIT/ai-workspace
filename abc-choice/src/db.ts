/**
 * 데이터베이스 관리
 * 기록 및 분석 결과 저장
 */

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { Choice } from './pattern-analyzer';

const dataDir = path.join(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'abc-choice.db');
const db: InstanceType<typeof Database> = new Database(dbPath);

// 테이블 생성
db.exec(`
  -- 세션 테이블
  CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    site_url TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- 기록 테이블
  CREATE TABLE IF NOT EXISTS records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL,
    round_number INTEGER NOT NULL,
    result TEXT NOT NULL CHECK(result IN ('B', 'R')),
    predicted TEXT CHECK(predicted IN ('B', 'R')),
    is_correct INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (session_id) REFERENCES sessions(id)
  );

  -- 분석 로그 테이블
  CREATE TABLE IF NOT EXISTS analysis_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL,
    round_number INTEGER NOT NULL,
    recommended TEXT NOT NULL CHECK(recommended IN ('B', 'R')),
    confidence REAL NOT NULL,
    reason TEXT,
    patterns_json TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (session_id) REFERENCES sessions(id)
  );

  CREATE INDEX IF NOT EXISTS idx_records_session ON records(session_id);
  CREATE INDEX IF NOT EXISTS idx_analysis_session ON analysis_logs(session_id);
`);

// 세션 관리
export function createSession(name: string, siteUrl?: string): number {
  const stmt = db.prepare(`
    INSERT INTO sessions (name, site_url) VALUES (?, ?)
  `);
  const result = stmt.run(name, siteUrl || null);
  return result.lastInsertRowid as number;
}

export function getSessions(): { id: number; name: string; siteUrl: string | null; createdAt: string; recordCount: number }[] {
  const stmt = db.prepare(`
    SELECT s.id, s.name, s.site_url as siteUrl, s.created_at as createdAt,
           (SELECT COUNT(*) FROM records WHERE session_id = s.id) as recordCount
    FROM sessions s
    ORDER BY s.created_at DESC
  `);
  return stmt.all() as any[];
}

export function getSession(id: number): { id: number; name: string; siteUrl: string | null } | null {
  const stmt = db.prepare('SELECT id, name, site_url as siteUrl FROM sessions WHERE id = ?');
  return stmt.get(id) as any;
}

export function deleteSession(id: number): boolean {
  db.prepare('DELETE FROM records WHERE session_id = ?').run(id);
  db.prepare('DELETE FROM analysis_logs WHERE session_id = ?').run(id);
  const result = db.prepare('DELETE FROM sessions WHERE id = ?').run(id);
  return result.changes > 0;
}

// 기록 관리
export function addRecord(sessionId: number, result: Choice, predicted?: Choice): number {
  // 다음 라운드 번호
  const countStmt = db.prepare('SELECT COUNT(*) as cnt FROM records WHERE session_id = ?');
  const count = (countStmt.get(sessionId) as any).cnt;
  const roundNumber = count + 1;

  const isCorrect = predicted !== undefined ? (result === predicted ? 1 : 0) : null;

  const stmt = db.prepare(`
    INSERT INTO records (session_id, round_number, result, predicted, is_correct)
    VALUES (?, ?, ?, ?, ?)
  `);
  const res = stmt.run(sessionId, roundNumber, result, predicted || null, isCorrect);
  return res.lastInsertRowid as number;
}

export function getRecords(sessionId: number, limit?: number): { roundNumber: number; result: Choice; predicted: Choice | null; isCorrect: boolean | null }[] {
  let query = `
    SELECT round_number as roundNumber, result, predicted, is_correct as isCorrect
    FROM records WHERE session_id = ?
    ORDER BY round_number ASC
  `;
  if (limit) {
    query += ` LIMIT ${limit}`;
  }
  const stmt = db.prepare(query);
  return stmt.all(sessionId) as any[];
}

export function getSessionHistory(sessionId: number): Choice[] {
  const stmt = db.prepare(`
    SELECT result FROM records WHERE session_id = ? ORDER BY round_number ASC
  `);
  const rows = stmt.all(sessionId) as { result: Choice }[];
  return rows.map(r => r.result);
}

// 분석 로그
export function addAnalysisLog(
  sessionId: number,
  roundNumber: number,
  recommended: Choice,
  confidence: number,
  reason: string,
  patterns: any[]
): void {
  const stmt = db.prepare(`
    INSERT INTO analysis_logs (session_id, round_number, recommended, confidence, reason, patterns_json)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  stmt.run(sessionId, roundNumber, recommended, confidence, reason, JSON.stringify(patterns));
}

// 통계
export function getSessionStats(sessionId: number): {
  totalRounds: number;
  correctPredictions: number;
  wrongPredictions: number;
  accuracy: number;
  blueCount: number;
  redCount: number;
} {
  const stmt = db.prepare(`
    SELECT
      COUNT(*) as totalRounds,
      SUM(CASE WHEN is_correct = 1 THEN 1 ELSE 0 END) as correctPredictions,
      SUM(CASE WHEN is_correct = 0 THEN 1 ELSE 0 END) as wrongPredictions,
      SUM(CASE WHEN result = 'B' THEN 1 ELSE 0 END) as blueCount,
      SUM(CASE WHEN result = 'R' THEN 1 ELSE 0 END) as redCount
    FROM records WHERE session_id = ?
  `);
  const row = stmt.get(sessionId) as any;

  const predicted = row.correctPredictions + row.wrongPredictions;
  const accuracy = predicted > 0 ? (row.correctPredictions / predicted) * 100 : 0;

  return {
    totalRounds: row.totalRounds || 0,
    correctPredictions: row.correctPredictions || 0,
    wrongPredictions: row.wrongPredictions || 0,
    accuracy,
    blueCount: row.blueCount || 0,
    redCount: row.redCount || 0
  };
}

export default db;
