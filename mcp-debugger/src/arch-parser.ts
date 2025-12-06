/**
 * Architecture Parser
 * 아키텍처 다이어그램에서 의존성 분석 및 컴포넌트 추출
 *
 * 지원 포맷:
 * - Mermaid flowchart/C4
 * - PlantUML component/deployment
 * - JSON 아키텍처 정의
 * - draw.io XML (기본 지원)
 *
 * 분석 항목:
 * - 컴포넌트/서비스 목록
 * - 의존성 그래프
 * - 데이터 흐름
 * - 레이어 구조
 */

import fs from 'fs';
import path from 'path';

export interface ArchComponent {
  id: string;
  name: string;
  type: 'service' | 'database' | 'queue' | 'cache' | 'api' | 'ui' | 'external' | 'other';
  layer?: 'presentation' | 'application' | 'domain' | 'infrastructure';
  description?: string;
  technology?: string;
  endpoints?: string[];
  dependencies: string[]; // component IDs
  metadata?: Record<string, any>;
}

export interface ArchConnection {
  from: string; // component ID
  to: string;   // component ID
  label?: string;
  protocol?: 'http' | 'https' | 'grpc' | 'websocket' | 'tcp' | 'amqp' | 'other';
  async?: boolean;
  dataFlow?: 'unidirectional' | 'bidirectional';
}

export interface ArchLayer {
  name: string;
  components: string[]; // component IDs
}

export interface ArchParserResult {
  success: boolean;
  components: ArchComponent[];
  connections: ArchConnection[];
  layers: ArchLayer[];
  dataFlows: Array<{ path: string[]; description?: string }>;
  errors: string[];
}

export interface DependencyAnalysis {
  graph: Map<string, string[]>;
  cycles: string[][];
  entryPoints: string[];
  leafNodes: string[];
  criticalPath: string[];
  metrics: {
    totalComponents: number;
    totalConnections: number;
    averageDependencies: number;
    maxDependencies: { component: string; count: number };
    couplingScore: number;
  };
}

/**
 * 아키텍처 파일 파싱
 */
export async function parseArchitectureFile(filePath: string): Promise<ArchParserResult> {
  const result: ArchParserResult = {
    success: false,
    components: [],
    connections: [],
    layers: [],
    dataFlows: [],
    errors: []
  };

  try {
    if (!fs.existsSync(filePath)) {
      result.errors.push(`파일을 찾을 수 없습니다: ${filePath}`);
      return result;
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const ext = path.extname(filePath).toLowerCase();

    if (ext === '.json') {
      const parsed = parseJsonArchitecture(content);
      Object.assign(result, parsed);
    } else if (content.includes('flowchart') || content.includes('graph') || content.includes('C4')) {
      const parsed = parseMermaidArchitecture(content);
      Object.assign(result, parsed);
    } else if (content.includes('@startuml')) {
      const parsed = parsePlantUMLArchitecture(content);
      Object.assign(result, parsed);
    } else if (content.includes('<mxfile') || content.includes('<diagram')) {
      const parsed = parseDrawioArchitecture(content);
      Object.assign(result, parsed);
    } else {
      // 텍스트 기반 파싱 시도
      const parsed = parseTextArchitecture(content);
      Object.assign(result, parsed);
    }

    result.success = result.components.length > 0;
    if (!result.success) {
      result.errors.push('컴포넌트를 추출할 수 없습니다.');
    }
  } catch (error: any) {
    result.errors.push(`파싱 오류: ${error.message}`);
  }

  return result;
}

/**
 * JSON 아키텍처 파싱
 */
function parseJsonArchitecture(content: string): Partial<ArchParserResult> {
  const result: Partial<ArchParserResult> = {
    components: [],
    connections: [],
    layers: [],
    dataFlows: [],
    errors: []
  };

  try {
    const data = JSON.parse(content);

    // 컴포넌트 파싱
    const compData = data.components || data.services || data.nodes || [];
    for (const comp of compData) {
      result.components!.push({
        id: comp.id || comp.name || generateId(),
        name: comp.name || comp.label || comp.title,
        type: normalizeComponentType(comp.type || comp.kind),
        layer: normalizeLayer(comp.layer),
        description: comp.description,
        technology: comp.technology || comp.tech,
        endpoints: comp.endpoints || comp.apis || [],
        dependencies: comp.dependencies || comp.depends || [],
        metadata: comp.metadata || comp.meta
      });
    }

    // 연결 파싱
    const connData = data.connections || data.links || data.edges || data.relations || [];
    for (const conn of connData) {
      result.connections!.push({
        from: conn.from || conn.source,
        to: conn.to || conn.target,
        label: conn.label || conn.name,
        protocol: conn.protocol,
        async: conn.async,
        dataFlow: conn.dataFlow || conn.direction
      });
    }

    // 레이어 파싱
    const layerData = data.layers || [];
    for (const layer of layerData) {
      result.layers!.push({
        name: layer.name,
        components: layer.components || []
      });
    }

    // 데이터 플로우 파싱
    const flowData = data.dataFlows || data.flows || [];
    for (const flow of flowData) {
      result.dataFlows!.push({
        path: flow.path || flow.nodes || [],
        description: flow.description
      });
    }
  } catch (error: any) {
    result.errors!.push(`JSON 파싱 오류: ${error.message}`);
  }

  return result;
}

/**
 * Mermaid 아키텍처 파싱
 */
function parseMermaidArchitecture(content: string): Partial<ArchParserResult> {
  const result: Partial<ArchParserResult> = {
    components: [],
    connections: [],
    layers: [],
    dataFlows: [],
    errors: []
  };

  const componentMap = new Map<string, ArchComponent>();

  // 노드 정의 추출
  // 형식: A[Component Name] 또는 A((Database)) 또는 A{Decision}
  const nodePattern = /(\w+)[\[({\<]([^\]\)}\>]+)[\]\)}\>]/g;
  let match;

  while ((match = nodePattern.exec(content)) !== null) {
    const id = match[1];
    const name = match[2];

    // 노드 모양으로 타입 추론
    const fullMatch = match[0];
    let type: ArchComponent['type'] = 'other';

    if (fullMatch.includes('[(') || fullMatch.includes(')]')) {
      type = 'database';
    } else if (fullMatch.includes('{{') || fullMatch.includes('}}')) {
      type = 'queue';
    } else if (fullMatch.includes('([') || fullMatch.includes('])')) {
      type = 'cache';
    } else if (fullMatch.includes('<') || fullMatch.includes('>')) {
      type = 'external';
    } else {
      type = inferComponentType(name);
    }

    if (!componentMap.has(id)) {
      componentMap.set(id, {
        id,
        name,
        type,
        dependencies: []
      });
    }
  }

  // 연결 추출
  // 형식: A --> B 또는 A --label--> B 또는 A -.-> B
  const connPattern = /(\w+)\s*([-.])+(?:>|->|\|[^|]+\|>?)\s*(\w+)(?:\s*:\s*(.+))?/g;

  while ((match = connPattern.exec(content)) !== null) {
    const from = match[1];
    const to = match[3];
    const label = match[4];
    const isDashed = match[0].includes('-.');

    result.connections!.push({
      from,
      to,
      label,
      async: isDashed
    });

    // 의존성 추가
    if (componentMap.has(from)) {
      componentMap.get(from)!.dependencies.push(to);
    }

    // 암묵적 노드 추가
    if (!componentMap.has(from)) {
      componentMap.set(from, {
        id: from,
        name: from,
        type: 'other',
        dependencies: [to]
      });
    }
    if (!componentMap.has(to)) {
      componentMap.set(to, {
        id: to,
        name: to,
        type: 'other',
        dependencies: []
      });
    }
  }

  // subgraph으로 레이어 추출
  const subgraphPattern = /subgraph\s+(\w+)[\[\s]*([^\]]*)?[\]\s]*([\s\S]*?)end/gi;

  while ((match = subgraphPattern.exec(content)) !== null) {
    const layerName = match[2] || match[1];
    const body = match[3];

    const componentIds: string[] = [];
    for (const [id] of componentMap) {
      if (body.includes(id)) {
        componentIds.push(id);
        componentMap.get(id)!.layer = inferLayer(layerName);
      }
    }

    if (componentIds.length > 0) {
      result.layers!.push({
        name: layerName,
        components: componentIds
      });
    }
  }

  result.components = Array.from(componentMap.values());
  return result;
}

/**
 * PlantUML 아키텍처 파싱
 */
function parsePlantUMLArchitecture(content: string): Partial<ArchParserResult> {
  const result: Partial<ArchParserResult> = {
    components: [],
    connections: [],
    layers: [],
    dataFlows: [],
    errors: []
  };

  const componentMap = new Map<string, ArchComponent>();

  // 컴포넌트 정의 추출
  // 형식: [Component Name] as alias 또는 component "Name" as alias
  const compPatterns = [
    /\[([^\]]+)\]\s+as\s+(\w+)/g,
    /component\s+"([^"]+)"\s+as\s+(\w+)/g,
    /database\s+"([^"]+)"\s+as\s+(\w+)/g,
    /queue\s+"([^"]+)"\s+as\s+(\w+)/g,
    /node\s+"([^"]+)"\s+as\s+(\w+)/g,
    /actor\s+"([^"]+)"\s+as\s+(\w+)/g,
  ];

  for (const pattern of compPatterns) {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      const name = match[1];
      const id = match[2];
      const type = inferTypeFromPattern(pattern.source);

      componentMap.set(id, {
        id,
        name,
        type,
        dependencies: []
      });
    }
  }

  // 연결 추출
  // 형식: A --> B : label 또는 A ..> B
  const connPattern = /(\w+)\s*([-.]+>)\s*(\w+)(?:\s*:\s*(.+))?/g;
  let match;

  while ((match = connPattern.exec(content)) !== null) {
    const from = match[1];
    const to = match[3];
    const label = match[4];
    const arrow = match[2];

    result.connections!.push({
      from,
      to,
      label,
      async: arrow.includes('..')
    });

    if (componentMap.has(from)) {
      componentMap.get(from)!.dependencies.push(to);
    }
  }

  // package/folder로 레이어 추출
  const pkgPattern = /(?:package|folder)\s+"([^"]+)"\s*\{([\s\S]*?)\}/gi;

  while ((match = pkgPattern.exec(content)) !== null) {
    const layerName = match[1];
    const body = match[2];

    const componentIds: string[] = [];
    for (const [id] of componentMap) {
      if (body.includes(id)) {
        componentIds.push(id);
        componentMap.get(id)!.layer = inferLayer(layerName);
      }
    }

    if (componentIds.length > 0) {
      result.layers!.push({
        name: layerName,
        components: componentIds
      });
    }
  }

  result.components = Array.from(componentMap.values());
  return result;
}

/**
 * draw.io XML 파싱 (기본)
 */
function parseDrawioArchitecture(content: string): Partial<ArchParserResult> {
  const result: Partial<ArchParserResult> = {
    components: [],
    connections: [],
    layers: [],
    dataFlows: [],
    errors: []
  };

  // mxCell 태그에서 노드와 엣지 추출
  const cellPattern = /<mxCell[^>]*id="([^"]*)"[^>]*value="([^"]*)"[^>]*(?:source="([^"]*)")?(?:[^>]*target="([^"]*)")?[^>]*>/g;
  let match;

  const componentMap = new Map<string, ArchComponent>();

  while ((match = cellPattern.exec(content)) !== null) {
    const id = match[1];
    const value = match[2];
    const source = match[3];
    const target = match[4];

    if (source && target) {
      // 엣지 (연결)
      result.connections!.push({
        from: source,
        to: target,
        label: value
      });

      if (componentMap.has(source)) {
        componentMap.get(source)!.dependencies.push(target);
      }
    } else if (value && !id.startsWith('0') && !id.startsWith('1')) {
      // 노드 (컴포넌트)
      componentMap.set(id, {
        id,
        name: value,
        type: inferComponentType(value),
        dependencies: []
      });
    }
  }

  result.components = Array.from(componentMap.values());
  return result;
}

/**
 * 텍스트 기반 아키텍처 파싱
 */
function parseTextArchitecture(content: string): Partial<ArchParserResult> {
  const result: Partial<ArchParserResult> = {
    components: [],
    connections: [],
    layers: [],
    dataFlows: [],
    errors: []
  };

  const componentMap = new Map<string, ArchComponent>();
  const lines = content.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // 화살표 패턴 감지
    const arrowMatch = trimmed.match(/([^\s->]+)\s*(?:->|→|=>|--?>)\s*([^\s->]+)/);
    if (arrowMatch) {
      const from = arrowMatch[1];
      const to = arrowMatch[2];

      result.connections!.push({ from, to });

      if (!componentMap.has(from)) {
        componentMap.set(from, {
          id: from,
          name: from,
          type: inferComponentType(from),
          dependencies: []
        });
      }
      if (!componentMap.has(to)) {
        componentMap.set(to, {
          id: to,
          name: to,
          type: inferComponentType(to),
          dependencies: []
        });
      }
      componentMap.get(from)!.dependencies.push(to);
    }
  }

  result.components = Array.from(componentMap.values());
  return result;
}

/**
 * 컴포넌트 타입 정규화
 */
function normalizeComponentType(type: string): ArchComponent['type'] {
  const lower = (type || '').toLowerCase();

  if (/database|db|mysql|postgres|mongo|redis|storage/.test(lower)) return 'database';
  if (/queue|mq|rabbit|kafka|sqs|message/.test(lower)) return 'queue';
  if (/cache|memcache|redis/.test(lower)) return 'cache';
  if (/api|gateway|endpoint|rest|graphql/.test(lower)) return 'api';
  if (/ui|frontend|web|app|client/.test(lower)) return 'ui';
  if (/external|third.?party|vendor/.test(lower)) return 'external';
  if (/service|server|backend|worker/.test(lower)) return 'service';

  return 'other';
}

/**
 * 레이어 정규화
 */
function normalizeLayer(layer: string): ArchComponent['layer'] | undefined {
  const lower = (layer || '').toLowerCase();

  if (/present|ui|web|frontend|client/.test(lower)) return 'presentation';
  if (/app|application|service|business/.test(lower)) return 'application';
  if (/domain|core|model|entity/.test(lower)) return 'domain';
  if (/infra|data|persist|external/.test(lower)) return 'infrastructure';

  return undefined;
}

/**
 * 컴포넌트 이름으로 타입 추론
 */
function inferComponentType(name: string): ArchComponent['type'] {
  return normalizeComponentType(name);
}

/**
 * 레이어 이름으로 레이어 추론
 */
function inferLayer(name: string): ArchComponent['layer'] | undefined {
  return normalizeLayer(name);
}

/**
 * 패턴으로 타입 추론
 */
function inferTypeFromPattern(pattern: string): ArchComponent['type'] {
  if (pattern.includes('database')) return 'database';
  if (pattern.includes('queue')) return 'queue';
  if (pattern.includes('actor')) return 'external';
  if (pattern.includes('node')) return 'service';
  return 'service';
}

/**
 * ID 생성
 */
function generateId(): string {
  return Math.random().toString(36).substring(2, 11);
}

/**
 * 의존성 분석
 */
export function analyzeDependencies(result: ArchParserResult): DependencyAnalysis {
  const graph = new Map<string, string[]>();

  // 그래프 초기화
  for (const comp of result.components) {
    graph.set(comp.id, comp.dependencies.slice());
  }

  // 연결에서 추가
  for (const conn of result.connections) {
    if (graph.has(conn.from)) {
      const deps = graph.get(conn.from)!;
      if (!deps.includes(conn.to)) {
        deps.push(conn.to);
      }
    }
  }

  // 사이클 탐지
  const cycles = detectCycles(graph);

  // 진입점 (의존되지 않는 노드)
  const dependedBy = new Set<string>();
  for (const deps of graph.values()) {
    deps.forEach(d => dependedBy.add(d));
  }
  const entryPoints = Array.from(graph.keys()).filter(id => !dependedBy.has(id));

  // 리프 노드 (의존하는 것이 없는 노드)
  const leafNodes = Array.from(graph.entries())
    .filter(([, deps]) => deps.length === 0)
    .map(([id]) => id);

  // 크리티컬 패스 (가장 긴 경로)
  const criticalPath = findCriticalPath(graph, entryPoints);

  // 메트릭스
  const totalConnections = result.connections.length;
  const depsCount = Array.from(graph.values()).map(d => d.length);
  const maxDeps = Math.max(...depsCount, 0);
  const maxDepsId = Array.from(graph.entries()).find(([, d]) => d.length === maxDeps)?.[0] || '';

  const metrics = {
    totalComponents: result.components.length,
    totalConnections,
    averageDependencies: depsCount.length > 0 ? depsCount.reduce((a, b) => a + b, 0) / depsCount.length : 0,
    maxDependencies: { component: maxDepsId, count: maxDeps },
    couplingScore: calculateCouplingScore(graph)
  };

  return {
    graph,
    cycles,
    entryPoints,
    leafNodes,
    criticalPath,
    metrics
  };
}

/**
 * 사이클 탐지 (DFS)
 */
function detectCycles(graph: Map<string, string[]>): string[][] {
  const cycles: string[][] = [];
  const visited = new Set<string>();
  const recStack = new Set<string>();

  function dfs(node: string, path: string[]): void {
    if (recStack.has(node)) {
      const cycleStart = path.indexOf(node);
      if (cycleStart !== -1) {
        cycles.push(path.slice(cycleStart).concat(node));
      }
      return;
    }

    if (visited.has(node)) return;

    visited.add(node);
    recStack.add(node);

    const deps = graph.get(node) || [];
    for (const dep of deps) {
      dfs(dep, [...path, node]);
    }

    recStack.delete(node);
  }

  for (const node of graph.keys()) {
    dfs(node, []);
  }

  return cycles;
}

/**
 * 크리티컬 패스 찾기
 */
function findCriticalPath(graph: Map<string, string[]>, entryPoints: string[]): string[] {
  let longestPath: string[] = [];

  function dfs(node: string, path: string[]): void {
    const newPath = [...path, node];

    if (newPath.length > longestPath.length) {
      longestPath = newPath;
    }

    const deps = graph.get(node) || [];
    for (const dep of deps) {
      if (!path.includes(dep)) {
        dfs(dep, newPath);
      }
    }
  }

  for (const entry of entryPoints) {
    dfs(entry, []);
  }

  // 진입점이 없으면 모든 노드에서 시작
  if (longestPath.length === 0) {
    for (const node of graph.keys()) {
      dfs(node, []);
    }
  }

  return longestPath;
}

/**
 * 결합도 점수 계산
 */
function calculateCouplingScore(graph: Map<string, string[]>): number {
  const n = graph.size;
  if (n <= 1) return 0;

  let totalDeps = 0;
  for (const deps of graph.values()) {
    totalDeps += deps.length;
  }

  // 최대 가능 연결 수 대비 실제 연결 비율
  const maxConnections = n * (n - 1);
  return maxConnections > 0 ? (totalDeps / maxConnections) * 100 : 0;
}

/**
 * 아키텍처 리포트 생성
 */
export function generateArchitectureReport(result: ArchParserResult): string {
  const analysis = analyzeDependencies(result);

  let report = '# Architecture Analysis Report\n\n';

  report += '## Components\n\n';
  report += `| ID | Name | Type | Layer | Dependencies |\n`;
  report += `|----|------|------|-------|-------------|\n`;
  for (const comp of result.components) {
    report += `| ${comp.id} | ${comp.name} | ${comp.type} | ${comp.layer || '-'} | ${comp.dependencies.length} |\n`;
  }

  report += '\n## Metrics\n\n';
  report += `- Total Components: ${analysis.metrics.totalComponents}\n`;
  report += `- Total Connections: ${analysis.metrics.totalConnections}\n`;
  report += `- Average Dependencies: ${analysis.metrics.averageDependencies.toFixed(2)}\n`;
  report += `- Max Dependencies: ${analysis.metrics.maxDependencies.component} (${analysis.metrics.maxDependencies.count})\n`;
  report += `- Coupling Score: ${analysis.metrics.couplingScore.toFixed(2)}%\n`;

  if (analysis.cycles.length > 0) {
    report += '\n## ⚠️ Cyclic Dependencies\n\n';
    for (const cycle of analysis.cycles) {
      report += `- ${cycle.join(' → ')}\n`;
    }
  }

  if (analysis.criticalPath.length > 0) {
    report += '\n## Critical Path\n\n';
    report += `${analysis.criticalPath.join(' → ')}\n`;
  }

  report += '\n## Entry Points\n\n';
  for (const entry of analysis.entryPoints) {
    const comp = result.components.find(c => c.id === entry);
    report += `- ${comp?.name || entry}\n`;
  }

  report += '\n## Leaf Nodes (External Dependencies)\n\n';
  for (const leaf of analysis.leafNodes) {
    const comp = result.components.find(c => c.id === leaf);
    report += `- ${comp?.name || leaf}\n`;
  }

  return report;
}

// CLI 실행
if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log(`
사용법: npx tsx arch-parser.ts <아키텍처 파일>

지원 형식:
  - JSON 아키텍처 (.json)
  - Mermaid diagram (.mmd, .md)
  - PlantUML (.puml)
  - draw.io XML (.drawio, .xml)

옵션:
  --report         분석 리포트 출력
  --output <file>  리포트 파일 저장

예시:
  npx tsx arch-parser.ts ./architecture.json
  npx tsx arch-parser.ts ./diagram.mmd --report
`);
    process.exit(1);
  }

  const filePath = path.resolve(args[0]);
  const showReport = args.includes('--report');
  const outputIdx = args.indexOf('--output');
  const outputFile = outputIdx !== -1 ? args[outputIdx + 1] : null;

  parseArchitectureFile(filePath).then(result => {
    if (result.success) {
      console.log(`\n✅ 아키텍처 파싱 완료:`);
      console.log(`  - 컴포넌트: ${result.components.length}개`);
      console.log(`  - 연결: ${result.connections.length}개`);
      console.log(`  - 레이어: ${result.layers.length}개`);

      if (showReport || outputFile) {
        const report = generateArchitectureReport(result);

        if (outputFile) {
          fs.writeFileSync(path.resolve(outputFile), report);
          console.log(`\n📄 리포트 저장: ${outputFile}`);
        } else {
          console.log('\n' + report);
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

export default { parseArchitectureFile, analyzeDependencies, generateArchitectureReport };
