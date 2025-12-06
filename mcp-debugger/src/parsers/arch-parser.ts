/**
 * Architecture Parser
 * 아키텍처 다이어그램에서 의존성 분석 및 코드 구조 생성
 */

import * as fs from 'fs';
import * as path from 'path';

export interface ArchComponent {
  id: string;
  name: string;
  type: 'service' | 'api' | 'database' | 'queue' | 'cache' | 'external' | 'ui' | 'worker' | 'scheduler';
  technology?: string;
  description?: string;
  path?: string;
  port?: number;
}

export interface ArchConnection {
  from: string;
  to: string;
  protocol?: string;
  description?: string;
  async?: boolean;
}

export interface ArchLayer {
  name: string;
  components: string[];
}

export interface ArchDocument {
  name: string;
  version?: string;
  components: ArchComponent[];
  connections: ArchConnection[];
  layers: ArchLayer[];
  metadata: Record<string, any>;
}

export interface DependencyGraph {
  nodes: Map<string, ArchComponent>;
  edges: Map<string, string[]>;
  reverseEdges: Map<string, string[]>;
}

/**
 * Mermaid 아키텍처 다이어그램 파싱
 */
export function parseMermaidArchitecture(content: string): ArchDocument {
  const doc: ArchDocument = {
    name: 'Architecture',
    components: [],
    connections: [],
    layers: [],
    metadata: {}
  };

  const lines = content.split('\n').map(l => l.trim()).filter(Boolean);
  let currentSubgraph: ArchLayer | null = null;

  for (const line of lines) {
    // 그래프 타입 (flowchart, graph)
    if (line.match(/^(flowchart|graph)\s+(TB|TD|BT|RL|LR)/i)) {
      continue;
    }

    // 서브그래프 (레이어)
    const subgraphMatch = line.match(/^subgraph\s+"?([^"]+)"?/i);
    if (subgraphMatch) {
      currentSubgraph = {
        name: subgraphMatch[1],
        components: []
      };
      continue;
    }

    if (line.toLowerCase() === 'end' && currentSubgraph) {
      doc.layers.push(currentSubgraph);
      currentSubgraph = null;
      continue;
    }

    // 노드 정의 (id[label] 또는 id((label)) 또는 id{label} 등)
    const nodeMatch = line.match(/^(\w+)(\[|\(|\{|\[\[|\(\()([^\]\)\}]+)(\]|\)|\}|\]\]|\)\))/);
    if (nodeMatch) {
      const [, id, shape, label] = nodeMatch;
      const component: ArchComponent = {
        id,
        name: label,
        type: shapeToType(shape)
      };
      doc.components.push(component);

      if (currentSubgraph) {
        currentSubgraph.components.push(id);
      }
      continue;
    }

    // 연결 정의 (A --> B 또는 A -.-> B 등)
    const connMatch = line.match(/(\w+)\s*(-->|--o|--x|\.\->|==+>)\s*(?:\|([^|]+)\|)?\s*(\w+)/);
    if (connMatch) {
      const [, from, arrow, desc, to] = connMatch;
      doc.connections.push({
        from,
        to,
        description: desc,
        async: arrow.includes('.')
      });
    }
  }

  return doc;
}

/**
 * C4 모델 다이어그램 파싱 (plantuml 형식)
 */
export function parseC4Model(content: string): ArchDocument {
  const doc: ArchDocument = {
    name: 'C4 Architecture',
    components: [],
    connections: [],
    layers: [],
    metadata: {}
  };

  const lines = content.split('\n');

  for (const line of lines) {
    // Person, System, Container, Component 파싱
    const entityMatch = line.match(/(Person|System|Container|Component|Database|Queue)\s*\(\s*(\w+)\s*,\s*"([^"]+)"(?:\s*,\s*"([^"]+)")?/);
    if (entityMatch) {
      const [, type, id, name, desc] = entityMatch;
      doc.components.push({
        id,
        name,
        type: c4TypeToComponentType(type),
        description: desc
      });
    }

    // Rel 관계 파싱
    const relMatch = line.match(/Rel\s*\(\s*(\w+)\s*,\s*(\w+)\s*,\s*"([^"]+)"(?:\s*,\s*"([^"]+)")?/);
    if (relMatch) {
      const [, from, to, desc, protocol] = relMatch;
      doc.connections.push({
        from,
        to,
        description: desc,
        protocol
      });
    }
  }

  return doc;
}

/**
 * 의존성 그래프 생성
 */
export function buildDependencyGraph(doc: ArchDocument): DependencyGraph {
  const graph: DependencyGraph = {
    nodes: new Map(),
    edges: new Map(),
    reverseEdges: new Map()
  };

  // 노드 추가
  for (const comp of doc.components) {
    graph.nodes.set(comp.id, comp);
    graph.edges.set(comp.id, []);
    graph.reverseEdges.set(comp.id, []);
  }

  // 엣지 추가
  for (const conn of doc.connections) {
    const fromEdges = graph.edges.get(conn.from);
    if (fromEdges) {
      fromEdges.push(conn.to);
    }

    const toReverseEdges = graph.reverseEdges.get(conn.to);
    if (toReverseEdges) {
      toReverseEdges.push(conn.from);
    }
  }

  return graph;
}

/**
 * 순환 의존성 감지
 */
export function detectCycles(graph: DependencyGraph): string[][] {
  const cycles: string[][] = [];
  const visited = new Set<string>();
  const recursionStack = new Set<string>();
  const path: string[] = [];

  function dfs(node: string): boolean {
    visited.add(node);
    recursionStack.add(node);
    path.push(node);

    const neighbors = graph.edges.get(node) || [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        if (dfs(neighbor)) return true;
      } else if (recursionStack.has(neighbor)) {
        // 순환 발견
        const cycleStart = path.indexOf(neighbor);
        cycles.push([...path.slice(cycleStart), neighbor]);
        return true;
      }
    }

    path.pop();
    recursionStack.delete(node);
    return false;
  }

  for (const nodeId of graph.nodes.keys()) {
    if (!visited.has(nodeId)) {
      dfs(nodeId);
    }
  }

  return cycles;
}

/**
 * 영향도 분석 (어떤 컴포넌트가 변경되면 어디에 영향?)
 */
export function analyzeImpact(graph: DependencyGraph, componentId: string): {
  directDependents: string[];
  indirectDependents: string[];
  dependencies: string[];
} {
  const directDependents = graph.reverseEdges.get(componentId) || [];
  const dependencies = graph.edges.get(componentId) || [];

  // BFS로 간접 의존자 찾기
  const indirectDependents: string[] = [];
  const visited = new Set<string>([componentId]);
  const queue = [...directDependents];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);

    if (!directDependents.includes(current)) {
      indirectDependents.push(current);
    }

    const neighbors = graph.reverseEdges.get(current) || [];
    queue.push(...neighbors);
  }

  return {
    directDependents,
    indirectDependents,
    dependencies
  };
}

/**
 * 폴더 구조 생성
 */
export function generateFolderStructure(doc: ArchDocument): string {
  const structure: string[] = ['project/'];

  // 레이어별 구조
  for (const layer of doc.layers) {
    const layerName = layer.name.toLowerCase().replace(/\s+/g, '-');
    structure.push(`├── ${layerName}/`);

    for (const compId of layer.components) {
      const comp = doc.components.find(c => c.id === compId);
      if (comp) {
        const fileName = comp.name.toLowerCase().replace(/\s+/g, '-');
        structure.push(`│   ├── ${fileName}/`);
        structure.push(`│   │   ├── index.ts`);
        structure.push(`│   │   ├── types.ts`);
        structure.push(`│   │   └── ${fileName}.test.ts`);
      }
    }
  }

  // 레이어에 속하지 않은 컴포넌트
  const layerComponents = new Set(doc.layers.flatMap(l => l.components));
  const standaloneComponents = doc.components.filter(c => !layerComponents.has(c.id));

  if (standaloneComponents.length > 0) {
    structure.push('├── shared/');
    for (const comp of standaloneComponents) {
      const fileName = comp.name.toLowerCase().replace(/\s+/g, '-');
      structure.push(`│   └── ${fileName}.ts`);
    }
  }

  return structure.join('\n');
}

/**
 * 인터페이스 코드 생성
 */
export function generateInterfaces(doc: ArchDocument): string {
  const interfaces: string[] = [];

  for (const comp of doc.components) {
    const name = toPascalCase(comp.name);
    const connections = doc.connections.filter(c => c.from === comp.id);

    let code = `/**
 * ${comp.name}
 * Type: ${comp.type}
 * ${comp.description || ''}
 */
export interface I${name} {\n`;

    // 의존성을 메서드로 표현
    for (const conn of connections) {
      const targetComp = doc.components.find(c => c.id === conn.to);
      if (targetComp) {
        const methodName = `${conn.async ? 'async' : ''}${toCamelCase(conn.description || `call${toPascalCase(targetComp.name)}`)}`;
        code += `  ${methodName}(): ${conn.async ? 'Promise<void>' : 'void'};\n`;
      }
    }

    code += '}\n';
    interfaces.push(code);
  }

  return interfaces.join('\n');
}

// Helper functions
function shapeToType(shape: string): ArchComponent['type'] {
  switch (shape) {
    case '[[': return 'database';
    case '((':  return 'cache';
    case '{': return 'queue';
    case '(': return 'external';
    default: return 'service';
  }
}

function c4TypeToComponentType(type: string): ArchComponent['type'] {
  const typeMap: Record<string, ArchComponent['type']> = {
    'Person': 'ui',
    'System': 'service',
    'Container': 'service',
    'Component': 'service',
    'Database': 'database',
    'Queue': 'queue'
  };
  return typeMap[type] || 'service';
}

function toPascalCase(str: string): string {
  return str
    .replace(/[^a-zA-Z0-9]/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join('');
}

function toCamelCase(str: string): string {
  const pascal = toPascalCase(str);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

/**
 * 아키텍처 파일 파싱 (형식 자동 감지)
 */
export function parseArchitectureFile(filePath: string): ArchDocument {
  const content = fs.readFileSync(filePath, 'utf-8');

  // C4 Model 감지
  if (content.includes('@startuml') || content.includes('Person(') || content.includes('System(')) {
    return parseC4Model(content);
  }

  // Mermaid 감지
  if (content.match(/^(flowchart|graph)\s/im)) {
    return parseMermaidArchitecture(content);
  }

  throw new Error('Unknown architecture format. Supported: Mermaid flowchart, C4 Model (PlantUML)');
}

export default {
  parseMermaidArchitecture,
  parseC4Model,
  parseArchitectureFile,
  buildDependencyGraph,
  detectCycles,
  analyzeImpact,
  generateFolderStructure,
  generateInterfaces
};
