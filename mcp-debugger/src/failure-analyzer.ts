#!/usr/bin/env node
/**
 * Failure Analyzer Worker
 * task_queue의 실패한 작업을 분석하여 코드 수정 목록 생성
 */

import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';

// 경로 설정
const FRONTEND_DB_PATH = path.join(process.cwd(), '..', 'trend-video-frontend', 'data', 'database.sqlite');
const TASKS_PATH = path.join(process.cwd(), '..', 'trend-video-backend', 'tasks');
const OUTPUT_PATH = path.join(process.cwd(), 'fix-suggestions.json');

interface FailedTask {
  task_id: string;
  type: string;
  status: string;
  error: string | null;
  created_at: string;
  completed_at: string | null;
  user_id: string;
  metadata: string | null;
}

interface ErrorPattern {
  pattern: RegExp;
  category: string;
  suggestion: string;
  codeLocation?: string;
}

interface FixSuggestion {
  task_id: string;
  task_type: string;
  error_category: string;
  error_message: string;
  suggestion: string;
  code_location: string | null;
  log_file: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  created_at: string;
}

// 에러 패턴 정의
const ERROR_PATTERNS: ErrorPattern[] = [
  // Python 모듈 에러
  {
    pattern: /ModuleNotFoundError: No module named '(.+)'/,
    category: 'python_module',
    suggestion: '파이썬 모듈 설치 필요: pip install $1',
    codeLocation: 'trend-video-backend/requirements.txt'
  },
  // API 키 에러
  {
    pattern: /(?:API key|api_key|apiKey)\s*(?:is|not|invalid|missing)/i,
    category: 'api_key',
    suggestion: 'API 키 확인 필요. .env 파일에서 해당 API 키가 올바르게 설정되어 있는지 확인',
    codeLocation: '.env'
  },
  // 파일 없음 에러
  {
    pattern: /(?:ENOENT|FileNotFoundError|No such file|not found).*['"](.+)['"]/i,
    category: 'file_not_found',
    suggestion: '파일 경로 확인 필요: $1. 파일이 존재하는지 확인하거나 생성 로직 추가',
  },
  // JSON 파싱 에러
  {
    pattern: /(?:JSON\.parse|json\.loads|JSON parsing).*(?:error|failed|invalid)/i,
    category: 'json_parse',
    suggestion: 'JSON 파싱 오류. 데이터 형식 검증 또는 예외 처리 추가 필요',
  },
  // 데이터베이스 에러
  {
    pattern: /(?:SQLITE_ERROR|no such table|no such column):\s*(.+)/i,
    category: 'database',
    suggestion: 'DB 스키마 문제: $1. 마이그레이션 실행 또는 스키마 수정 필요',
    codeLocation: 'trend-video-frontend/schema-sqlite.sql'
  },
  // 네트워크 에러
  {
    pattern: /(?:ECONNREFUSED|ECONNRESET|ETIMEDOUT|fetch failed)/i,
    category: 'network',
    suggestion: '네트워크 연결 실패. 서버 상태 확인 또는 재시도 로직 추가 필요',
  },
  // 메모리 에러
  {
    pattern: /(?:out of memory|heap|ENOMEM)/i,
    category: 'memory',
    suggestion: '메모리 부족. 배치 처리 또는 스트리밍 처리로 변경 검토',
  },
  // 타임아웃 에러
  {
    pattern: /(?:timeout|timed out|too slow)/i,
    category: 'timeout',
    suggestion: '처리 시간 초과. 타임아웃 값 조정 또는 처리 최적화 필요',
  },
  // FFmpeg 에러
  {
    pattern: /(?:ffmpeg|ffprobe).*(?:error|failed|invalid)/i,
    category: 'ffmpeg',
    suggestion: 'FFmpeg 처리 오류. 입력 파일 포맷 확인 또는 FFmpeg 옵션 수정 필요',
    codeLocation: 'trend-video-backend/scripts/video_generator.py'
  },
  // 이미지 처리 에러
  {
    pattern: /(?:PIL|Pillow|image|ImageError).*(?:error|failed|cannot)/i,
    category: 'image',
    suggestion: '이미지 처리 오류. 이미지 포맷 또는 크기 확인 필요',
  },
  // TTS 에러
  {
    pattern: /(?:TTS|text.to.speech|elevenlabs|google.tts).*(?:error|failed)/i,
    category: 'tts',
    suggestion: 'TTS 처리 오류. API 키, 텍스트 길이, 또는 요청 제한 확인 필요',
  },
  // AI API 에러
  {
    pattern: /(?:OpenAI|Claude|Anthropic|Gemini).*(?:error|failed|rate.limit)/i,
    category: 'ai_api',
    suggestion: 'AI API 오류. API 키, 요청 제한, 또는 토큰 수 확인 필요',
  },
  // 권한 에러 (403은 단독 또는 HTTP 컨텍스트에서만)
  {
    pattern: /(?:EACCES|Permission denied|forbidden|\b403\b.*(?:error|forbidden|denied))/i,
    category: 'permission',
    suggestion: '권한 오류. 파일/디렉토리 권한 또는 API 접근 권한 확인 필요',
  },
  // 프로세스 종료 에러
  {
    pattern: /(?:Python 프로세스|process).*(?:코드|code)\s*(\d+)/,
    category: 'process_exit',
    suggestion: '프로세스가 비정상 종료됨 (코드: $1). 로그 상세 분석 필요',
  },
  // HTML 응답 에러 (API가 HTML 반환)
  {
    pattern: /<!DOCTYPE html>|<html|Unexpected token '<'/i,
    category: 'html_response',
    suggestion: 'API가 HTML을 반환함. 엔드포인트 URL 또는 인증 상태 확인 필요',
  },
];

// 우선순위 판단
function getPriority(category: string, errorMessage: string): 'critical' | 'high' | 'medium' | 'low' {
  const criticalCategories = ['database', 'api_key', 'python_module'];
  const highCategories = ['ai_api', 'tts', 'ffmpeg', 'process_exit'];
  const mediumCategories = ['network', 'timeout', 'file_not_found', 'json_parse'];

  if (criticalCategories.includes(category)) return 'critical';
  if (highCategories.includes(category)) return 'high';
  if (mediumCategories.includes(category)) return 'medium';
  return 'low';
}

class FailureAnalyzer {
  private db: Database.Database | null = null;
  private suggestions: FixSuggestion[] = [];

  constructor() {
    try {
      if (fs.existsSync(FRONTEND_DB_PATH)) {
        this.db = new Database(FRONTEND_DB_PATH, { readonly: true });
      } else {
        console.error(`❌ 데이터베이스를 찾을 수 없습니다: ${FRONTEND_DB_PATH}`);
      }
    } catch (error: any) {
      console.error(`❌ DB 연결 실패: ${error.message}`);
    }
  }

  /**
   * 실패한 작업 조회
   */
  getFailedTasks(): FailedTask[] {
    if (!this.db) return [];

    try {
      return this.db.prepare(`
        SELECT task_id, type, status, error, created_at, completed_at, user_id, metadata
        FROM task_queue
        WHERE status IN ('failed', 'timeout')
        ORDER BY completed_at DESC
        LIMIT 50
      `).all() as FailedTask[];
    } catch (error: any) {
      console.error(`❌ 쿼리 실패: ${error.message}`);
      return [];
    }
  }

  /**
   * 작업 로그 읽기
   */
  readTaskLogs(taskId: string): { file: string; content: string }[] {
    const taskPath = path.join(TASKS_PATH, taskId);
    const logs: { file: string; content: string }[] = [];

    if (!fs.existsSync(taskPath)) {
      return logs;
    }

    const logFiles = ['video.log', 'script.log', 'image_crawl.log', 'tts.log', 'error.log'];

    for (const logFile of logFiles) {
      const logPath = path.join(taskPath, logFile);
      if (fs.existsSync(logPath)) {
        try {
          const content = fs.readFileSync(logPath, 'utf-8');
          logs.push({ file: logFile, content });
        } catch {
          // 읽기 실패 무시
        }
      }
    }

    return logs;
  }

  /**
   * 에러 패턴 분석
   */
  analyzeError(errorText: string): { category: string; suggestion: string; codeLocation: string | null } | null {
    for (const { pattern, category, suggestion, codeLocation } of ERROR_PATTERNS) {
      const match = errorText.match(pattern);
      if (match) {
        // 매칭된 그룹으로 suggestion 치환
        let finalSuggestion = suggestion;
        for (let i = 1; i < match.length; i++) {
          finalSuggestion = finalSuggestion.replace(`$${i}`, match[i] || '');
        }
        return {
          category,
          suggestion: finalSuggestion,
          codeLocation: codeLocation || null
        };
      }
    }
    return null;
  }

  /**
   * 작업 분석
   */
  analyzeTask(task: FailedTask): FixSuggestion[] {
    const suggestions: FixSuggestion[] = [];
    const logs = this.readTaskLogs(task.task_id);

    // DB에 저장된 에러 메시지 분석
    if (task.error) {
      const analysis = this.analyzeError(task.error);
      if (analysis) {
        suggestions.push({
          task_id: task.task_id,
          task_type: task.type,
          error_category: analysis.category,
          error_message: task.error.substring(0, 500),
          suggestion: analysis.suggestion,
          code_location: analysis.codeLocation,
          log_file: 'task_queue.error',
          priority: getPriority(analysis.category, task.error),
          created_at: new Date().toISOString()
        });
      }
    }

    // 로그 파일 분석
    for (const log of logs) {
      // 마지막 100줄만 분석
      const lines = log.content.split('\n').slice(-100);

      for (const line of lines) {
        if (line.length < 10) continue; // 너무 짧은 줄 무시

        const analysis = this.analyzeError(line);
        if (analysis) {
          // 중복 제거
          const exists = suggestions.some(s =>
            s.error_category === analysis.category &&
            s.error_message.includes(line.substring(0, 50))
          );

          if (!exists) {
            suggestions.push({
              task_id: task.task_id,
              task_type: task.type,
              error_category: analysis.category,
              error_message: line.substring(0, 500),
              suggestion: analysis.suggestion,
              code_location: analysis.codeLocation,
              log_file: log.file,
              priority: getPriority(analysis.category, line),
              created_at: new Date().toISOString()
            });
          }
        }
      }
    }

    return suggestions;
  }

  /**
   * 전체 분석 실행
   */
  async analyze(): Promise<FixSuggestion[]> {
    this.suggestions = [];

    const tasks = this.getFailedTasks();
    console.log(`\n🔍 분석 대상: ${tasks.length}개 실패/타임아웃 작업\n`);

    for (const task of tasks) {
      const taskSuggestions = this.analyzeTask(task);
      if (taskSuggestions.length > 0) {
        console.log(`  📋 ${task.task_id.substring(0, 8)}... (${task.type}|${task.status})`);
        console.log(`     → ${taskSuggestions.length}개 수정 제안 생성`);
        this.suggestions.push(...taskSuggestions);
      }
    }

    return this.suggestions;
  }

  /**
   * 결과 저장
   */
  saveResults(): void {
    // 우선순위별 정렬
    const sorted = this.suggestions.sort((a, b) => {
      const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });

    // 카테고리별 집계
    const byCategory: Record<string, number> = {};
    for (const s of sorted) {
      byCategory[s.error_category] = (byCategory[s.error_category] || 0) + 1;
    }

    const output = {
      generated_at: new Date().toISOString(),
      total_suggestions: sorted.length,
      by_category: byCategory,
      suggestions: sorted
    };

    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2));
    console.log(`\n✅ 수정 제안 저장됨: ${OUTPUT_PATH}`);
  }

  /**
   * 리포트 출력
   */
  printReport(): void {
    console.log('\n' + '═'.repeat(70));
    console.log('📊 Failure Analysis Report');
    console.log('═'.repeat(70));

    // 우선순위별 집계
    const byCritical = this.suggestions.filter(s => s.priority === 'critical');
    const byHigh = this.suggestions.filter(s => s.priority === 'high');
    const byMedium = this.suggestions.filter(s => s.priority === 'medium');
    const byLow = this.suggestions.filter(s => s.priority === 'low');

    console.log(`\n  🔴 Critical: ${byCritical.length}개`);
    console.log(`  🟠 High: ${byHigh.length}개`);
    console.log(`  🟡 Medium: ${byMedium.length}개`);
    console.log(`  🟢 Low: ${byLow.length}개`);
    console.log(`\n  총 수정 제안: ${this.suggestions.length}개`);

    // Critical/High 상세 출력
    if (byCritical.length > 0 || byHigh.length > 0) {
      console.log('\n' + '─'.repeat(70));
      console.log('⚠️  우선 처리 필요 (Critical/High):');
      console.log('─'.repeat(70));

      for (const s of [...byCritical, ...byHigh].slice(0, 10)) {
        const emoji = s.priority === 'critical' ? '🔴' : '🟠';
        console.log(`\n${emoji} [${s.error_category}] ${s.task_id.substring(0, 8)}...`);
        console.log(`   에러: ${s.error_message.substring(0, 80)}...`);
        console.log(`   제안: ${s.suggestion}`);
        if (s.code_location) {
          console.log(`   위치: ${s.code_location}`);
        }
      }
    }

    // 카테고리별 요약
    const categories = new Map<string, number>();
    for (const s of this.suggestions) {
      categories.set(s.error_category, (categories.get(s.error_category) || 0) + 1);
    }

    console.log('\n' + '─'.repeat(70));
    console.log('📈 카테고리별 분포:');
    console.log('─'.repeat(70));

    const sortedCategories = [...categories.entries()].sort((a, b) => b[1] - a[1]);
    for (const [category, count] of sortedCategories) {
      const bar = '█'.repeat(Math.min(count, 30));
      console.log(`  ${category.padEnd(15)} ${bar} ${count}`);
    }

    console.log('\n' + '═'.repeat(70));
    console.log(`📁 상세 결과: ${OUTPUT_PATH}`);
    console.log('═'.repeat(70) + '\n');
  }

  close(): void {
    if (this.db) {
      this.db.close();
    }
  }
}

// CLI 실행
async function main() {
  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║           🔬 Failure Analyzer - 실패 작업 분석기                 ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝');

  const analyzer = new FailureAnalyzer();

  try {
    await analyzer.analyze();
    analyzer.saveResults();
    analyzer.printReport();
  } finally {
    analyzer.close();
  }
}

main().catch(console.error);

export { FailureAnalyzer };
