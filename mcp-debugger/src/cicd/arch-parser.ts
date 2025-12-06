#!/usr/bin/env node
/**
 * Architecture Parser (BTS-3189)
 * 아키텍처 다이어그램에서 의존성/구조 분석
 *
 * 지원 형식:
 * 1. Mermaid 다이어그램 (.mmd, .md)
 * 2. PlantUML (.puml, .plantuml)
 * 3. Draw.io XML (.drawio, .xml)
 * 4. JSON 구조 (.json)
 */

import * as fs from 'fs';
import * as path from 'path';
import { bugCreate } from '../bug-bridge.js';

interface ArchNode {
  id: string;
  name: string;
  type: 'service' | 'database' | 'queue' | 'external' | 'component' | 'user' | 'unknown';
  description?: string;
  technology?: string;
  metadata?: Record<string, unknown>;
}

interface ArchEdge {
  from: string;
  to: string;
  label?: string;
  type: 'sync' | 'async' | 'data' | 'event' | 'unknown';
  protocol?: string;
}

interface ArchLayer {
  name: string;
  nodes: string[];
  description?: string;
}

interface ParsedArchitecture {
  nodes: ArchNode[];
  edges: ArchEdge[];
  layers: ArchLayer[];
  title?: string;
  description?: string;
}

interface DependencyAnalysis {
  critical: string[];       // 의존성이 많은 핵심 노드
  isolated: string[];       // 의존성 없는 고립 노드
  circular: string[][];     // 순환 의존성
  layerViolations: Array<{from: string; to: string; reason: string}>;
}

// Mermaid 노드 타입 패턴
const MERMAID_NODE_TYPES: Record<string, ArchNode['type']> = {
  'database': 'database',
  'db': 'database',
  'queue': 'queue',
  'mq': 'queue',
  'kafka': 'queue',
  'rabbit': 'queue',
  'api': 'service',
  'service': 'service',
  'server': 'service',
  'frontend': 'component',
  'ui': 'component',
  'client': 'component',
  'user': 'user',
  'external': 'external',
  '3rd': 'external',
  'third': 'external',
};

// 레이어 우선순위 (상위 -> 하위)
const LAYER_PRIORITY: Record<string, number> = {
  'presentation': 1,
  'frontend': 1,
  'ui': 1,
  'application': 2,
  'api': 2,
  'service': 3,
  'domain': 3,
  'business': 3,
  'infrastructure': 4,
  'data': 4,
  'database': 5,
  'external': 6,
};

export class ArchParser {
  /**
   * 파일에서 아키텍처 파싱
   */
  async parseFile(filePath: string): Promise<ParsedArchitecture> {
    const ext = path.extname(filePath).toLowerCase();
    const content = fs.readFileSync(filePath, 'utf-8');

    switch (ext) {
      case '.mmd':
        return this.parseMermaid(content);
      case '.md':
        return this.parseMermaidFromMarkdown(content);
      case '.puml':
      case '.plantuml':
        return this.parsePlantUml(content);
      case '.drawio':
      case '.xml':
        return this.parseDrawio(content);
      case '.json':
        return this.parseJson(content);
      default:
        console.warn(`[ArchParser] 지원하지 않는 파일 형식: ${ext}`);
        return { nodes: [], edges: [], layers: [] };
    }
  }

  /**
   * Mermaid 다이어그램 파싱
   */
  private parseMermaid(content: string): ParsedArchitecture {
    const nodes: ArchNode[] = [];
    const edges: ArchEdge[] = [];
    const layers: ArchLayer[] = [];
    const nodeMap = new Map<string, ArchNode>();

    const lines = content.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('%%'));

    // subgraph (레이어) 파싱
    let currentSubgraph: string | null = null;
    const subgraphNodes: Map<string, string[]> = new Map();

    for (const line of lines) {
      // subgraph 시작
      const subgraphMatch = line.match(/^subgraph\s+(.+)/i);
      if (subgraphMatch) {
        currentSubgraph = subgraphMatch[1].replace(/[\[\]"']/g, '').trim();
        subgraphNodes.set(currentSubgraph, []);
        continue;
      }

      // subgraph 끝
      if (line.toLowerCase() === 'end') {
        currentSubgraph = null;
        continue;
      }

      // 노드 정의: A[Label] 또는 A((Label)) 등
      const nodeMatch = line.match(/^(\w+)(?:\[([^\]]+)\]|\(\(([^)]+)\)\)|(?:\{([^}]+)\})|(?:\(\[([^\]]+)\]\)))?/);
      if (nodeMatch && !line.includes('-->') && !line.includes('---')) {
        const nodeId = nodeMatch[1];
        const label = nodeMatch[2] || nodeMatch[3] || nodeMatch[4] || nodeMatch[5] || nodeId;

        if (!nodeMap.has(nodeId)) {
          const node: ArchNode = {
            id: nodeId,
            name: label,
            type: this.inferNodeType(label),
          };
          nodes.push(node);
          nodeMap.set(nodeId, node);
        }

        if (currentSubgraph) {
          subgraphNodes.get(currentSubgraph)!.push(nodeId);
        }
      }

      // 엣지 정의: A --> B 또는 A -->|label| B
      const edgeMatch = line.match(/(\w+)\s*(-->|---|-\.->|==>)\s*(?:\|([^|]+)\|\s*)?(\w+)/);
      if (edgeMatch) {
        const fromId = edgeMatch[1];
        const edgeType = edgeMatch[2];
        const label = edgeMatch[3];
        const toId = edgeMatch[4];

        // 노드가 없으면 생성
        if (!nodeMap.has(fromId)) {
          const node: ArchNode = { id: fromId, name: fromId, type: 'unknown' };
          nodes.push(node);
          nodeMap.set(fromId, node);
        }
        if (!nodeMap.has(toId)) {
          const node: ArchNode = { id: toId, name: toId, type: 'unknown' };
          nodes.push(node);
          nodeMap.set(toId, node);
        }

        edges.push({
          from: fromId,
          to: toId,
          label,
          type: this.inferEdgeType(edgeType, label),
        });
      }
    }

    // 레이어 변환
    subgraphNodes.forEach((nodeIds, name) => {
      if (nodeIds.length > 0) {
        layers.push({
          name,
          nodes: nodeIds,
        });
      }
    });

    return { nodes, edges, layers };
  }

  /**
   * Markdown에서 Mermaid 블록 추출
   */
  private parseMermaidFromMarkdown(content: string): ParsedArchitecture {
    const mermaidMatch = content.match(/```mermaid\s*([\s\S]*?)```/i);
    if (mermaidMatch) {
      return this.parseMermaid(mermaidMatch[1]);
    }
    return { nodes: [], edges: [], layers: [] };
  }

  /**
   * PlantUML 파싱
   */
  private parsePlantUml(content: string): ParsedArchitecture {
    const nodes: ArchNode[] = [];
    const edges: ArchEdge[] = [];
    const layers: ArchLayer[] = [];
    const nodeMap = new Map<string, ArchNode>();

    const lines = content.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith("'"));

    let currentPackage: string | null = null;
    const packageNodes: Map<string, string[]> = new Map();

    for (const line of lines) {
      // package/rectangle 시작
      const packageMatch = line.match(/^(?:package|rectangle|component|database)\s+"?([^"{]+)"?\s*(?:as\s+(\w+))?\s*\{?/i);
      if (packageMatch) {
        currentPackage = packageMatch[1].trim();
        packageNodes.set(currentPackage, []);
        continue;
      }

      // package 끝
      if (line === '}') {
        currentPackage = null;
        continue;
      }

      // 컴포넌트/노드 정의
      const nodeMatch = line.match(/^(?:component|database|queue|actor|usecase|rectangle)\s+"?([^"]+)"?\s*(?:as\s+(\w+))?/i);
      if (nodeMatch) {
        const name = nodeMatch[1];
        const id = nodeMatch[2] || name.replace(/\s+/g, '_');

        const node: ArchNode = {
          id,
          name,
          type: this.inferNodeType(line),
        };
        nodes.push(node);
        nodeMap.set(id, node);

        if (currentPackage) {
          packageNodes.get(currentPackage)!.push(id);
        }
      }

      // 관계 정의: A --> B : label
      const edgeMatch = line.match(/(\w+)\s*(-->|<--|\.\.>|<\.\.|--|\.\.|->|<-)\s*(\w+)(?:\s*:\s*(.+))?/);
      if (edgeMatch) {
        edges.push({
          from: edgeMatch[1],
          to: edgeMatch[3],
          label: edgeMatch[4],
          type: this.inferEdgeTypeFromPuml(edgeMatch[2]),
        });
      }
    }

    // 레이어 변환
    packageNodes.forEach((nodeIds, name) => {
      if (nodeIds.length > 0) {
        layers.push({ name, nodes: nodeIds });
      }
    });

    return { nodes, edges, layers };
  }

  /**
   * Draw.io XML 파싱
   */
  private parseDrawio(content: string): ParsedArchitecture {
    const nodes: ArchNode[] = [];
    const edges: ArchEdge[] = [];
    const layers: ArchLayer[] = [];

    // 간단한 XML 파싱 (정규식 기반)
    // mxCell 노드 추출
    const cellRegex = /<mxCell[^>]*id="([^"]+)"[^>]*value="([^"]*)"[^>]*(?:source="([^"]+)")?[^>]*(?:target="([^"]+)")?[^>]*>/g;

    let match;
    while ((match = cellRegex.exec(content)) !== null) {
      const id = match[1];
      const value = match[2];
      const source = match[3];
      const target = match[4];

      if (source && target) {
        // 엣지
        edges.push({
          from: source,
          to: target,
          label: value,
          type: 'unknown',
        });
      } else if (value && id !== '0' && id !== '1') {
        // 노드
        nodes.push({
          id,
          name: value,
          type: this.inferNodeType(value),
        });
      }
    }

    return { nodes, edges, layers };
  }

  /**
   * JSON 구조 파싱
   */
  private parseJson(content: string): ParsedArchitecture {
    const data = JSON.parse(content);

    const nodes: ArchNode[] = (data.nodes || []).map((n: Record<string, unknown>) => ({
      id: n.id || n.name,
      name: n.name || n.label,
      type: n.type || this.inferNodeType(String(n.name || '')),
      description: n.description,
      technology: n.technology,
      metadata: n.metadata,
    }));

    const edges: ArchEdge[] = (data.edges || data.connections || []).map((e: Record<string, unknown>) => ({
      from: e.from || e.source,
      to: e.to || e.target,
      label: e.label,
      type: e.type || 'unknown',
      protocol: e.protocol,
    }));

    const layers: ArchLayer[] = (data.layers || []).map((l: Record<string, unknown>) => ({
      name: l.name,
      nodes: l.nodes || [],
      description: l.description,
    }));

    return {
      nodes,
      edges,
      layers,
      title: data.title,
      description: data.description,
    };
  }

  /**
   * 노드 타입 추론
   */
  private inferNodeType(text: string): ArchNode['type'] {
    const lower = text.toLowerCase();
    for (const [keyword, type] of Object.entries(MERMAID_NODE_TYPES)) {
      if (lower.includes(keyword)) {
        return type;
      }
    }
    return 'component';
  }

  /**
   * Mermaid 엣지 타입 추론
   */
  private inferEdgeType(edgeSymbol: string, label?: string): ArchEdge['type'] {
    if (edgeSymbol === '-.->') return 'async';
    if (edgeSymbol === '==>') return 'event';
    if (label?.toLowerCase().includes('event')) return 'event';
    if (label?.toLowerCase().includes('async')) return 'async';
    if (label?.toLowerCase().includes('data')) return 'data';
    return 'sync';
  }

  /**
   * PlantUML 엣지 타입 추론
   */
  private inferEdgeTypeFromPuml(edgeSymbol: string): ArchEdge['type'] {
    if (edgeSymbol.includes('..')) return 'async';
    return 'sync';
  }

  /**
   * 의존성 분석
   */
  analyzeDependencies(arch: ParsedArchitecture): DependencyAnalysis {
    const inDegree = new Map<string, number>();
    const outDegree = new Map<string, number>();

    // 초기화
    for (const node of arch.nodes) {
      inDegree.set(node.id, 0);
      outDegree.set(node.id, 0);
    }

    // 차수 계산
    for (const edge of arch.edges) {
      inDegree.set(edge.to, (inDegree.get(edge.to) || 0) + 1);
      outDegree.set(edge.from, (outDegree.get(edge.from) || 0) + 1);
    }

    // 핵심 노드 (의존도가 높은 노드)
    const critical = arch.nodes
      .filter(n => (inDegree.get(n.id) || 0) >= 3)
      .map(n => n.id);

    // 고립 노드
    const isolated = arch.nodes
      .filter(n => (inDegree.get(n.id) || 0) === 0 && (outDegree.get(n.id) || 0) === 0)
      .map(n => n.id);

    // 순환 의존성 탐지
    const circular = this.detectCircularDependencies(arch);

    // 레이어 위반 탐지
    const layerViolations = this.detectLayerViolations(arch);

    return { critical, isolated, circular, layerViolations };
  }

  /**
   * 순환 의존성 탐지 (DFS)
   */
  private detectCircularDependencies(arch: ParsedArchitecture): string[][] {
    const adjacency = new Map<string, string[]>();
    for (const node of arch.nodes) {
      adjacency.set(node.id, []);
    }
    for (const edge of arch.edges) {
      adjacency.get(edge.from)?.push(edge.to);
    }

    const cycles: string[][] = [];
    const visited = new Set<string>();
    const recStack = new Set<string>();
    const path: string[] = [];

    const dfs = (node: string) => {
      visited.add(node);
      recStack.add(node);
      path.push(node);

      for (const neighbor of adjacency.get(node) || []) {
        if (!visited.has(neighbor)) {
          dfs(neighbor);
        } else if (recStack.has(neighbor)) {
          // 순환 발견
          const cycleStart = path.indexOf(neighbor);
          cycles.push(path.slice(cycleStart));
        }
      }

      path.pop();
      recStack.delete(node);
    };

    for (const node of arch.nodes) {
      if (!visited.has(node.id)) {
        dfs(node.id);
      }
    }

    return cycles;
  }

  /**
   * 레이어 위반 탐지
   */
  private detectLayerViolations(arch: ParsedArchitecture): Array<{from: string; to: string; reason: string}> {
    const violations: Array<{from: string; to: string; reason: string}> = [];

    // 노드별 레이어 매핑
    const nodeLayer = new Map<string, string>();
    for (const layer of arch.layers) {
      for (const nodeId of layer.nodes) {
        nodeLayer.set(nodeId, layer.name);
      }
    }

    // 레이어 간 의존성 검사
    for (const edge of arch.edges) {
      const fromLayer = nodeLayer.get(edge.from);
      const toLayer = nodeLayer.get(edge.to);

      if (!fromLayer || !toLayer) continue;

      const fromPriority = LAYER_PRIORITY[fromLayer.toLowerCase()] || 0;
      const toPriority = LAYER_PRIORITY[toLayer.toLowerCase()] || 0;

      // 하위 레이어가 상위 레이어를 참조하면 위반
      if (fromPriority > toPriority) {
        violations.push({
          from: edge.from,
          to: edge.to,
          reason: `${fromLayer} -> ${toLayer}: 하위 레이어가 상위 레이어 참조`,
        });
      }
    }

    return violations;
  }

  /**
   * 아키텍처 문서 생성
   */
  generateDocumentation(arch: ParsedArchitecture): string {
    const lines: string[] = [];

    lines.push('# 아키텍처 문서\n');

    if (arch.title) lines.push(`## ${arch.title}\n`);
    if (arch.description) lines.push(`${arch.description}\n`);

    // 컴포넌트 목록
    lines.push('## 컴포넌트\n');
    const byType = new Map<string, ArchNode[]>();
    for (const node of arch.nodes) {
      const nodes = byType.get(node.type) || [];
      nodes.push(node);
      byType.set(node.type, nodes);
    }

    byType.forEach((typeNodes, type) => {
      lines.push(`### ${type}\n`);
      for (const node of typeNodes) {
        lines.push(`- **${node.name}** (${node.id})`);
        if (node.description) lines.push(`  - ${node.description}`);
        if (node.technology) lines.push(`  - 기술: ${node.technology}`);
      }
      lines.push('');
    });

    // 레이어
    if (arch.layers.length > 0) {
      lines.push('## 레이어\n');
      for (const layer of arch.layers) {
        lines.push(`### ${layer.name}\n`);
        if (layer.description) lines.push(`${layer.description}\n`);
        lines.push(`포함 컴포넌트: ${layer.nodes.join(', ')}\n`);
      }
    }

    // 의존성
    lines.push('## 의존성\n');
    for (const edge of arch.edges) {
      let line = `- ${edge.from} -> ${edge.to}`;
      if (edge.label) line += `: ${edge.label}`;
      if (edge.type !== 'unknown') line += ` (${edge.type})`;
      lines.push(line);
    }

    return lines.join('\n');
  }

  /**
   * BTS에 아키텍처 SPEC 등록
   */
  async registerArchSpecs(arch: ParsedArchitecture): Promise<number[]> {
    const registeredIds: number[] = [];
    const analysis = this.analyzeDependencies(arch);

    // 핵심 컴포넌트 SPEC
    for (const nodeId of analysis.critical) {
      const node = arch.nodes.find(n => n.id === nodeId);
      if (!node) continue;

      const inEdges = arch.edges.filter(e => e.to === nodeId);
      const outEdges = arch.edges.filter(e => e.from === nodeId);

      try {
        const result = await bugCreate({
          type: 'spec',
          title: `[ARCH] 핵심 컴포넌트: ${node.name}`,
          summary: [
            `타입: ${node.type}`,
            `의존받음: ${inEdges.map(e => e.from).join(', ')}`,
            `의존함: ${outEdges.map(e => e.to).join(', ')}`,
            '',
            '이 컴포넌트는 많은 다른 컴포넌트가 의존하는 핵심 요소입니다.',
            '변경 시 영향 범위를 신중히 검토해야 합니다.',
          ].join('\n'),
          priority: 'P1',
          metadata: { source: 'architecture', analysis: 'critical', node },
        });

        if (result?.id) {
          registeredIds.push(result.id);
          console.log(`[ArchParser] 등록됨: BTS-${result.id} - ${node.name}`);
        }
      } catch (error) {
        console.error(`[ArchParser] 등록 실패: ${node.name}`, error);
      }
    }

    // 순환 의존성 이슈
    for (const cycle of analysis.circular) {
      try {
        const result = await bugCreate({
          type: 'bug',
          title: `[ARCH] 순환 의존성 발견`,
          summary: `순환 경로: ${cycle.join(' -> ')} -> ${cycle[0]}\n\n순환 의존성은 코드 유지보수성을 저하시킵니다.`,
          priority: 'P2',
          metadata: { source: 'architecture', analysis: 'circular', cycle },
        });

        if (result?.id) {
          registeredIds.push(result.id);
          console.log(`[ArchParser] 등록됨: BTS-${result.id} - 순환 의존성`);
        }
      } catch (error) {
        console.error('[ArchParser] 등록 실패: 순환 의존성', error);
      }
    }

    // 레이어 위반
    for (const violation of analysis.layerViolations) {
      try {
        const result = await bugCreate({
          type: 'bug',
          title: `[ARCH] 레이어 의존성 위반: ${violation.from} -> ${violation.to}`,
          summary: violation.reason,
          priority: 'P2',
          metadata: { source: 'architecture', analysis: 'layer_violation', violation },
        });

        if (result?.id) {
          registeredIds.push(result.id);
          console.log(`[ArchParser] 등록됨: BTS-${result.id} - 레이어 위반`);
        }
      } catch (error) {
        console.error('[ArchParser] 등록 실패: 레이어 위반', error);
      }
    }

    return registeredIds;
  }
}

// CLI 실행
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log('사용법: npx ts-node arch-parser.ts <file-path> [options]');
    console.log('');
    console.log('옵션:');
    console.log('  --analyze   의존성 분석 수행');
    console.log('  --doc       아키텍처 문서 생성');
    console.log('  --register  이슈를 BTS에 등록');
    console.log('');
    console.log('지원 형식: .mmd, .md (mermaid), .puml, .drawio, .json');
    process.exit(1);
  }

  const filePath = args[0];
  const shouldAnalyze = args.includes('--analyze');
  const shouldDoc = args.includes('--doc');
  const shouldRegister = args.includes('--register');

  if (!fs.existsSync(filePath)) {
    console.error(`파일을 찾을 수 없습니다: ${filePath}`);
    process.exit(1);
  }

  const parser = new ArchParser();
  const arch = await parser.parseFile(filePath);

  console.log(`\n[ArchParser] 아키텍처 파싱 완료\n`);
  console.log(`  노드: ${arch.nodes.length}개`);
  console.log(`  엣지: ${arch.edges.length}개`);
  console.log(`  레이어: ${arch.layers.length}개`);

  if (shouldAnalyze) {
    console.log('\n[ArchParser] 의존성 분석:\n');
    const analysis = parser.analyzeDependencies(arch);

    console.log(`  핵심 컴포넌트: ${analysis.critical.join(', ') || '없음'}`);
    console.log(`  고립 컴포넌트: ${analysis.isolated.join(', ') || '없음'}`);
    console.log(`  순환 의존성: ${analysis.circular.length}개`);
    console.log(`  레이어 위반: ${analysis.layerViolations.length}개`);

    if (analysis.circular.length > 0) {
      console.log('\n  순환 의존성 상세:');
      for (const cycle of analysis.circular) {
        console.log(`    - ${cycle.join(' -> ')}`);
      }
    }

    if (analysis.layerViolations.length > 0) {
      console.log('\n  레이어 위반 상세:');
      for (const v of analysis.layerViolations) {
        console.log(`    - ${v.reason}`);
      }
    }
  }

  if (shouldDoc) {
    console.log('\n[ArchParser] 문서 생성...\n');
    const doc = parser.generateDocumentation(arch);
    const outputPath = filePath.replace(/\.[^.]+$/, '-doc.md');
    fs.writeFileSync(outputPath, doc, 'utf-8');
    console.log(`  저장됨: ${outputPath}`);
  }

  if (shouldRegister) {
    console.log('\n[ArchParser] BTS에 등록 중...\n');
    const ids = await parser.registerArchSpecs(arch);
    console.log(`\n[ArchParser] ${ids.length}개 등록 완료`);
  }
}

if (require.main === module) {
  main().catch(console.error);
}

export default ArchParser;
