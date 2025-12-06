/**
 * 컬럼 유효성 검사 통합 테스트
 *
 * ⛔ 이 테스트는 삭제/변경된 컬럼이 코드에서 잘못 사용되는 것을 방지합니다.
 *
 * 삭제된 컬럼 목록:
 * - content.tts_voice, type, format, task_id, script_content, video_path
 * - content.use_claude_local (→ use_local_chrome)
 * - task.type (→ prompt_format)
 * - task.product_url (삭제됨)
 *
 * PK 컬럼명 주의:
 * - coupang_product: coupang_id (id 아님!)
 * - youtube_channel_setting: setting_id (id 아님!)
 */

import * as fs from 'fs';
import * as path from 'path';

// 검사할 디렉토리
const SRC_DIR = path.join(__dirname, '..');

// 삭제된 컬럼 패턴 (SQL 쿼리에서 사용 금지)
const DELETED_COLUMN_PATTERNS = [
  // content 테이블 삭제된 컬럼
  { pattern: /INSERT\s+INTO\s+content\s*\([^)]*\bvideo_path\b/gi, message: 'content.video_path 컬럼 없음 - 경로는 task_id에서 계산' },
  { pattern: /UPDATE\s+content\s+SET\s+[^W]*\bvideo_path\s*=/gi, message: 'content.video_path 컬럼 없음' },
  { pattern: /WHERE\s+[^;]*\bvideo_path\s+IS\s+NOT\s+NULL/gi, message: 'content.video_path 컬럼 없음' },
  { pattern: /INSERT\s+INTO\s+content\s*\([^)]*\btts_voice\b/gi, message: 'content.tts_voice 컬럼 삭제됨' },
  { pattern: /INSERT\s+INTO\s+content\s*\([^)]*\bscript_content\b/gi, message: 'content.script_content 컬럼 삭제됨' },
  { pattern: /INSERT\s+INTO\s+content\s*\([^)]*\buse_claude_local\b/gi, message: 'content.use_claude_local → use_local_chrome' },
  { pattern: /WHERE\s+[^;]*content[^;]*\btype\s*=\s*[?'"]/gi, message: 'content.type 컬럼 삭제됨' },

  // task 테이블
  { pattern: /UPDATE\s+task\s+SET\s+[^W]*\btype\s*=/gi, message: 'task.type → prompt_format' },
  { pattern: /WHERE\s+task\.[^;]*\btype\s*=/gi, message: 'task.type → prompt_format' },

  // PK 컬럼명 오류
  { pattern: /INSERT\s+INTO\s+coupang_product\s*\(\s*id\s*,/gi, message: 'coupang_product PK는 coupang_id (id 아님!)' },
  { pattern: /INSERT\s+INTO\s+youtube_channel_setting\s*\(\s*id\s*,/gi, message: 'youtube_channel_setting PK는 setting_id (id 아님!)' },
  { pattern: /REFERENCES\s+youtube_channel_setting\s*\(\s*id\s*\)/gi, message: 'youtube_channel_setting PK는 setting_id' },
  { pattern: /REFERENCES\s+coupang_product\s*\(\s*id\s*\)/gi, message: 'coupang_product PK는 coupang_id' },
];

// 허용되는 파일 (주석, 경고 메시지 등)
const ALLOWED_FILES = [
  'column-validation.test.ts',  // 이 테스트 파일
  'sqlite.ts',                   // 경고 주석
  'CRITICAL_FEATURES.md',        // 문서
];

// 재귀적으로 파일 검색
function findFiles(dir: string, extensions: string[]): string[] {
  const files: string[] = [];

  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
          files.push(...findFiles(fullPath, extensions));
        }
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name);
        if (extensions.includes(ext)) {
          files.push(fullPath);
        }
      }
    }
  } catch (e) {
    // 디렉토리 접근 오류 무시
  }

  return files;
}

// 파일 내용에서 패턴 검사
function checkFile(filePath: string, patterns: typeof DELETED_COLUMN_PATTERNS): { file: string; line: number; message: string }[] {
  const fileName = path.basename(filePath);

  // 허용된 파일 스킵
  if (ALLOWED_FILES.some(allowed => fileName.includes(allowed))) {
    return [];
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const violations: { file: string; line: number; message: string }[] = [];

  for (const { pattern, message } of patterns) {
    // 전체 파일에서 매칭
    const matches = content.match(pattern);
    if (matches) {
      // 라인 번호 찾기
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // 주석이 아닌 경우만 검사
        if (!line.trim().startsWith('//') && !line.trim().startsWith('*') && !line.trim().startsWith('/*')) {
          pattern.lastIndex = 0;
          if (pattern.test(line)) {
            violations.push({
              file: filePath,
              line: i + 1,
              message
            });
          }
        }
      }
    }
  }

  return violations;
}

describe('🔍 컬럼 유효성 검사', () => {
  const files = findFiles(SRC_DIR, ['.ts', '.tsx', '.js']);

  test('삭제된 컬럼이 SQL 쿼리에서 사용되지 않아야 함', () => {
    const allViolations: { file: string; line: number; message: string }[] = [];

    for (const file of files) {
      const violations = checkFile(file, DELETED_COLUMN_PATTERNS);
      allViolations.push(...violations);
    }

    if (allViolations.length > 0) {
      console.error('\n❌ 삭제된 컬럼 사용 발견:\n');
      for (const v of allViolations) {
        console.error(`  ${v.file}:${v.line}`);
        console.error(`    → ${v.message}\n`);
      }
    }

    expect(allViolations).toHaveLength(0);
  });

  test('coupang_product INSERT 문에서 coupang_id를 PK로 사용해야 함', () => {
    const pattern = /INSERT\s+INTO\s+coupang_product\s*\([^)]*\bcoupang_id\b/gi;
    let hasCorrectUsage = false;

    for (const file of files) {
      if (ALLOWED_FILES.some(a => file.includes(a))) continue;

      const content = fs.readFileSync(file, 'utf-8');
      if (pattern.test(content)) {
        hasCorrectUsage = true;
        break;
      }
    }

    // coupang_product INSERT가 있다면 올바른 형식이어야 함
    expect(hasCorrectUsage).toBe(true);
  });

  test('youtube_channel_setting INSERT 문에서 setting_id를 PK로 사용해야 함', () => {
    const pattern = /INSERT\s+INTO\s+youtube_channel_setting\s*\([^)]*\bsetting_id\b/gi;
    let hasCorrectUsage = false;

    for (const file of files) {
      if (ALLOWED_FILES.some(a => file.includes(a))) continue;

      const content = fs.readFileSync(file, 'utf-8');
      if (pattern.test(content)) {
        hasCorrectUsage = true;
        break;
      }
    }

    // youtube_channel_setting INSERT가 있다면 올바른 형식이어야 함
    expect(hasCorrectUsage).toBe(true);
  });

  test('task 테이블에서 prompt_format을 사용해야 함 (type 아님)', () => {
    const correctPattern = /task.*prompt_format/gi;
    let hasCorrectUsage = false;

    for (const file of files) {
      if (ALLOWED_FILES.some(a => file.includes(a))) continue;

      const content = fs.readFileSync(file, 'utf-8');
      if (correctPattern.test(content)) {
        hasCorrectUsage = true;
        break;
      }
    }

    expect(hasCorrectUsage).toBe(true);
  });
});

describe('📋 스키마 일관성 검사', () => {
  // trend-video-frontend/schema-sqlite.sql
  const schemaPath = path.join(__dirname, '../..', 'schema-sqlite.sql');

  test('schema-sqlite.sql 파일이 존재해야 함', () => {
    expect(fs.existsSync(schemaPath)).toBe(true);
  });

  test('content 테이블에 video_path 컬럼이 없어야 함', () => {
    const schema = fs.readFileSync(schemaPath, 'utf-8');
    const contentTableMatch = schema.match(/CREATE TABLE.*content\s*\([^;]+\);/is);

    if (contentTableMatch) {
      expect(contentTableMatch[0]).not.toMatch(/\bvideo_path\b/);
    }
  });

  test('content 테이블에 tts_voice 컬럼이 없어야 함', () => {
    const schema = fs.readFileSync(schemaPath, 'utf-8');
    const contentTableMatch = schema.match(/CREATE TABLE.*content\s*\([^;]+\);/is);

    if (contentTableMatch) {
      expect(contentTableMatch[0]).not.toMatch(/\btts_voice\b/);
    }
  });

  test('task 테이블에 prompt_format 컬럼이 있어야 함', () => {
    const schema = fs.readFileSync(schemaPath, 'utf-8');
    const taskTableMatch = schema.match(/CREATE TABLE.*task\s*\([^;]+\);/is);

    if (taskTableMatch) {
      expect(taskTableMatch[0]).toMatch(/\bprompt_format\b/);
    }
  });

  test('coupang_product 테이블의 PK가 coupang_id여야 함', () => {
    const schema = fs.readFileSync(schemaPath, 'utf-8');
    const tableMatch = schema.match(/CREATE TABLE.*coupang_product\s*\([^;]+\);/is);

    if (tableMatch) {
      expect(tableMatch[0]).toMatch(/coupang_id\s+TEXT\s+PRIMARY\s+KEY/i);
    }
  });

  test('youtube_channel_setting 테이블의 PK가 setting_id여야 함', () => {
    const schema = fs.readFileSync(schemaPath, 'utf-8');
    const tableMatch = schema.match(/CREATE TABLE.*youtube_channel_setting\s*\([^;]+\);/is);

    if (tableMatch) {
      expect(tableMatch[0]).toMatch(/setting_id\s+TEXT\s+PRIMARY\s+KEY/i);
    }
  });
});
