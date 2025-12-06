/**
 * Figma Parser
 * Figma 디자인에서 UI 컴포넌트 정보 추출
 */

import * as fs from 'fs';

export interface FigmaComponent {
  id: string;
  name: string;
  type: 'FRAME' | 'COMPONENT' | 'INSTANCE' | 'TEXT' | 'RECTANGLE' | 'GROUP' | 'VECTOR';
  props: Record<string, any>;
  children?: FigmaComponent[];
  parent?: string;
  absoluteBoundingBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface FigmaPage {
  id: string;
  name: string;
  components: FigmaComponent[];
}

export interface FigmaDocument {
  name: string;
  pages: FigmaPage[];
  styles: FigmaStyle[];
  componentSets: FigmaComponentSet[];
}

export interface FigmaStyle {
  key: string;
  name: string;
  type: 'FILL' | 'TEXT' | 'EFFECT' | 'GRID';
  description?: string;
}

export interface FigmaComponentSet {
  id: string;
  name: string;
  variants: FigmaComponent[];
}

export interface GeneratedComponent {
  name: string;
  path: string;
  template: string;
  props: string[];
  children: string[];
}

/**
 * Figma JSON export 파싱 (Figma Plugin에서 내보낸 JSON)
 */
export function parseFigmaExport(filePath: string): FigmaDocument {
  const content = fs.readFileSync(filePath, 'utf-8');
  const data = JSON.parse(content);

  const doc: FigmaDocument = {
    name: data.name || 'Untitled',
    pages: [],
    styles: [],
    componentSets: []
  };

  // 페이지 추출
  if (data.document?.children) {
    for (const page of data.document.children) {
      doc.pages.push({
        id: page.id,
        name: page.name,
        components: extractComponents(page.children || [])
      });
    }
  }

  // 스타일 추출
  if (data.styles) {
    for (const [key, style] of Object.entries(data.styles as Record<string, any>)) {
      doc.styles.push({
        key,
        name: style.name,
        type: style.styleType,
        description: style.description
      });
    }
  }

  // 컴포넌트 세트 추출
  if (data.componentSets) {
    for (const [id, set] of Object.entries(data.componentSets as Record<string, any>)) {
      doc.componentSets.push({
        id,
        name: set.name,
        variants: []
      });
    }
  }

  return doc;
}

/**
 * 컴포넌트 트리에서 컴포넌트 추출
 */
function extractComponents(nodes: any[]): FigmaComponent[] {
  const components: FigmaComponent[] = [];

  for (const node of nodes) {
    const component: FigmaComponent = {
      id: node.id,
      name: node.name,
      type: node.type,
      props: extractProps(node),
      absoluteBoundingBox: node.absoluteBoundingBox
    };

    if (node.children && node.children.length > 0) {
      component.children = extractComponents(node.children);
    }

    components.push(component);
  }

  return components;
}

/**
 * 노드에서 React props 추출
 */
function extractProps(node: any): Record<string, any> {
  const props: Record<string, any> = {};

  // 배경색
  if (node.backgroundColor) {
    props.backgroundColor = rgbaToHex(node.backgroundColor);
  }

  // 텍스트 스타일
  if (node.type === 'TEXT') {
    props.text = node.characters || '';
    if (node.style) {
      props.fontSize = node.style.fontSize;
      props.fontFamily = node.style.fontFamily;
      props.fontWeight = node.style.fontWeight;
      props.textAlign = node.style.textAlignHorizontal?.toLowerCase();
    }
  }

  // 크기
  if (node.absoluteBoundingBox) {
    props.width = node.absoluteBoundingBox.width;
    props.height = node.absoluteBoundingBox.height;
  }

  // 레이아웃
  if (node.layoutMode) {
    props.display = 'flex';
    props.flexDirection = node.layoutMode === 'VERTICAL' ? 'column' : 'row';
    props.gap = node.itemSpacing;
    props.padding = node.paddingLeft;
  }

  // 테두리
  if (node.strokes && node.strokes.length > 0) {
    props.borderColor = rgbaToHex(node.strokes[0].color);
    props.borderWidth = node.strokeWeight;
  }

  // 모서리 둥글기
  if (node.cornerRadius) {
    props.borderRadius = node.cornerRadius;
  }

  return props;
}

/**
 * RGBA to Hex 변환
 */
function rgbaToHex(rgba: { r: number; g: number; b: number; a?: number }): string {
  const r = Math.round(rgba.r * 255);
  const g = Math.round(rgba.g * 255);
  const b = Math.round(rgba.b * 255);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

/**
 * Figma 컴포넌트를 React/Next.js 컴포넌트로 변환
 */
export function generateReactComponent(component: FigmaComponent): GeneratedComponent {
  const name = toPascalCase(component.name);
  const props = Object.keys(component.props);
  const children = component.children?.map(c => toPascalCase(c.name)) || [];

  const propsInterface = props.length > 0
    ? `interface ${name}Props {\n${props.map(p => `  ${p}?: any;`).join('\n')}\n}`
    : '';

  const childrenImports = children.length > 0
    ? children.map(c => `import { ${c} } from './${c}';`).join('\n')
    : '';

  const styleProps = generateStyleProps(component.props);

  const template = `'use client';

import React from 'react';
${childrenImports}

${propsInterface}

export function ${name}(${props.length > 0 ? `props: ${name}Props` : ''}) {
  return (
    <div className="${name.toLowerCase()}" style={${JSON.stringify(styleProps, null, 2)}}>
      ${component.type === 'TEXT' ? `{/* ${component.props.text || ''} */}` : ''}
      ${children.map(c => `<${c} />`).join('\n      ')}
    </div>
  );
}

export default ${name};
`;

  return {
    name,
    path: `components/${name}.tsx`,
    template,
    props,
    children
  };
}

// CSS 스타일 타입 정의 (React 의존성 없이)
interface CSSStyleProps {
  width?: number | string;
  height?: number | string;
  backgroundColor?: string;
  display?: string;
  flexDirection?: string;
  gap?: number | string;
  padding?: number | string;
  borderColor?: string;
  borderWidth?: number | string;
  borderRadius?: number | string;
  fontSize?: number | string;
  fontFamily?: string;
  fontWeight?: number | string;
  textAlign?: string;
}

/**
 * props를 스타일 객체로 변환
 */
function generateStyleProps(props: Record<string, any>): CSSStyleProps {
  const style: CSSStyleProps = {};

  if (props.width) style.width = props.width;
  if (props.height) style.height = props.height;
  if (props.backgroundColor) style.backgroundColor = props.backgroundColor;
  if (props.display) style.display = props.display as any;
  if (props.flexDirection) style.flexDirection = props.flexDirection;
  if (props.gap) style.gap = props.gap;
  if (props.padding) style.padding = props.padding;
  if (props.borderColor) style.borderColor = props.borderColor;
  if (props.borderWidth) style.borderWidth = props.borderWidth;
  if (props.borderRadius) style.borderRadius = props.borderRadius;
  if (props.fontSize) style.fontSize = props.fontSize;
  if (props.fontFamily) style.fontFamily = props.fontFamily;
  if (props.fontWeight) style.fontWeight = props.fontWeight;
  if (props.textAlign) style.textAlign = props.textAlign as any;

  return style;
}

/**
 * 문자열을 PascalCase로 변환
 */
function toPascalCase(str: string): string {
  return str
    .replace(/[^a-zA-Z0-9]/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join('');
}

/**
 * 전체 Figma 문서에서 모든 컴포넌트 생성
 */
export function generateAllComponents(doc: FigmaDocument): GeneratedComponent[] {
  const generated: GeneratedComponent[] = [];

  for (const page of doc.pages) {
    for (const component of page.components) {
      if (component.type === 'COMPONENT' || component.type === 'FRAME') {
        generated.push(generateReactComponent(component));
      }
    }
  }

  return generated;
}

export default {
  parseFigmaExport,
  generateReactComponent,
  generateAllComponents
};
