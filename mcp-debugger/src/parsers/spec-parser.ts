/**
 * Spec Parser
 * 기획서에서 SPEC을 추출하여 BTS에 자동 등록
 */

import * as fs from 'fs';
import * as path from 'path';
import { bugCreate } from '../bug-bridge.js';

export interface ParsedSpec {
  title: string;
  summary: string;
  priority: 'P0' | 'P1' | 'P2' | 'P3';
  feature?: string;
  uiPages?: string[];
  components?: string[];
  dependencies?: string[];
}

export interface SpecDocument {
  title: string;
  sections: SpecSection[];
  metadata: Record<string, any>;
}

export interface SpecSection {
  heading: string;
  level: number;
  content: string;
  specs: ParsedSpec[];
}

/**
 * 마크다운 기획서 파싱
 */
export function parseMarkdownSpec(filePath: string): SpecDocument {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');

  const doc: SpecDocument = {
    title: '',
    sections: [],
    metadata: {}
  };

  let currentSection: SpecSection | null = null;
  let contentBuffer: string[] = [];

  for (const line of lines) {
    // 제목 추출 (# Title)
    const h1Match = line.match(/^#\s+(.+)$/);
    if (h1Match && !doc.title) {
      doc.title = h1Match[1].trim();
      continue;
    }

    // 섹션 헤딩 추출 (## ~ ######)
    const headingMatch = line.match(/^(#{2,6})\s+(.+)$/);
    if (headingMatch) {
      // 이전 섹션 저장
      if (currentSection) {
        currentSection.content = contentBuffer.join('\n').trim();
        currentSection.specs = extractSpecsFromContent(currentSection.content, currentSection.heading);
        doc.sections.push(currentSection);
      }

      currentSection = {
        heading: headingMatch[2].trim(),
        level: headingMatch[1].length,
        content: '',
        specs: []
      };
      contentBuffer = [];
      continue;
    }

    // 메타데이터 추출 (YAML frontmatter 스타일)
    const metaMatch = line.match(/^(\w+):\s*(.+)$/);
    if (metaMatch && doc.sections.length === 0) {
      doc.metadata[metaMatch[1]] = metaMatch[2].trim();
      continue;
    }

    contentBuffer.push(line);
  }

  // 마지막 섹션 저장
  if (currentSection) {
    currentSection.content = contentBuffer.join('\n').trim();
    currentSection.specs = extractSpecsFromContent(currentSection.content, currentSection.heading);
    doc.sections.push(currentSection);
  }

  return doc;
}

/**
 * 콘텐츠에서 SPEC 항목 추출
 */
function extractSpecsFromContent(content: string, sectionHeading: string): ParsedSpec[] {
  const specs: ParsedSpec[] = [];

  // 체크리스트 항목 추출 (- [ ] 또는 - [x])
  const checklistPattern = /^[-*]\s*\[[ x]\]\s*(.+)$/gm;
  let match;

  while ((match = checklistPattern.exec(content)) !== null) {
    const item = match[1].trim();
    specs.push({
      title: item,
      summary: `${sectionHeading}: ${item}`,
      priority: detectPriority(item)
    });
  }

  // 번호 리스트 항목 추출 (1. 2. 3.)
  const numberedPattern = /^\d+\.\s*(.+)$/gm;
  while ((match = numberedPattern.exec(content)) !== null) {
    const item = match[1].trim();
    // 이미 체크리스트로 추출된 항목 제외
    if (!specs.some(s => s.title === item)) {
      specs.push({
        title: item,
        summary: `${sectionHeading}: ${item}`,
        priority: detectPriority(item)
      });
    }
  }

  // TODO/FIXME/SPEC 키워드 추출
  const todoPattern = /(?:TODO|FIXME|SPEC):\s*(.+)$/gm;
  while ((match = todoPattern.exec(content)) !== null) {
    const item = match[1].trim();
    specs.push({
      title: item,
      summary: `${sectionHeading}: ${item}`,
      priority: 'P1'
    });
  }

  return specs;
}

/**
 * 우선순위 감지
 */
function detectPriority(text: string): 'P0' | 'P1' | 'P2' | 'P3' {
  const lower = text.toLowerCase();

  if (lower.includes('critical') || lower.includes('긴급') || lower.includes('필수')) {
    return 'P0';
  }
  if (lower.includes('high') || lower.includes('중요') || lower.includes('핵심')) {
    return 'P1';
  }
  if (lower.includes('low') || lower.includes('나중에') || lower.includes('개선')) {
    return 'P3';
  }

  return 'P2'; // 기본값
}

/**
 * SPEC 문서에서 추출된 모든 스펙을 BTS에 등록
 */
export async function registerSpecsToBTS(doc: SpecDocument): Promise<{ registered: number; failed: number }> {
  let registered = 0;
  let failed = 0;

  for (const section of doc.sections) {
    for (const spec of section.specs) {
      try {
        await bugCreate({
          title: spec.title,
          summary: spec.summary,
          priority: spec.priority,
          type: 'spec',
          metadata: {
            feature: spec.feature || section.heading,
            source_document: doc.title,
            ui_pages: spec.uiPages,
            components: spec.components
          }
        });
        registered++;
      } catch (error) {
        console.error(`Failed to register spec: ${spec.title}`, error);
        failed++;
      }
    }
  }

  return { registered, failed };
}

/**
 * 기획서 파일 감시 및 자동 파싱
 */
export function watchSpecFiles(specDir: string, onSpecParsed: (doc: SpecDocument) => void): void {
  const watcher = fs.watch(specDir, { recursive: true }, (eventType, filename) => {
    if (!filename || !filename.endsWith('.md')) return;

    const filePath = path.join(specDir, filename);
    if (!fs.existsSync(filePath)) return;

    try {
      const doc = parseMarkdownSpec(filePath);
      onSpecParsed(doc);
    } catch (error) {
      console.error(`Failed to parse spec file: ${filename}`, error);
    }
  });

  console.log(`📋 Watching spec files in: ${specDir}`);
}

export default {
  parseMarkdownSpec,
  extractSpecsFromContent,
  registerSpecsToBTS,
  watchSpecFiles
};
