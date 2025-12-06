#!/usr/bin/env node
/**
 * Figma Parser (BTS-3189)
 * Figma 디자인에서 UI 컴포넌트 정보 추출
 *
 * 지원 방식:
 * 1. Figma API를 통한 실시간 파싱
 * 2. Figma JSON export 파일 파싱
 * 3. 스크린샷/이미지에서 컴포넌트 감지 (향후 확장)
 */

import * as fs from 'fs';
import * as path from 'path';
import { bugCreate } from '../bug-bridge.js';

interface FigmaNode {
  id: string;
  name: string;
  type: string;
  children?: FigmaNode[];
  absoluteBoundingBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  fills?: Array<{
    type: string;
    color?: { r: number; g: number; b: number; a: number };
  }>;
  strokes?: Array<{
    type: string;
    color?: { r: number; g: number; b: number; a: number };
  }>;
  effects?: Array<{
    type: string;
    radius?: number;
  }>;
  cornerRadius?: number;
  characters?: string;
  style?: {
    fontFamily?: string;
    fontSize?: number;
    fontWeight?: number;
  };
}

interface ParsedComponent {
  id: string;
  name: string;
  type: string;
  path: string;
  props: Record<string, unknown>;
  children: ParsedComponent[];
  metadata: {
    figmaId: string;
    position?: { x: number; y: number };
    size?: { width: number; height: number };
  };
}

interface ComponentSpec {
  name: string;
  type: 'component' | 'page' | 'section';
  props: string[];
  children: string[];
  styling: {
    colors: string[];
    typography: string[];
    spacing: string[];
  };
}

// Figma 노드 타입과 React 컴포넌트 매핑
const NODE_TYPE_MAPPING: Record<string, string> = {
  'FRAME': 'div',
  'GROUP': 'div',
  'RECTANGLE': 'div',
  'TEXT': 'span',
  'COMPONENT': 'Component',
  'INSTANCE': 'Component',
  'VECTOR': 'svg',
  'ELLIPSE': 'div',
  'LINE': 'hr',
  'BOOLEAN_OPERATION': 'div',
};

// 컴포넌트 이름 패턴
const COMPONENT_PATTERNS = {
  button: /btn|button/i,
  input: /input|text-?field|search/i,
  card: /card|tile/i,
  modal: /modal|dialog|popup/i,
  nav: /nav|menu|header|footer/i,
  list: /list|table|grid/i,
  form: /form|login|signup|register/i,
  avatar: /avatar|profile|user/i,
  badge: /badge|tag|label/i,
  alert: /alert|toast|notification/i,
};

export class FigmaParser {
  private apiToken: string;
  private baseUrl = 'https://api.figma.com/v1';

  constructor(apiToken?: string) {
    this.apiToken = apiToken || process.env.FIGMA_API_TOKEN || '';
  }

  /**
   * Figma 파일에서 컴포넌트 추출
   */
  async parseFile(source: string): Promise<ParsedComponent[]> {
    // JSON 파일인 경우
    if (source.endsWith('.json') && fs.existsSync(source)) {
      return this.parseJsonExport(source);
    }

    // Figma URL인 경우
    if (source.includes('figma.com')) {
      return this.parseFigmaUrl(source);
    }

    // 파일 ID인 경우
    if (/^[a-zA-Z0-9]+$/.test(source)) {
      return this.parseFigmaFile(source);
    }

    console.error('[FigmaParser] 알 수 없는 소스 형식:', source);
    return [];
  }

  /**
   * JSON export 파일 파싱
   */
  private parseJsonExport(filePath: string): ParsedComponent[] {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const data = JSON.parse(content);

      // Figma export 형식
      if (data.document) {
        return this.traverseNodes(data.document, '');
      }

      // 커스텀 형식
      if (data.components) {
        return data.components.map((c: FigmaNode) => this.nodeToComponent(c, ''));
      }

      return [];
    } catch (error) {
      console.error('[FigmaParser] JSON 파싱 오류:', error);
      return [];
    }
  }

  /**
   * Figma URL 파싱
   */
  private async parseFigmaUrl(url: string): Promise<ParsedComponent[]> {
    // URL에서 파일 ID 추출
    const match = url.match(/figma\.com\/(?:file|design)\/([a-zA-Z0-9]+)/);
    if (!match) {
      console.error('[FigmaParser] 유효하지 않은 Figma URL');
      return [];
    }

    return this.parseFigmaFile(match[1]);
  }

  /**
   * Figma API로 파일 파싱
   */
  private async parseFigmaFile(fileId: string): Promise<ParsedComponent[]> {
    if (!this.apiToken) {
      console.error('[FigmaParser] FIGMA_API_TOKEN이 설정되지 않았습니다');
      return [];
    }

    try {
      const response = await fetch(`${this.baseUrl}/files/${fileId}`, {
        headers: {
          'X-FIGMA-TOKEN': this.apiToken,
        },
      });

      if (!response.ok) {
        throw new Error(`Figma API 오류: ${response.status}`);
      }

      const data = await response.json();
      return this.traverseNodes(data.document, '');
    } catch (error) {
      console.error('[FigmaParser] API 호출 오류:', error);
      return [];
    }
  }

  /**
   * 노드 트리 순회
   */
  private traverseNodes(node: FigmaNode, parentPath: string): ParsedComponent[] {
    const components: ParsedComponent[] = [];
    const currentPath = parentPath ? `${parentPath}/${node.name}` : node.name;

    // 컴포넌트 또는 프레임인 경우 추출
    if (this.shouldExtract(node)) {
      const component = this.nodeToComponent(node, currentPath);
      components.push(component);
    }

    // 자식 노드 순회
    if (node.children) {
      for (const child of node.children) {
        const childComponents = this.traverseNodes(child, currentPath);
        components.push(...childComponents);
      }
    }

    return components;
  }

  /**
   * 추출 대상인지 확인
   */
  private shouldExtract(node: FigmaNode): boolean {
    // 컴포넌트, 인스턴스, 주요 프레임만 추출
    if (['COMPONENT', 'COMPONENT_SET', 'INSTANCE'].includes(node.type)) {
      return true;
    }

    // 의미 있는 이름을 가진 프레임
    if (node.type === 'FRAME' && node.name && !node.name.startsWith('Frame')) {
      for (const [, pattern] of Object.entries(COMPONENT_PATTERNS)) {
        if (pattern.test(node.name)) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Figma 노드를 컴포넌트로 변환
   */
  private nodeToComponent(node: FigmaNode, path: string): ParsedComponent {
    const children = node.children
      ? node.children.map(child => this.nodeToComponent(child, `${path}/${child.name}`))
      : [];

    return {
      id: this.generateComponentId(node.name),
      name: this.cleanComponentName(node.name),
      type: this.inferComponentType(node),
      path,
      props: this.extractProps(node),
      children,
      metadata: {
        figmaId: node.id,
        position: node.absoluteBoundingBox
          ? { x: node.absoluteBoundingBox.x, y: node.absoluteBoundingBox.y }
          : undefined,
        size: node.absoluteBoundingBox
          ? { width: node.absoluteBoundingBox.width, height: node.absoluteBoundingBox.height }
          : undefined,
      },
    };
  }

  /**
   * 컴포넌트 타입 추론
   */
  private inferComponentType(node: FigmaNode): string {
    const name = node.name.toLowerCase();

    for (const [type, pattern] of Object.entries(COMPONENT_PATTERNS)) {
      if (pattern.test(name)) {
        return type;
      }
    }

    return NODE_TYPE_MAPPING[node.type] || 'div';
  }

  /**
   * 노드에서 props 추출
   */
  private extractProps(node: FigmaNode): Record<string, unknown> {
    const props: Record<string, unknown> = {};

    // 텍스트 내용
    if (node.characters) {
      props.text = node.characters;
    }

    // 크기
    if (node.absoluteBoundingBox) {
      props.width = Math.round(node.absoluteBoundingBox.width);
      props.height = Math.round(node.absoluteBoundingBox.height);
    }

    // 모서리 반경
    if (node.cornerRadius) {
      props.borderRadius = node.cornerRadius;
    }

    // 배경색
    if (node.fills && node.fills.length > 0) {
      const fill = node.fills[0];
      if (fill.type === 'SOLID' && fill.color) {
        props.backgroundColor = this.colorToHex(fill.color);
      }
    }

    // 테두리
    if (node.strokes && node.strokes.length > 0) {
      const stroke = node.strokes[0];
      if (stroke.type === 'SOLID' && stroke.color) {
        props.borderColor = this.colorToHex(stroke.color);
      }
    }

    // 폰트 스타일
    if (node.style) {
      if (node.style.fontFamily) props.fontFamily = node.style.fontFamily;
      if (node.style.fontSize) props.fontSize = node.style.fontSize;
      if (node.style.fontWeight) props.fontWeight = node.style.fontWeight;
    }

    return props;
  }

  /**
   * 색상을 hex로 변환
   */
  private colorToHex(color: { r: number; g: number; b: number; a: number }): string {
    const r = Math.round(color.r * 255).toString(16).padStart(2, '0');
    const g = Math.round(color.g * 255).toString(16).padStart(2, '0');
    const b = Math.round(color.b * 255).toString(16).padStart(2, '0');
    return `#${r}${g}${b}`;
  }

  /**
   * 컴포넌트 ID 생성
   */
  private generateComponentId(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }

  /**
   * 컴포넌트 이름 정리
   */
  private cleanComponentName(name: string): string {
    return name
      .replace(/[\/\\]/g, '')
      .replace(/^\d+\s*[-_]?\s*/, '')
      .trim();
  }

  /**
   * 컴포넌트 스펙 생성
   */
  generateComponentSpecs(components: ParsedComponent[]): ComponentSpec[] {
    return components.map(component => ({
      name: component.name,
      type: this.categorizeComponent(component.type),
      props: Object.keys(component.props),
      children: component.children.map(c => c.name),
      styling: {
        colors: this.extractColors(component),
        typography: this.extractTypography(component),
        spacing: this.extractSpacing(component),
      },
    }));
  }

  /**
   * 컴포넌트 분류
   */
  private categorizeComponent(type: string): 'component' | 'page' | 'section' {
    if (['nav', 'modal', 'form'].includes(type)) return 'section';
    if (type === 'page') return 'page';
    return 'component';
  }

  /**
   * 색상 추출
   */
  private extractColors(component: ParsedComponent): string[] {
    const colors: string[] = [];
    if (component.props.backgroundColor) colors.push(String(component.props.backgroundColor));
    if (component.props.borderColor) colors.push(String(component.props.borderColor));
    return colors;
  }

  /**
   * 타이포그래피 추출
   */
  private extractTypography(component: ParsedComponent): string[] {
    const typography: string[] = [];
    if (component.props.fontFamily) typography.push(`font-family: ${component.props.fontFamily}`);
    if (component.props.fontSize) typography.push(`font-size: ${component.props.fontSize}px`);
    if (component.props.fontWeight) typography.push(`font-weight: ${component.props.fontWeight}`);
    return typography;
  }

  /**
   * 간격 추출
   */
  private extractSpacing(component: ParsedComponent): string[] {
    const spacing: string[] = [];
    if (component.props.width) spacing.push(`width: ${component.props.width}px`);
    if (component.props.height) spacing.push(`height: ${component.props.height}px`);
    if (component.props.borderRadius) spacing.push(`border-radius: ${component.props.borderRadius}px`);
    return spacing;
  }

  /**
   * BTS에 컴포넌트 SPEC 등록
   */
  async registerComponentSpecs(specs: ComponentSpec[]): Promise<number[]> {
    const registeredIds: number[] = [];

    for (const spec of specs) {
      try {
        const summary = [
          `타입: ${spec.type}`,
          `Props: ${spec.props.join(', ') || '없음'}`,
          `자식 컴포넌트: ${spec.children.join(', ') || '없음'}`,
          `스타일:`,
          `  - 색상: ${spec.styling.colors.join(', ') || '없음'}`,
          `  - 타이포그래피: ${spec.styling.typography.join(', ') || '없음'}`,
          `  - 간격: ${spec.styling.spacing.join(', ') || '없음'}`,
        ].join('\n');

        const result = await bugCreate({
          type: 'spec',
          title: `[UI] ${spec.name} 컴포넌트 구현`,
          summary,
          priority: 'P2',
          metadata: {
            source: 'figma',
            componentSpec: spec,
          },
        });

        if (result && result.id) {
          registeredIds.push(result.id);
          console.log(`[FigmaParser] 등록됨: BTS-${result.id} - ${spec.name}`);
        }
      } catch (error) {
        console.error(`[FigmaParser] 등록 실패: ${spec.name}`, error);
      }
    }

    return registeredIds;
  }
}

// CLI 실행
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log('사용법: npx ts-node figma-parser.ts <source> [--register]');
    console.log('');
    console.log('source:');
    console.log('  - Figma URL: https://www.figma.com/file/xxx');
    console.log('  - Figma File ID: xxx');
    console.log('  - JSON export 파일: ./export.json');
    console.log('');
    console.log('옵션:');
    console.log('  --register  파싱된 컴포넌트를 BTS에 SPEC으로 등록');
    console.log('');
    console.log('환경변수:');
    console.log('  FIGMA_API_TOKEN  Figma API 토큰');
    process.exit(1);
  }

  const source = args[0];
  const shouldRegister = args.includes('--register');

  const parser = new FigmaParser();
  const components = await parser.parseFile(source);

  console.log(`\n[FigmaParser] ${components.length}개의 컴포넌트 발견:\n`);

  for (const component of components) {
    console.log(`  [${component.type}] ${component.name}`);
    if (component.children.length > 0) {
      console.log(`      자식: ${component.children.map(c => c.name).join(', ')}`);
    }
  }

  if (shouldRegister && components.length > 0) {
    console.log('\n[FigmaParser] BTS에 SPEC 등록 중...\n');
    const specs = parser.generateComponentSpecs(components);
    const ids = await parser.registerComponentSpecs(specs);
    console.log(`\n[FigmaParser] ${ids.length}개 등록 완료`);
  }
}

if (require.main === module) {
  main().catch(console.error);
}

export default FigmaParser;
