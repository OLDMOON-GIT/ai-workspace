/**
 * SPEC Parser 통합 테스트 (BTS-3189)
 */

import fs from 'fs';
import path from 'path';
import { SpecParser } from '../../src/cicd/spec-parser';

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

describe('SpecParser', () => {
  let parser: SpecParser;

  beforeEach(() => {
    parser = new SpecParser();
  });

  describe('Markdown 파싱', () => {
    it('헤딩에서 SPEC을 추출해야 함', async () => {
      const content = `
# 프로젝트 기획서

## 기능 요구사항

### 사용자 인증 기능 구현
로그인, 회원가입, 비밀번호 찾기 기능을 구현합니다.

### API 개발
RESTful API를 개발합니다.
`;
      const filePath = createTempFile(content, '.md');

      try {
        const specs = await parser.parseFile(filePath);

        expect(specs.length).toBeGreaterThan(0);
        expect(specs.some(s => s.title.includes('사용자 인증'))).toBe(true);
      } finally {
        cleanupTempFile(filePath);
      }
    });

    it('체크리스트 항목에서 기능을 추출해야 함', async () => {
      const content = `
# TODO

- [ ] 로그인 기능 추가
- [x] 회원가입 기능 구현
- 대시보드 개선 기능
`;
      const filePath = createTempFile(content, '.md');

      try {
        const specs = await parser.parseFile(filePath);

        expect(specs.length).toBeGreaterThan(0);
        expect(specs.some(s => s.title.includes('로그인'))).toBe(true);
      } finally {
        cleanupTempFile(filePath);
      }
    });

    it('우선순위 키워드를 감지해야 함', async () => {
      const content = `
## 긴급 버그 수정 필요
서비스가 중단되는 심각한 문제입니다.

## 낮음 우선순위 개선
나중에 해도 되는 작업입니다.
`;
      const filePath = createTempFile(content, '.md');

      try {
        const specs = await parser.parseFile(filePath);

        const urgentSpec = specs.find(s => s.title.includes('긴급'));
        const lowSpec = specs.find(s => s.title.includes('낮음'));

        expect(urgentSpec?.priority).toBe('P0');
        expect(lowSpec?.priority).toBe('P3');
      } finally {
        cleanupTempFile(filePath);
      }
    });
  });

  describe('JSON 파싱', () => {
    it('배열 형식 JSON을 파싱해야 함', async () => {
      const content = JSON.stringify([
        { title: '첫 번째 기능', summary: '설명1', priority: 'P1' },
        { title: '두 번째 기능', summary: '설명2', priority: 'P2' },
      ]);
      const filePath = createTempFile(content, '.json');

      try {
        const specs = await parser.parseFile(filePath);

        expect(specs).toHaveLength(2);
        expect(specs[0].title).toBe('첫 번째 기능');
        expect(specs[0].priority).toBe('P1');
        expect(specs[1].title).toBe('두 번째 기능');
      } finally {
        cleanupTempFile(filePath);
      }
    });

    it('specs 필드가 있는 JSON을 파싱해야 함', async () => {
      const content = JSON.stringify({
        projectName: '테스트 프로젝트',
        specs: [
          { name: 'API 구현', description: 'REST API 개발' },
          { name: 'UI 개발', description: '사용자 인터페이스' },
        ],
      });
      const filePath = createTempFile(content, '.json');

      try {
        const specs = await parser.parseFile(filePath);

        expect(specs).toHaveLength(2);
        expect(specs[0].title).toBe('API 구현');
      } finally {
        cleanupTempFile(filePath);
      }
    });
  });

  describe('텍스트 파싱', () => {
    it('번호가 있는 항목을 추출해야 함', async () => {
      const content = `
1. 사용자 인증 시스템 구현
2. 데이터베이스 설계
3. API 엔드포인트 개발
`;
      const filePath = createTempFile(content, '.txt');

      try {
        const specs = await parser.parseFile(filePath);

        expect(specs).toHaveLength(3);
        expect(specs[0].title).toContain('사용자 인증');
        expect(specs[1].title).toContain('데이터베이스');
        expect(specs[2].title).toContain('API');
      } finally {
        cleanupTempFile(filePath);
      }
    });

    it('불릿 포인트 항목을 추출해야 함', async () => {
      const content = `
- 로그인 페이지 구현
• 회원가입 폼 추가
* 비밀번호 재설정 기능
`;
      const filePath = createTempFile(content, '.txt');

      try {
        const specs = await parser.parseFile(filePath);

        expect(specs.length).toBeGreaterThan(0);
      } finally {
        cleanupTempFile(filePath);
      }
    });
  });

  describe('에지 케이스', () => {
    it('빈 파일을 처리해야 함', async () => {
      const filePath = createTempFile('', '.md');

      try {
        const specs = await parser.parseFile(filePath);
        expect(specs).toHaveLength(0);
      } finally {
        cleanupTempFile(filePath);
      }
    });

    it('지원하지 않는 확장자를 처리해야 함', async () => {
      const filePath = createTempFile('test', '.xyz');

      try {
        const specs = await parser.parseFile(filePath);
        expect(specs).toHaveLength(0);
      } finally {
        cleanupTempFile(filePath);
      }
    });

    it('잘못된 JSON을 처리해야 함', async () => {
      const filePath = createTempFile('{ invalid json }', '.json');

      try {
        const specs = await parser.parseFile(filePath);
        expect(specs).toHaveLength(0);
      } finally {
        cleanupTempFile(filePath);
      }
    });
  });
});
