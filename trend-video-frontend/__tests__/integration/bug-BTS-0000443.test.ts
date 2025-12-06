/**
 * BTS-0000443: /api/external/bugs/new GET 엔드포인트
 *
 * 검증 내용:
 * - GET 메서드로 버그 등록 가능
 * - URL 파라미터로 title, type, priority, summary 지원
 * - HTML 응답 반환
 * - 필수 파라미터 검증
 */

import * as fs from 'fs';
import * as path from 'path';

describe('BTS-0000443: /api/external/bugs/new GET 엔드포인트', () => {
  const apiRoutePath = path.join(
    __dirname,
    '../../src/app/api/external/bugs/new/route.ts'
  );

  let routeContent: string;

  beforeAll(() => {
    routeContent = fs.readFileSync(apiRoutePath, 'utf-8');
  });

  describe('GET 메서드 검증', () => {
    it('GET 함수가 export되어야 함', () => {
      expect(routeContent).toContain('export async function GET');
    });

    it('searchParams에서 파라미터를 추출해야 함', () => {
      expect(routeContent).toContain('searchParams.get');
    });
  });

  describe('파라미터 처리 검증', () => {
    it('title 파라미터를 처리해야 함', () => {
      expect(routeContent).toContain("searchParams.get('title')");
    });

    it('type 파라미터를 처리해야 함 (기본값 bug)', () => {
      expect(routeContent).toContain("searchParams.get('type')");
      expect(routeContent).toContain("|| 'bug'");
    });

    it('priority 파라미터를 처리해야 함 (기본값 P2)', () => {
      expect(routeContent).toContain("searchParams.get('priority')");
      expect(routeContent).toContain("|| 'P2'");
    });

    it('summary 파라미터를 처리해야 함', () => {
      expect(routeContent).toContain("searchParams.get('summary')");
    });
  });

  describe('유효성 검사', () => {
    it('title이 없으면 에러를 반환해야 함', () => {
      expect(routeContent).toContain('if (!title)');
      expect(routeContent).toContain('title 파라미터가 필요합니다');
    });

    it('type은 bug 또는 spec만 허용해야 함', () => {
      expect(routeContent).toContain("['bug', 'spec'].includes(type)");
    });

    it('잘못된 type이면 400 에러를 반환해야 함', () => {
      expect(routeContent).toContain('type은 "bug" 또는 "spec"만 가능합니다');
    });
  });

  describe('버그 등록 로직', () => {
    it('bug_sequence에서 ID를 생성해야 함', () => {
      expect(routeContent).toContain('bug_sequence');
      expect(routeContent).toContain('next_number');
    });

    it('BTS-XXXXXXX 형식의 ID를 생성해야 함', () => {
      expect(routeContent).toContain('BTS-${String(nextNum).padStart(7,');
    });

    it('bugs 테이블에 INSERT해야 함', () => {
      expect(routeContent).toContain('INSERT INTO bugs');
    });

    it('metadata에 source: url-api를 포함해야 함', () => {
      expect(routeContent).toContain("source: 'url-api'");
    });
  });

  describe('HTML 응답', () => {
    it('HTML 응답을 반환해야 함', () => {
      expect(routeContent).toContain('Content-Type');
      expect(routeContent).toContain('text/html');
    });

    it('등록 완료 메시지를 표시해야 함', () => {
      expect(routeContent).toContain('버그 등록 완료');
    });

    it('/admin/bugs 링크를 포함해야 함', () => {
      expect(routeContent).toContain('/admin/bugs');
    });
  });

  describe('에러 핸들링', () => {
    it('에러 시 500 상태 코드를 반환해야 함', () => {
      expect(routeContent).toContain('status: 500');
    });

    it('에러 로그를 남겨야 함', () => {
      expect(routeContent).toContain("console.error('GET /api/external/bugs/new error:'");
    });
  });
});
