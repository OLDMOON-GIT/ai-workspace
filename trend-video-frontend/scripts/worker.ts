#!/usr/bin/env ts-node
/**
 * Worker Script
 * 에러 처리 및 리포트 생성
 *
 * Usage:
 *   npm run worker -- 리포트
 */

import Database from 'better-sqlite3';
import path from 'path';
import os from 'os';
import fs from 'fs';

// MCP Debugger DB 경로
const homeDir = os.homedir();
const dataDir = path.join(homeDir, '.mcp-debugger');
const dbPath = path.join(dataDir, 'error-queue.db');

interface ErrorItem {
  id: number;
  error_hash: string;
  error_type: string;
  error_message: string;
  stack_trace?: string;
  file_path?: string;
  line_number?: number;
  source: string;
  severity: string;
  status: string;
  created_at: string;
  updated_at: string;
}

// 에러 통계 조회
function getErrorStats() {
  if (!fs.existsSync(dbPath)) {
    return {
      total: 0,
      pending: 0,
      resolved: 0,
      ignored: 0,
      byType: {},
      bySeverity: {}
    };
  }

  const db = new Database(dbPath, { readonly: true });

  const stats = {
    total: 0,
    pending: 0,
    resolved: 0,
    ignored: 0,
    byType: {} as Record<string, number>,
    bySeverity: {} as Record<string, number>
  };

  try {
    // 전체 에러 수
    const totalResult = db.prepare('SELECT COUNT(*) as count FROM error_queue').get() as { count: number };
    stats.total = totalResult.count;

    // 상태별 에러 수
    const statusCounts = db.prepare(`
      SELECT status, COUNT(*) as count
      FROM error_queue
      GROUP BY status
    `).all() as Array<{ status: string; count: number }>;

    for (const row of statusCounts) {
      if (row.status === 'pending') stats.pending = row.count;
      else if (row.status === 'resolved') stats.resolved = row.count;
      else if (row.status === 'ignored') stats.ignored = row.count;
    }

    // 에러 타입별 수
    const typeCounts = db.prepare(`
      SELECT error_type, COUNT(*) as count
      FROM error_queue
      GROUP BY error_type
    `).all() as Array<{ error_type: string; count: number }>;

    for (const row of typeCounts) {
      stats.byType[row.error_type] = row.count;
    }

    // 심각도별 수
    const severityCounts = db.prepare(`
      SELECT severity, COUNT(*) as count
      FROM error_queue
      GROUP BY severity
    `).all() as Array<{ severity: string; count: number }>;

    for (const row of severityCounts) {
      stats.bySeverity[row.severity] = row.count;
    }
  } finally {
    db.close();
  }

  return stats;
}

// 최근 에러 조회
function getRecentErrors(limit: number = 10) {
  if (!fs.existsSync(dbPath)) {
    return [];
  }

  const db = new Database(dbPath, { readonly: true });
  let errors: ErrorItem[] = [];

  try {
    errors = db.prepare(`
      SELECT *
      FROM error_queue
      WHERE status = 'pending'
      ORDER BY created_at DESC
      LIMIT ?
    `).all(limit) as ErrorItem[];
  } finally {
    db.close();
  }

  return errors;
}

// 리포트 생성
function generateReport() {
  const stats = getErrorStats();
  const recentErrors = getRecentErrors(10);

  console.clear();
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('                      에러 모니터링 리포트');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log();

  // 전체 통계
  console.log('📊 전체 통계');
  console.log('─────────────────────────────────────────────────────────────');
  console.log(`   전체 에러:    ${stats.total.toString().padStart(4)} 개`);
  console.log(`   대기 중:      ${stats.pending.toString().padStart(4)} 개`);
  console.log(`   처리 완료:    ${stats.resolved.toString().padStart(4)} 개`);
  console.log(`   무시됨:       ${stats.ignored.toString().padStart(4)} 개`);
  console.log();

  // 심각도별 통계
  if (Object.keys(stats.bySeverity).length > 0) {
    console.log('🔥 심각도별');
    console.log('─────────────────────────────────────────────────────────────');
    for (const [severity, count] of Object.entries(stats.bySeverity)) {
      const emoji = severity === 'critical' ? '🔴' : severity === 'error' ? '🟡' : '🔵';
      console.log(`   ${emoji} ${severity.padEnd(10)}: ${count.toString().padStart(4)} 개`);
    }
    console.log();
  }

  // 타입별 통계
  if (Object.keys(stats.byType).length > 0) {
    console.log('📋 에러 타입별');
    console.log('─────────────────────────────────────────────────────────────');
    for (const [type, count] of Object.entries(stats.byType)) {
      console.log(`   ${type.padEnd(20)}: ${count.toString().padStart(4)} 개`);
    }
    console.log();
  }

  // 최근 에러 목록
  if (recentErrors.length > 0) {
    console.log('🆕 최근 대기 중인 에러 (최대 10개)');
    console.log('─────────────────────────────────────────────────────────────');
    for (const error of recentErrors) {
      const severityEmoji = error.severity === 'critical' ? '🔴' : error.severity === 'error' ? '🟡' : '🔵';
      console.log(`   ${severityEmoji} [${error.error_type}] ${error.error_message.substring(0, 50)}${error.error_message.length > 50 ? '...' : ''}`);
      if (error.file_path) {
        console.log(`      위치: ${error.file_path}${error.line_number ? `:${error.line_number}` : ''}`);
      }
      console.log(`      시간: ${new Date(error.created_at).toLocaleString('ko-KR')}`);
      console.log();
    }
  } else {
    console.log('✅ 대기 중인 에러가 없습니다!');
    console.log();
  }

  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`마지막 업데이트: ${new Date().toLocaleString('ko-KR')}`);
  console.log('Ctrl+C를 눌러 종료');
  console.log('═══════════════════════════════════════════════════════════════');
}

// Sleep 함수
function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 메인 함수
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === '리포트' || command === 'report') {
    console.log('🔍 에러 리포트를 지속적으로 생성합니다...');
    console.log('   (5초마다 자동 업데이트)');
    console.log();

    // 무한 루프로 계속 실행
    while (true) {
      generateReport();
      await sleep(5000);
    }
  } else {
    console.error('알 수 없는 명령:', command);
    console.error('사용법: npm run worker -- 리포트');
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Worker error:', error);
  process.exit(1);
});
