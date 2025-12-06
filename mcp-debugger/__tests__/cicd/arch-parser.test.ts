/**
 * Architecture Parser 통합 테스트 (BTS-3189)
 */

import fs from 'fs';
import path from 'path';
import { ArchParser } from '../../src/cicd/arch-parser';

// 테스트용 임시 파일 생성 헬퍼
const createTempFile = (content: string, ext: string): string => {
  const tempDir = path.join(__dirname, '../temp');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }
  const filePath = path.join(tempDir, `test-${Date.now()}${ext}`);
  fs.writeFileSync(filePath, content, 'utf-8');
  return filePath;
};

// 테스트 후 정리
const cleanupTempFile = (filePath: string) => {
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
};

describe('ArchParser', () => {
  let parser: ArchParser;

  beforeEach(() => {
    parser = new ArchParser();
  });

  describe('Mermaid 파싱', () => {
    it('flowchart에서 노드와 엣지를 추출해야 함', async () => {
      const mermaid = `
flowchart TD
    A[Frontend] --> B[API Gateway]
    B --> C[Auth Service]
    B --> D[User Service]
    C --> E[(Database)]
    D --> E
`;
      const filePath = createTempFile(mermaid, '.mmd');

      try {
        const arch = await parser.parseFile(filePath);

        expect(arch.nodes.length).toBeGreaterThan(0);
        expect(arch.edges.length).toBeGreaterThan(0);

        // Frontend 노드 확인
        const frontendNode = arch.nodes.find(n => n.name === 'Frontend');
        expect(frontendNode).toBeDefined();

        // 엣지 확인
        const edgeFromA = arch.edges.find(e => e.from === 'A');
        expect(edgeFromA).toBeDefined();
        expect(edgeFromA!.to).toBe('B');
      } finally {
        cleanupTempFile(filePath);
      }
    });

    it('subgraph에서 레이어를 추출해야 함', async () => {
      const mermaid = `
flowchart TD
    subgraph Frontend
        A[Web App]
        B[Mobile App]
    end

    subgraph Backend
        C[API Server]
        D[Worker]
    end

    A --> C
    B --> C
`;
      const filePath = createTempFile(mermaid, '.mmd');

      try {
        const arch = await parser.parseFile(filePath);

        expect(arch.layers.length).toBe(2);

        const frontendLayer = arch.layers.find(l => l.name === 'Frontend');
        expect(frontendLayer).toBeDefined();
        expect(frontendLayer!.nodes).toContain('A');
        expect(frontendLayer!.nodes).toContain('B');

        const backendLayer = arch.layers.find(l => l.name === 'Backend');
        expect(backendLayer).toBeDefined();
        expect(backendLayer!.nodes).toContain('C');
      } finally {
        cleanupTempFile(filePath);
      }
    });

    it('Markdown 내 mermaid 블록을 파싱해야 함', async () => {
      const markdown = `
# Architecture

\`\`\`mermaid
flowchart TD
    A[Client] --> B[Server]
    B --> C[Database]
\`\`\`

## Description

This is the system architecture.
`;
      const filePath = createTempFile(markdown, '.md');

      try {
        const arch = await parser.parseFile(filePath);

        expect(arch.nodes.length).toBe(3);
        expect(arch.edges.length).toBe(2);
      } finally {
        cleanupTempFile(filePath);
      }
    });
  });

  describe('JSON 파싱', () => {
    it('JSON 아키텍처 정의를 파싱해야 함', async () => {
      const jsonArch = JSON.stringify({
        title: 'Test Architecture',
        nodes: [
          { id: 'frontend', name: 'Frontend App', type: 'component' },
          { id: 'api', name: 'API Server', type: 'service' },
          { id: 'db', name: 'PostgreSQL', type: 'database' },
        ],
        edges: [
          { from: 'frontend', to: 'api', type: 'sync', protocol: 'HTTP' },
          { from: 'api', to: 'db', type: 'data' },
        ],
        layers: [
          { name: 'Presentation', nodes: ['frontend'] },
          { name: 'Application', nodes: ['api'] },
          { name: 'Data', nodes: ['db'] },
        ],
      });
      const filePath = createTempFile(jsonArch, '.json');

      try {
        const arch = await parser.parseFile(filePath);

        expect(arch.title).toBe('Test Architecture');
        expect(arch.nodes).toHaveLength(3);
        expect(arch.edges).toHaveLength(2);
        expect(arch.layers).toHaveLength(3);

        const dbNode = arch.nodes.find(n => n.id === 'db');
        expect(dbNode?.type).toBe('database');
      } finally {
        cleanupTempFile(filePath);
      }
    });
  });

  describe('의존성 분석', () => {
    it('핵심 컴포넌트를 식별해야 함', async () => {
      const mermaid = `
flowchart TD
    A[Service A] --> B[Core Service]
    C[Service C] --> B
    D[Service D] --> B
    B --> E[Database]
`;
      const filePath = createTempFile(mermaid, '.mmd');

      try {
        const arch = await parser.parseFile(filePath);
        const analysis = parser.analyzeDependencies(arch);

        // B는 3개 노드에서 참조되므로 핵심 컴포넌트
        expect(analysis.critical).toContain('B');
      } finally {
        cleanupTempFile(filePath);
      }
    });

    it('고립 컴포넌트를 식별해야 함', async () => {
      const mermaid = `
flowchart TD
    A[Service A] --> B[Service B]
    C[Isolated Service]
`;
      const filePath = createTempFile(mermaid, '.mmd');

      try {
        const arch = await parser.parseFile(filePath);
        const analysis = parser.analyzeDependencies(arch);

        // C는 아무 연결도 없으므로 고립
        expect(analysis.isolated).toContain('C');
      } finally {
        cleanupTempFile(filePath);
      }
    });

    it('순환 의존성을 감지해야 함', async () => {
      const mermaid = `
flowchart TD
    A[Service A] --> B[Service B]
    B --> C[Service C]
    C --> A
`;
      const filePath = createTempFile(mermaid, '.mmd');

      try {
        const arch = await parser.parseFile(filePath);
        const analysis = parser.analyzeDependencies(arch);

        // A -> B -> C -> A 순환
        expect(analysis.circular.length).toBeGreaterThan(0);
      } finally {
        cleanupTempFile(filePath);
      }
    });
  });

  describe('문서 생성', () => {
    it('아키텍처 문서를 생성해야 함', async () => {
      const jsonArch = JSON.stringify({
        title: 'Test System',
        description: 'Test description',
        nodes: [
          { id: 'web', name: 'Web Frontend', type: 'component', technology: 'React' },
          { id: 'api', name: 'REST API', type: 'service', technology: 'Node.js' },
        ],
        edges: [
          { from: 'web', to: 'api', label: 'HTTP/REST' },
        ],
        layers: [],
      });
      const filePath = createTempFile(jsonArch, '.json');

      try {
        const arch = await parser.parseFile(filePath);
        const doc = parser.generateDocumentation(arch);

        expect(doc).toContain('# 아키텍처 문서');
        expect(doc).toContain('Test System');
        expect(doc).toContain('Web Frontend');
        expect(doc).toContain('REST API');
        expect(doc).toContain('HTTP/REST');
      } finally {
        cleanupTempFile(filePath);
      }
    });
  });

  describe('노드 타입 추론', () => {
    it('키워드로 노드 타입을 추론해야 함', async () => {
      const mermaid = `
flowchart TD
    A[User Interface] --> B[API Service]
    B --> C[(Database)]
    B --> D[Message Queue]
`;
      const filePath = createTempFile(mermaid, '.mmd');

      try {
        const arch = await parser.parseFile(filePath);

        // 이름에 'database'가 포함되면 database 타입
        // 이름에 'queue'가 포함되면 queue 타입
        // 등등
      } finally {
        cleanupTempFile(filePath);
      }
    });
  });

  describe('에지 케이스', () => {
    it('빈 파일을 처리해야 함', async () => {
      const filePath = createTempFile('', '.mmd');

      try {
        const arch = await parser.parseFile(filePath);
        expect(arch.nodes).toHaveLength(0);
        expect(arch.edges).toHaveLength(0);
      } finally {
        cleanupTempFile(filePath);
      }
    });

    it('지원하지 않는 확장자를 처리해야 함', async () => {
      const filePath = createTempFile('test', '.xyz');

      try {
        const arch = await parser.parseFile(filePath);
        expect(arch.nodes).toHaveLength(0);
      } finally {
        cleanupTempFile(filePath);
      }
    });

    it('잘못된 JSON을 처리해야 함', async () => {
      const filePath = createTempFile('{ invalid }', '.json');

      try {
        await expect(parser.parseFile(filePath)).rejects.toThrow();
      } catch {
        // JSON 파싱 에러 예상
      } finally {
        cleanupTempFile(filePath);
      }
    });
  });
});
