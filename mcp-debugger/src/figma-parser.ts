/**
 * Figma Parser
 * Figma JSON 파일에서 UI 컴포넌트 정보 추출
 *
 * 지원 포맷:
 * - Figma JSON export (.json)
 * - Figma URL (API 연동)
 *
 * 추출 항목:
 * - 컴포넌트 이름
 * - 컴포넌트 구조
 * - 스타일 정보 (색상, 폰트, 간격)
 * - 레이아웃 정보
 */

import fs from 'fs';
import path from 'path';

export interface FigmaComponent {
  id: string;
  name: string;
  type: 'FRAME' | 'COMPONENT' | 'INSTANCE' | 'TEXT' | 'RECTANGLE' | 'GROUP' | 'VECTOR' | 'OTHER';
  children: FigmaComponent[];
  styles: FigmaStyles;
  layout: FigmaLayout;
  props: Record<string, any>;
}

export interface FigmaStyles {
  backgroundColor?: string;
  color?: string;
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: string;
  borderRadius?: number;
  borderColor?: string;
  borderWidth?: number;
  opacity?: number;
  effects?: Array<{
    type: 'SHADOW' | 'BLUR' | 'GLOW';
    color?: string;
    offset?: { x: number; y: number };
    blur?: number;
  }>;
}

export interface FigmaLayout {
  width?: number;
  height?: number;
  x?: number;
  y?: number;
  padding?: { top: number; right: number; bottom: number; left: number };
  gap?: number;
  direction?: 'HORIZONTAL' | 'VERTICAL' | 'NONE';
  alignment?: string;
  constraints?: {
    horizontal?: 'LEFT' | 'RIGHT' | 'CENTER' | 'SCALE';
    vertical?: 'TOP' | 'BOTTOM' | 'CENTER' | 'SCALE';
  };
}

export interface FigmaParserResult {
  success: boolean;
  components: FigmaComponent[];
  pages: Array<{ name: string; components: FigmaComponent[] }>;
  colors: Array<{ name: string; value: string }>;
  fonts: Array<{ family: string; styles: string[] }>;
  errors: string[];
}

export interface GeneratedComponent {
  name: string;
  filePath: string;
  code: string;
  styles?: string;
}

/**
 * Figma JSON 파일 파싱
 */
export async function parseFigmaFile(filePath: string): Promise<FigmaParserResult> {
  const result: FigmaParserResult = {
    success: false,
    components: [],
    pages: [],
    colors: [],
    fonts: [],
    errors: []
  };

  try {
    if (!fs.existsSync(filePath)) {
      result.errors.push(`파일을 찾을 수 없습니다: ${filePath}`);
      return result;
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const data = JSON.parse(content);

    // Figma JSON 구조 파싱
    if (data.document) {
      // Figma file export format
      result.pages = parseFigmaDocument(data.document);
      for (const page of result.pages) {
        result.components.push(...page.components);
      }
    } else if (Array.isArray(data)) {
      // 배열 형식
      result.components = data.map(parseFigmaNode).filter(Boolean) as FigmaComponent[];
    } else if (data.type || data.children) {
      // 단일 노드
      const component = parseFigmaNode(data);
      if (component) {
        result.components.push(component);
      }
    }

    // 스타일 추출
    result.colors = extractColors(data);
    result.fonts = extractFonts(data);

    result.success = result.components.length > 0 || result.pages.length > 0;
    if (!result.success) {
      result.errors.push('추출할 컴포넌트가 없습니다.');
    }
  } catch (error: any) {
    result.errors.push(`파싱 오류: ${error.message}`);
  }

  return result;
}

/**
 * Figma document 파싱
 */
function parseFigmaDocument(doc: any): Array<{ name: string; components: FigmaComponent[] }> {
  const pages: Array<{ name: string; components: FigmaComponent[] }> = [];

  if (doc.children) {
    for (const page of doc.children) {
      const components: FigmaComponent[] = [];

      if (page.children) {
        for (const child of page.children) {
          const component = parseFigmaNode(child);
          if (component) {
            components.push(component);
          }
        }
      }

      pages.push({
        name: page.name || 'Untitled',
        components
      });
    }
  }

  return pages;
}

/**
 * Figma 노드 파싱
 */
function parseFigmaNode(node: any): FigmaComponent | null {
  if (!node || !node.type) return null;

  const type = mapNodeType(node.type);
  const children: FigmaComponent[] = [];

  if (node.children) {
    for (const child of node.children) {
      const parsed = parseFigmaNode(child);
      if (parsed) {
        children.push(parsed);
      }
    }
  }

  return {
    id: node.id || generateId(),
    name: node.name || 'Unnamed',
    type,
    children,
    styles: extractNodeStyles(node),
    layout: extractNodeLayout(node),
    props: extractNodeProps(node)
  };
}

/**
 * 노드 타입 매핑
 */
function mapNodeType(type: string): FigmaComponent['type'] {
  const typeMap: Record<string, FigmaComponent['type']> = {
    'FRAME': 'FRAME',
    'COMPONENT': 'COMPONENT',
    'INSTANCE': 'INSTANCE',
    'TEXT': 'TEXT',
    'RECTANGLE': 'RECTANGLE',
    'GROUP': 'GROUP',
    'VECTOR': 'VECTOR',
    'ELLIPSE': 'RECTANGLE',
    'LINE': 'VECTOR',
    'STAR': 'VECTOR',
    'POLYGON': 'VECTOR',
    'BOOLEAN_OPERATION': 'GROUP',
  };

  return typeMap[type] || 'OTHER';
}

/**
 * 노드 스타일 추출
 */
function extractNodeStyles(node: any): FigmaStyles {
  const styles: FigmaStyles = {};

  // 배경색
  if (node.fills && node.fills.length > 0) {
    const fill = node.fills[0];
    if (fill.type === 'SOLID' && fill.color) {
      styles.backgroundColor = rgbaToHex(fill.color);
    }
  }

  // 테두리
  if (node.strokes && node.strokes.length > 0) {
    const stroke = node.strokes[0];
    if (stroke.color) {
      styles.borderColor = rgbaToHex(stroke.color);
    }
  }
  if (node.strokeWeight) {
    styles.borderWidth = node.strokeWeight;
  }

  // 모서리 둥글기
  if (node.cornerRadius) {
    styles.borderRadius = node.cornerRadius;
  }

  // 텍스트 스타일
  if (node.style) {
    const textStyle = node.style;
    if (textStyle.fontSize) styles.fontSize = textStyle.fontSize;
    if (textStyle.fontFamily) styles.fontFamily = textStyle.fontFamily;
    if (textStyle.fontWeight) styles.fontWeight = String(textStyle.fontWeight);
  }

  // 불투명도
  if (node.opacity !== undefined) {
    styles.opacity = node.opacity;
  }

  // 효과 (그림자 등)
  if (node.effects && node.effects.length > 0) {
    styles.effects = node.effects.map((effect: any) => ({
      type: effect.type,
      color: effect.color ? rgbaToHex(effect.color) : undefined,
      offset: effect.offset,
      blur: effect.radius
    }));
  }

  return styles;
}

/**
 * 노드 레이아웃 추출
 */
function extractNodeLayout(node: any): FigmaLayout {
  const layout: FigmaLayout = {};

  // 크기
  if (node.absoluteBoundingBox) {
    layout.width = node.absoluteBoundingBox.width;
    layout.height = node.absoluteBoundingBox.height;
    layout.x = node.absoluteBoundingBox.x;
    layout.y = node.absoluteBoundingBox.y;
  } else if (node.size) {
    layout.width = node.size.x;
    layout.height = node.size.y;
  }

  // Auto Layout
  if (node.layoutMode) {
    layout.direction = node.layoutMode;
    layout.gap = node.itemSpacing;
    layout.padding = {
      top: node.paddingTop || 0,
      right: node.paddingRight || 0,
      bottom: node.paddingBottom || 0,
      left: node.paddingLeft || 0
    };
    layout.alignment = node.primaryAxisAlignItems;
  }

  // 제약
  if (node.constraints) {
    layout.constraints = {
      horizontal: node.constraints.horizontal,
      vertical: node.constraints.vertical
    };
  }

  return layout;
}

/**
 * 노드 속성 추출
 */
function extractNodeProps(node: any): Record<string, any> {
  const props: Record<string, any> = {};

  // 텍스트 내용
  if (node.characters) {
    props.text = node.characters;
  }

  // 컴포넌트 속성
  if (node.componentProperties) {
    props.componentProps = node.componentProperties;
  }

  // 인터랙션
  if (node.reactions && node.reactions.length > 0) {
    props.interactions = node.reactions;
  }

  return props;
}

/**
 * 색상 추출
 */
function extractColors(data: any): Array<{ name: string; value: string }> {
  const colors: Array<{ name: string; value: string }> = [];
  const colorSet = new Set<string>();

  function collectColors(node: any, prefix: string = '') {
    if (!node) return;

    // fills에서 색상 추출
    if (node.fills) {
      for (const fill of node.fills) {
        if (fill.type === 'SOLID' && fill.color) {
          const hex = rgbaToHex(fill.color);
          if (!colorSet.has(hex)) {
            colorSet.add(hex);
            colors.push({
              name: prefix ? `${prefix}-fill` : 'fill',
              value: hex
            });
          }
        }
      }
    }

    // strokes에서 색상 추출
    if (node.strokes) {
      for (const stroke of node.strokes) {
        if (stroke.type === 'SOLID' && stroke.color) {
          const hex = rgbaToHex(stroke.color);
          if (!colorSet.has(hex)) {
            colorSet.add(hex);
            colors.push({
              name: prefix ? `${prefix}-stroke` : 'stroke',
              value: hex
            });
          }
        }
      }
    }

    // 자식 노드
    if (node.children) {
      for (const child of node.children) {
        collectColors(child, child.name);
      }
    }

    // document 구조
    if (node.document && node.document.children) {
      for (const page of node.document.children) {
        collectColors(page, page.name);
      }
    }
  }

  collectColors(data);
  return colors;
}

/**
 * 폰트 추출
 */
function extractFonts(data: any): Array<{ family: string; styles: string[] }> {
  const fontMap = new Map<string, Set<string>>();

  function collectFonts(node: any) {
    if (!node) return;

    if (node.style && node.style.fontFamily) {
      const family = node.style.fontFamily;
      const weight = node.style.fontWeight || '400';
      const style = node.style.italic ? 'italic' : 'normal';
      const fontStyle = `${weight} ${style}`;

      if (!fontMap.has(family)) {
        fontMap.set(family, new Set());
      }
      fontMap.get(family)!.add(fontStyle);
    }

    if (node.children) {
      for (const child of node.children) {
        collectFonts(child);
      }
    }

    if (node.document && node.document.children) {
      for (const page of node.document.children) {
        collectFonts(page);
      }
    }
  }

  collectFonts(data);

  return Array.from(fontMap.entries()).map(([family, styles]) => ({
    family,
    styles: Array.from(styles)
  }));
}

/**
 * RGBA to Hex 변환
 */
function rgbaToHex(color: { r: number; g: number; b: number; a?: number }): string {
  const r = Math.round(color.r * 255);
  const g = Math.round(color.g * 255);
  const b = Math.round(color.b * 255);

  if (color.a !== undefined && color.a < 1) {
    const a = Math.round(color.a * 255);
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}${a.toString(16).padStart(2, '0')}`;
  }

  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

/**
 * ID 생성
 */
function generateId(): string {
  return Math.random().toString(36).substring(2, 11);
}

/**
 * React 컴포넌트 코드 생성
 */
export function generateReactComponent(component: FigmaComponent): GeneratedComponent {
  const componentName = toPascalCase(component.name);
  const styles = generateStyles(component);
  const jsx = generateJSX(component);

  const code = `'use client';

import React from 'react';

interface ${componentName}Props {
  className?: string;
  children?: React.ReactNode;
}

export default function ${componentName}({ className, children }: ${componentName}Props) {
  return (
    ${jsx}
  );
}

${componentName}.displayName = '${componentName}';
`;

  return {
    name: componentName,
    filePath: `${componentName}.tsx`,
    code,
    styles: styles ? `/* ${componentName} Styles */\n${styles}` : undefined
  };
}

/**
 * JSX 생성
 */
function generateJSX(component: FigmaComponent, indent: number = 4): string {
  const indentStr = ' '.repeat(indent);
  const nextIndent = indent + 2;
  const styleStr = generateInlineStyle(component.styles);

  let tag = 'div';
  let props = `className={className}`;

  if (component.type === 'TEXT') {
    tag = 'span';
    if (component.props.text) {
      props += ` data-text="${component.props.text}"`;
    }
  }

  if (styleStr) {
    props += ` style={${styleStr}}`;
  }

  if (component.children.length === 0) {
    if (component.type === 'TEXT' && component.props.text) {
      return `<${tag} ${props}>${component.props.text}</${tag}>`;
    }
    return `<${tag} ${props}>{children}</${tag}>`;
  }

  const childJSX = component.children
    .map(child => generateJSX(child, nextIndent))
    .join(`\n${indentStr}`);

  return `<${tag} ${props}>
${indentStr}${childJSX}
${' '.repeat(indent - 2)}</${tag}>`;
}

/**
 * 인라인 스타일 생성
 */
function generateInlineStyle(styles: FigmaStyles): string | null {
  const styleObj: Record<string, any> = {};

  if (styles.backgroundColor) styleObj.backgroundColor = styles.backgroundColor;
  if (styles.color) styleObj.color = styles.color;
  if (styles.fontSize) styleObj.fontSize = `${styles.fontSize}px`;
  if (styles.fontFamily) styleObj.fontFamily = styles.fontFamily;
  if (styles.fontWeight) styleObj.fontWeight = styles.fontWeight;
  if (styles.borderRadius) styleObj.borderRadius = `${styles.borderRadius}px`;
  if (styles.borderColor && styles.borderWidth) {
    styleObj.border = `${styles.borderWidth}px solid ${styles.borderColor}`;
  }
  if (styles.opacity !== undefined && styles.opacity < 1) {
    styleObj.opacity = styles.opacity;
  }

  if (Object.keys(styleObj).length === 0) return null;

  return JSON.stringify(styleObj);
}

/**
 * CSS 스타일 생성
 */
function generateStyles(component: FigmaComponent): string {
  const className = toKebabCase(component.name);
  let css = `.${className} {\n`;

  const { styles, layout } = component;

  // 레이아웃
  if (layout.direction === 'HORIZONTAL') {
    css += `  display: flex;\n  flex-direction: row;\n`;
  } else if (layout.direction === 'VERTICAL') {
    css += `  display: flex;\n  flex-direction: column;\n`;
  }

  if (layout.gap) {
    css += `  gap: ${layout.gap}px;\n`;
  }

  if (layout.padding) {
    const { top, right, bottom, left } = layout.padding;
    if (top === right && right === bottom && bottom === left) {
      css += `  padding: ${top}px;\n`;
    } else {
      css += `  padding: ${top}px ${right}px ${bottom}px ${left}px;\n`;
    }
  }

  if (layout.width) {
    css += `  width: ${layout.width}px;\n`;
  }
  if (layout.height) {
    css += `  height: ${layout.height}px;\n`;
  }

  // 스타일
  if (styles.backgroundColor) {
    css += `  background-color: ${styles.backgroundColor};\n`;
  }
  if (styles.borderRadius) {
    css += `  border-radius: ${styles.borderRadius}px;\n`;
  }
  if (styles.borderColor && styles.borderWidth) {
    css += `  border: ${styles.borderWidth}px solid ${styles.borderColor};\n`;
  }

  css += `}\n`;

  return css;
}

/**
 * PascalCase 변환
 */
function toPascalCase(str: string): string {
  return str
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .split(/\s+/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join('');
}

/**
 * kebab-case 변환
 */
function toKebabCase(str: string): string {
  return str
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .split(/\s+/)
    .map(word => word.toLowerCase())
    .join('-');
}

// CLI 실행
if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log(`
사용법: npx tsx figma-parser.ts <Figma JSON 파일>

예시:
  npx tsx figma-parser.ts ./design.figma.json

옵션:
  --generate-code  React 컴포넌트 코드 생성
`);
    process.exit(1);
  }

  const filePath = path.resolve(args[0]);
  const generateCode = args.includes('--generate-code');

  parseFigmaFile(filePath).then(result => {
    if (result.success) {
      console.log(`\n✅ 파싱 완료:`);
      console.log(`  - 페이지: ${result.pages.length}개`);
      console.log(`  - 컴포넌트: ${result.components.length}개`);
      console.log(`  - 색상: ${result.colors.length}개`);
      console.log(`  - 폰트: ${result.fonts.length}개`);

      if (generateCode) {
        console.log('\n📝 컴포넌트 코드 생성:');
        for (const comp of result.components) {
          const generated = generateReactComponent(comp);
          console.log(`  - ${generated.name}.tsx`);
        }
      }
    } else {
      console.error('\n❌ 파싱 실패:', result.errors.join(', '));
      process.exit(1);
    }
  }).catch(error => {
    console.error('오류:', error.message);
    process.exit(1);
  });
}

export default { parseFigmaFile, generateReactComponent };
