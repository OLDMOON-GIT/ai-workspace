#!/usr/bin/env node
/**
 * SPEC Parser (BTS-3189)
 * 기획서/마크다운 문서에서 SPEC을 추출하여 BTS에 등록
 *
 * 지원 형식:
 * - Markdown (.md)
 * - Text (.txt)
 * - JSON (.json) - 구조화된 스펙
 */

import * as fs from 'fs';
import * as path from 'path';
import { bugCreate } from '../bug-bridge.js';

interface ParsedSpec {
  title: string;
  summary: string;
  priority: 'P0' | 'P1' | 'P2' | 'P3';
  type: 'spec' | 'bug';
  metadata?: Record<string, unknown>;
}

// Markdown 헤딩 패턴
const HEADING_PATTERN = /^(#{1,6})\s+(.+)$/gm;

// 기능 요구사항 패턴
const FEATURE_PATTERNS = [
  /^[-*]\s*\[?\s*\]?\s*(.+기능.+)$/gim,
  /^[-*]\s*\[?\s*\]?\s*(.+구현.+)$/gim,
  /^[-*]\s*\[?\s*\]?\s*(.+추가.+)$/gim,
  /^[-*]\s*\[?\s*\]?\s*(.+수정.+)$/gim,
  /^[-*]\s*\[?\s*\]?\s*(.+개선.+)$/gim,
];

// 우선순위 키워드
const PRIORITY_KEYWORDS: Record<string, 'P0' | 'P1' | 'P2' | 'P3'> = {
  '긴급': 'P0',
  'critical': 'P0',
  'urgent': 'P0',
  '높음': 'P1',
  'high': 'P1',
  '중요': 'P1',
  '보통': 'P2',
  'medium': 'P2',
  'normal': 'P2',
  '낮음': 'P3',
  'low': 'P3',
};

export class SpecParser {
  /**
   * 파일에서 SPEC 추출
   */
  async parseFile(filePath: string): Promise<ParsedSpec[]> {
    const ext = path.extname(filePath).toLowerCase();
    const content = fs.readFileSync(filePath, 'utf-8');

    switch (ext) {
      case '.md':
        return this.parseMarkdown(content, filePath);
      case '.json':
        return this.parseJson(content, filePath);
      case '.txt':
        return this.parseText(content, filePath);
      default:
        console.warn(`[SpecParser] 지원하지 않는 파일 형식: ${ext}`);
        return [];
    }
  }

  /**
   * Markdown 파싱
   */
  private parseMarkdown(content: string, sourcePath: string): ParsedSpec[] {
    const specs: ParsedSpec[] = [];
    const lines = content.split('\n');

    let currentSection = '';
    let currentContent: string[] = [];
    let inSpecBlock = false;

    for (const line of lines) {
      // 헤딩 감지
      const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
      if (headingMatch) {
        // 이전 섹션 저장
        if (currentSection && currentContent.length > 0) {
          const spec = this.createSpecFromSection(currentSection, currentContent.join('\n'), sourcePath);
          if (spec) specs.push(spec);
        }

        currentSection = headingMatch[2];
        currentContent = [];
        inSpecBlock = this.isSpecSection(currentSection);
        continue;
      }

      // SPEC 블록 내용 수집
      if (inSpecBlock && line.trim()) {
        currentContent.push(line);
      }

      // 기능 요구사항 라인 감지 (독립적)
      for (const pattern of FEATURE_PATTERNS) {
        const match = line.match(pattern);
        if (match && !inSpecBlock) {
          const spec = this.createSpecFromFeature(match[1], sourcePath);
          if (spec) specs.push(spec);
        }
      }
    }

    // 마지막 섹션 처리
    if (currentSection && currentContent.length > 0) {
      const spec = this.createSpecFromSection(currentSection, currentContent.join('\n'), sourcePath);
      if (spec) specs.push(spec);
    }

    return specs;
  }

  /**
   * JSON 파싱 (구조화된 스펙)
   */
  private parseJson(content: string, sourcePath: string): ParsedSpec[] {
    try {
      const data = JSON.parse(content);

      if (Array.isArray(data)) {
        return data.map(item => this.normalizeSpec(item, sourcePath)).filter(Boolean) as ParsedSpec[];
      }

      if (data.specs && Array.isArray(data.specs)) {
        return data.specs.map((item: unknown) => this.normalizeSpec(item, sourcePath)).filter(Boolean) as ParsedSpec[];
      }

      // 단일 스펙
      const spec = this.normalizeSpec(data, sourcePath);
      return spec ? [spec] : [];
    } catch (error) {
      console.error(`[SpecParser] JSON 파싱 오류: ${error}`);
      return [];
    }
  }

  /**
   * 텍스트 파싱
   */
  private parseText(content: string, sourcePath: string): ParsedSpec[] {
    const specs: ParsedSpec[] = [];
    const lines = content.split('\n').filter(line => line.trim());

    for (const line of lines) {
      // 번호가 있는 항목
      const numberedMatch = line.match(/^\d+[.)]\s*(.+)$/);
      if (numberedMatch) {
        const spec = this.createSpecFromFeature(numberedMatch[1], sourcePath);
        if (spec) specs.push(spec);
        continue;
      }

      // 불릿 포인트
      const bulletMatch = line.match(/^[-*•]\s*(.+)$/);
      if (bulletMatch) {
        const spec = this.createSpecFromFeature(bulletMatch[1], sourcePath);
        if (spec) specs.push(spec);
      }
    }

    return specs;
  }

  /**
   * SPEC 섹션인지 확인
   */
  private isSpecSection(title: string): boolean {
    const specKeywords = ['기능', '요구사항', 'spec', 'feature', 'requirement', '구현', '작업'];
    return specKeywords.some(keyword => title.toLowerCase().includes(keyword.toLowerCase()));
  }

  /**
   * 섹션에서 SPEC 생성
   */
  private createSpecFromSection(title: string, content: string, sourcePath: string): ParsedSpec | null {
    if (!title || content.trim().length < 10) return null;

    return {
      title: this.cleanTitle(title),
      summary: this.cleanSummary(content),
      priority: this.detectPriority(title + ' ' + content),
      type: 'spec',
      metadata: {
        source: sourcePath,
        parsedAt: new Date().toISOString(),
      }
    };
  }

  /**
   * 기능 요구사항에서 SPEC 생성
   */
  private createSpecFromFeature(feature: string, sourcePath: string): ParsedSpec | null {
    if (!feature || feature.length < 5) return null;

    return {
      title: this.cleanTitle(feature),
      summary: feature,
      priority: this.detectPriority(feature),
      type: 'spec',
      metadata: {
        source: sourcePath,
        parsedAt: new Date().toISOString(),
      }
    };
  }

  /**
   * JSON 데이터 정규화
   */
  private normalizeSpec(data: unknown, sourcePath: string): ParsedSpec | null {
    if (!data || typeof data !== 'object') return null;

    const obj = data as Record<string, unknown>;
    const title = obj.title || obj.name || obj.feature;
    if (!title || typeof title !== 'string') return null;

    return {
      title: this.cleanTitle(title),
      summary: String(obj.summary || obj.description || obj.content || ''),
      priority: this.validatePriority(obj.priority) || this.detectPriority(title),
      type: obj.type === 'bug' ? 'bug' : 'spec',
      metadata: {
        ...(typeof obj.metadata === 'object' ? obj.metadata as Record<string, unknown> : {}),
        source: sourcePath,
        parsedAt: new Date().toISOString(),
      }
    };
  }

  /**
   * 우선순위 검증
   */
  private validatePriority(priority: unknown): 'P0' | 'P1' | 'P2' | 'P3' | null {
    if (typeof priority === 'string' && ['P0', 'P1', 'P2', 'P3'].includes(priority)) {
      return priority as 'P0' | 'P1' | 'P2' | 'P3';
    }
    return null;
  }

  /**
   * 우선순위 감지
   */
  private detectPriority(text: string): 'P0' | 'P1' | 'P2' | 'P3' {
    const lower = text.toLowerCase();
    for (const [keyword, priority] of Object.entries(PRIORITY_KEYWORDS)) {
      if (lower.includes(keyword.toLowerCase())) {
        return priority;
      }
    }
    return 'P2'; // 기본값
  }

  /**
   * 제목 정리
   */
  private cleanTitle(title: string): string {
    return title
      .replace(/^[-*•#\d.)]+\s*/, '') // 앞 기호 제거
      .replace(/\[.*?\]/g, '') // 체크박스 제거
      .trim()
      .substring(0, 200); // 길이 제한
  }

  /**
   * 요약 정리
   */
  private cleanSummary(content: string): string {
    return content
      .replace(/^[-*•#]+\s*/gm, '') // 불릿 제거
      .trim()
      .substring(0, 2000); // 길이 제한
  }

  /**
   * BTS에 SPEC 등록
   */
  async registerSpecs(specs: ParsedSpec[]): Promise<number[]> {
    const registeredIds: number[] = [];

    for (const spec of specs) {
      try {
        const result = await bugCreate({
          type: spec.type,
          title: spec.title,
          summary: spec.summary,
          priority: spec.priority,
          metadata: spec.metadata,
        });

        if (result && result.id) {
          registeredIds.push(result.id);
          console.log(`[SpecParser] 등록됨: BTS-${result.id} - ${spec.title.substring(0, 50)}`);
        }
      } catch (error) {
        console.error(`[SpecParser] 등록 실패: ${spec.title}`, error);
      }
    }

    return registeredIds;
  }
}

// CLI 실행
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log('사용법: npx ts-node spec-parser.ts <file-path> [--register]');
    console.log('');
    console.log('옵션:');
    console.log('  --register  파싱된 SPEC을 BTS에 자동 등록');
    console.log('');
    console.log('지원 형식: .md, .json, .txt');
    process.exit(1);
  }

  const filePath = args[0];
  const shouldRegister = args.includes('--register');

  if (!fs.existsSync(filePath)) {
    console.error(`파일을 찾을 수 없습니다: ${filePath}`);
    process.exit(1);
  }

  const parser = new SpecParser();
  const specs = await parser.parseFile(filePath);

  console.log(`\n[SpecParser] ${specs.length}개의 SPEC 발견:\n`);

  for (const spec of specs) {
    console.log(`  [${spec.priority}] ${spec.title}`);
    if (spec.summary) {
      console.log(`      ${spec.summary.substring(0, 100)}...`);
    }
  }

  if (shouldRegister && specs.length > 0) {
    console.log('\n[SpecParser] BTS에 등록 중...\n');
    const ids = await parser.registerSpecs(specs);
    console.log(`\n[SpecParser] ${ids.length}개 등록 완료`);
  }
}

if (require.main === module) {
  main().catch(console.error);
}

export default SpecParser;
