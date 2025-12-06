/**
 * Spec Parser
 * 기획서(Markdown/Text)에서 SPEC 정보를 추출하여 BTS에 등록
 *
 * 지원 포맷:
 * - Markdown (.md)
 * - 일반 텍스트 (.txt)
 * - JSON 기획서 (.json)
 *
 * 추출 항목:
 * - 기능 제목
 * - 요구사항 목록
 * - UI 페이지/컴포넌트
 * - API 엔드포인트
 * - 데이터베이스 테이블
 */

import fs from 'fs';
import path from 'path';
import { bugCreate } from './bug-bridge.js';

export interface ParsedSpec {
  title: string;
  summary: string;
  requirements: string[];
  uiPages: string[];
  apiEndpoints: string[];
  dbTables: string[];
  dependencies: string[];
  priority: 'P0' | 'P1' | 'P2' | 'P3';
}

export interface SpecParserResult {
  success: boolean;
  specs: ParsedSpec[];
  errors: string[];
}

/**
 * 기획서 파일 파싱
 */
export async function parseSpecFile(filePath: string): Promise<SpecParserResult> {
  const result: SpecParserResult = {
    success: false,
    specs: [],
    errors: []
  };

  try {
    if (!fs.existsSync(filePath)) {
      result.errors.push(`파일을 찾을 수 없습니다: ${filePath}`);
      return result;
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const ext = path.extname(filePath).toLowerCase();

    switch (ext) {
      case '.md':
        result.specs = parseMarkdown(content);
        break;
      case '.txt':
        result.specs = parseText(content);
        break;
      case '.json':
        result.specs = parseJson(content);
        break;
      default:
        result.errors.push(`지원하지 않는 파일 형식: ${ext}`);
        return result;
    }

    result.success = result.specs.length > 0;
    if (!result.success) {
      result.errors.push('SPEC을 추출할 수 없습니다.');
    }
  } catch (error: any) {
    result.errors.push(`파싱 오류: ${error.message}`);
  }

  return result;
}

/**
 * Markdown 기획서 파싱
 */
function parseMarkdown(content: string): ParsedSpec[] {
  const specs: ParsedSpec[] = [];

  // 헤딩 기반으로 섹션 분리 (# 또는 ##)
  const sections = content.split(/^#{1,2}\s+/m).filter(s => s.trim());

  for (const section of sections) {
    const lines = section.split('\n');
    const title = lines[0].trim();

    // 빈 제목 무시
    if (!title) continue;

    const spec = extractSpecFromSection(title, lines.slice(1).join('\n'));
    if (spec) {
      specs.push(spec);
    }
  }

  // 섹션이 없는 경우 전체 문서를 하나의 SPEC으로
  if (specs.length === 0 && content.trim()) {
    const firstLine = content.split('\n')[0].replace(/^#+\s*/, '').trim();
    const spec = extractSpecFromSection(
      firstLine || '기획서 SPEC',
      content
    );
    if (spec) {
      specs.push(spec);
    }
  }

  return specs;
}

/**
 * 일반 텍스트 기획서 파싱
 */
function parseText(content: string): ParsedSpec[] {
  const specs: ParsedSpec[] = [];

  // 줄 바꿈 기준으로 항목 추출
  const lines = content.split('\n').filter(l => l.trim());

  if (lines.length === 0) return specs;

  // 첫 번째 줄을 제목으로
  const title = lines[0].replace(/^[\d.\-*•]+\s*/, '').trim();
  const spec = extractSpecFromSection(title, lines.slice(1).join('\n'));

  if (spec) {
    specs.push(spec);
  }

  return specs;
}

/**
 * JSON 기획서 파싱
 */
function parseJson(content: string): ParsedSpec[] {
  const specs: ParsedSpec[] = [];

  try {
    const data = JSON.parse(content);

    // 배열인 경우 각 항목을 SPEC으로
    const items = Array.isArray(data) ? data : [data];

    for (const item of items) {
      const spec: ParsedSpec = {
        title: item.title || item.name || 'JSON SPEC',
        summary: item.summary || item.description || '',
        requirements: extractArray(item.requirements || item.features || []),
        uiPages: extractArray(item.uiPages || item.pages || item.ui || []),
        apiEndpoints: extractArray(item.apiEndpoints || item.apis || item.endpoints || []),
        dbTables: extractArray(item.dbTables || item.tables || item.database || []),
        dependencies: extractArray(item.dependencies || item.deps || []),
        priority: normalizePriority(item.priority)
      };

      specs.push(spec);
    }
  } catch (error: any) {
    console.error('JSON 파싱 오류:', error.message);
  }

  return specs;
}

/**
 * 섹션에서 SPEC 정보 추출
 */
function extractSpecFromSection(title: string, content: string): ParsedSpec | null {
  const requirements: string[] = [];
  const uiPages: string[] = [];
  const apiEndpoints: string[] = [];
  const dbTables: string[] = [];
  const dependencies: string[] = [];

  const lines = content.split('\n');
  let summaryLines: string[] = [];
  let currentSection = 'summary';

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // 섹션 헤더 감지
    const lowerLine = trimmed.toLowerCase();
    if (/^#{2,}\s*/.test(trimmed) || /^[\*\-]\s*\*\*/.test(trimmed)) {
      if (lowerLine.includes('요구사항') || lowerLine.includes('requirement') || lowerLine.includes('기능')) {
        currentSection = 'requirements';
        continue;
      }
      if (lowerLine.includes('ui') || lowerLine.includes('페이지') || lowerLine.includes('화면')) {
        currentSection = 'ui';
        continue;
      }
      if (lowerLine.includes('api') || lowerLine.includes('엔드포인트') || lowerLine.includes('endpoint')) {
        currentSection = 'api';
        continue;
      }
      if (lowerLine.includes('db') || lowerLine.includes('테이블') || lowerLine.includes('데이터베이스') || lowerLine.includes('table')) {
        currentSection = 'db';
        continue;
      }
      if (lowerLine.includes('의존') || lowerLine.includes('depend')) {
        currentSection = 'dependencies';
        continue;
      }
    }

    // 리스트 아이템 추출
    const listItem = trimmed.replace(/^[\d.\-*•]+\s*/, '').trim();
    if (!listItem) continue;

    switch (currentSection) {
      case 'summary':
        summaryLines.push(listItem);
        break;
      case 'requirements':
        requirements.push(listItem);
        break;
      case 'ui':
        uiPages.push(listItem);
        break;
      case 'api':
        apiEndpoints.push(listItem);
        break;
      case 'db':
        dbTables.push(listItem);
        break;
      case 'dependencies':
        dependencies.push(listItem);
        break;
    }
  }

  // 패턴 기반 추출 (섹션 헤더가 없는 경우)
  if (uiPages.length === 0) {
    uiPages.push(...extractByPattern(content, [
      /\/[a-z][a-z0-9\-\/]*/gi,  // URL 경로
      /[A-Z][a-zA-Z]*Page/g,      // Page 컴포넌트
      /[A-Z][a-zA-Z]*Screen/g,    // Screen 컴포넌트
    ]));
  }

  if (apiEndpoints.length === 0) {
    apiEndpoints.push(...extractByPattern(content, [
      /(?:GET|POST|PUT|PATCH|DELETE)\s+\/api\/[^\s]+/gi,
      /\/api\/[a-z][a-z0-9\-\/]*/gi,
    ]));
  }

  if (dbTables.length === 0) {
    dbTables.push(...extractByPattern(content, [
      /(?:CREATE TABLE|ALTER TABLE|FROM|JOIN)\s+([a-z_][a-z0-9_]*)/gi,
      /`([a-z_][a-z0-9_]*)`\s+테이블/gi,
    ]));
  }

  // 요약이 없으면 요구사항에서 첫 몇 개를 사용
  let summary = summaryLines.slice(0, 3).join('\n');
  if (!summary && requirements.length > 0) {
    summary = requirements.slice(0, 3).join('\n');
  }

  if (!title && !summary) return null;

  return {
    title,
    summary,
    requirements: [...new Set(requirements)],
    uiPages: [...new Set(uiPages)],
    apiEndpoints: [...new Set(apiEndpoints)],
    dbTables: [...new Set(dbTables)],
    dependencies: [...new Set(dependencies)],
    priority: determinePriority(title, summary, requirements)
  };
}

/**
 * 정규식 패턴으로 추출
 */
function extractByPattern(content: string, patterns: RegExp[]): string[] {
  const results: string[] = [];

  for (const pattern of patterns) {
    const matches = content.match(pattern) || [];
    results.push(...matches.map(m => m.trim()));
  }

  return [...new Set(results)];
}

/**
 * 배열 추출 헬퍼
 */
function extractArray(value: any): string[] {
  if (Array.isArray(value)) {
    return value.map(v => String(v).trim()).filter(v => v);
  }
  if (typeof value === 'string') {
    return value.split(',').map(v => v.trim()).filter(v => v);
  }
  return [];
}

/**
 * 우선순위 정규화
 */
function normalizePriority(value: any): 'P0' | 'P1' | 'P2' | 'P3' {
  const str = String(value || '').toUpperCase();
  if (str.includes('0') || str.includes('CRITICAL') || str.includes('긴급')) return 'P0';
  if (str.includes('1') || str.includes('HIGH') || str.includes('높음')) return 'P1';
  if (str.includes('3') || str.includes('LOW') || str.includes('낮음')) return 'P3';
  return 'P2';
}

/**
 * 우선순위 결정
 */
function determinePriority(title: string, summary: string, requirements: string[]): 'P0' | 'P1' | 'P2' | 'P3' {
  const combined = `${title} ${summary} ${requirements.join(' ')}`.toLowerCase();

  // P0 키워드
  if (/긴급|critical|장애|보안|취약|urgent|blocking/i.test(combined)) {
    return 'P0';
  }

  // P1 키워드
  if (/중요|important|핵심|필수|must|essential|high/i.test(combined)) {
    return 'P1';
  }

  // P3 키워드
  if (/개선|nice.?to.?have|optional|low|나중에|later/i.test(combined)) {
    return 'P3';
  }

  return 'P2';
}

/**
 * SPEC을 BTS에 등록
 */
export async function registerSpecToBts(spec: ParsedSpec, sourcePath?: string): Promise<string | null> {
  try {
    const metadata: Record<string, any> = {
      source: sourcePath || 'spec-parser',
      requirements: spec.requirements,
      uiPages: spec.uiPages,
      apiEndpoints: spec.apiEndpoints,
      dbTables: spec.dbTables,
      dependencies: spec.dependencies
    };

    const result = await bugCreate({
      title: spec.title,
      summary: spec.summary,
      metadata
    });

    console.log(`✅ SPEC 등록: ${spec.title}`);
    return result?.id || null;
  } catch (error: any) {
    console.error(`❌ SPEC 등록 실패: ${error.message}`);
    return null;
  }
}

/**
 * 기획서 파일에서 SPEC 추출 후 BTS 등록
 */
export async function processSpecFile(filePath: string): Promise<{
  success: boolean;
  registered: number;
  failed: number;
  specs: Array<{ title: string; id: string | null }>;
}> {
  const result = {
    success: false,
    registered: 0,
    failed: 0,
    specs: [] as Array<{ title: string; id: string | null }>
  };

  const parsed = await parseSpecFile(filePath);

  if (!parsed.success) {
    console.error('파싱 실패:', parsed.errors.join(', '));
    return result;
  }

  for (const spec of parsed.specs) {
    const id = await registerSpecToBts(spec, filePath);
    result.specs.push({ title: spec.title, id });

    if (id) {
      result.registered++;
    } else {
      result.failed++;
    }
  }

  result.success = result.registered > 0;
  return result;
}

// CLI 실행
if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log(`
사용법: npx tsx spec-parser.ts <파일경로>

지원 형식:
  - Markdown (.md)
  - 텍스트 (.txt)
  - JSON (.json)

예시:
  npx tsx spec-parser.ts ./docs/feature-spec.md
  npx tsx spec-parser.ts ./requirements.json
`);
    process.exit(1);
  }

  const filePath = path.resolve(args[0]);

  processSpecFile(filePath).then(result => {
    if (result.success) {
      console.log(`\n✅ 완료: ${result.registered}개 SPEC 등록, ${result.failed}개 실패`);
      for (const spec of result.specs) {
        console.log(`  - ${spec.title} ${spec.id ? `(${spec.id})` : '(실패)'}`);
      }
    } else {
      console.error('\n❌ SPEC 등록 실패');
      process.exit(1);
    }
  }).catch(error => {
    console.error('오류:', error.message);
    process.exit(1);
  });
}

export default { parseSpecFile, processSpecFile, registerSpecToBts };
