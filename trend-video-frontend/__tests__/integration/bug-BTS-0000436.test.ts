/**
 * BTS-0000436: GET /api/external/bugs에서 undefined id 참조 에러
 *
 * 검증 내용:
 * - GET 함수 응답에서 정의되지 않은 id 필드가 제거되었는지 확인
 * - POST 함수는 여전히 id, btsId를 반환하는지 확인
 * - GET 함수 응답에 success, count, bugs만 포함되는지 확인
 */

import * as fs from 'fs';
import * as path from 'path';

describe('BTS-0000436: GET /api/external/bugs에서 undefined id 참조 에러', () => {
  const apiRoutePath = path.join(
    __dirname,
    '../../src/app/api/external/bugs/route.ts'
  );

  let routeContent: string;

  beforeAll(() => {
    routeContent = fs.readFileSync(apiRoutePath, 'utf-8');
  });

  describe('GET 함수 응답 검증', () => {
    it('GET 함수가 존재해야 함', () => {
      expect(routeContent).toContain('export async function GET');
    });

    it('GET 함수 응답에 undefined id가 없어야 함', () => {
      // GET 함수 블록 추출
      const getMatch = routeContent.match(/export async function GET[\s\S]*?(?=export async function|$)/);
      expect(getMatch).toBeTruthy();

      const getFunction = getMatch![0];

      // GET 함수의 JSON 응답에서 id, btsId 필드가 없어야 함
      // (개별 bug 객체가 아닌 최상위 응답에서)
      const responseMatch = getFunction.match(/return NextResponse\.json\(\{[\s\S]*?success: true[\s\S]*?\}\);/);
      expect(responseMatch).toBeTruthy();

      const responseBlock = responseMatch![0];

      // count와 bugs만 있고 id, btsId가 없어야 함
      expect(responseBlock).toContain('count:');
      expect(responseBlock).toContain('bugs');
      expect(responseBlock).not.toMatch(/^\s*id,/m);  // 최상위에 id, 가 없어야 함
      expect(responseBlock).not.toMatch(/^\s*btsId:/m);  // 최상위에 btsId: 가 없어야 함
    });
  });

  describe('POST 함수 응답 검증', () => {
    it('POST 함수가 존재해야 함', () => {
      expect(routeContent).toContain('export async function POST');
    });

    it('POST 함수 응답에는 id, btsId가 있어야 함', () => {
      // POST 함수 블록 추출
      const postMatch = routeContent.match(/export async function POST[\s\S]*?(?=export async function|$)/);
      expect(postMatch).toBeTruthy();

      const postFunction = postMatch![0];

      // POST 응답에는 id와 btsId가 있어야 함
      expect(postFunction).toContain('id,');
      expect(postFunction).toContain('btsId: id');
    });
  });

  describe('API 인증 검증', () => {
    it('validateApiKey 함수가 있어야 함', () => {
      expect(routeContent).toContain('function validateApiKey');
    });

    it('Bearer token 인증을 지원해야 함', () => {
      expect(routeContent).toContain("authHeader.startsWith('Bearer ')");
    });

    it('X-API-Key 헤더 인증을 지원해야 함', () => {
      expect(routeContent).toContain("request.headers.get('X-API-Key')");
    });
  });

  describe('CORS 지원 검증', () => {
    it('OPTIONS 함수가 존재해야 함', () => {
      expect(routeContent).toContain('export async function OPTIONS');
    });

    it('CORS 헤더가 설정되어야 함', () => {
      expect(routeContent).toContain("'Access-Control-Allow-Origin'");
      expect(routeContent).toContain("'Access-Control-Allow-Methods'");
      expect(routeContent).toContain("'Access-Control-Allow-Headers'");
    });
  });
});
