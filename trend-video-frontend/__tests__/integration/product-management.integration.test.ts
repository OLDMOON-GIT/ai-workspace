/**
 * 상품관리 통합테스트
 * @fileoverview 쿠팡 상품 CRUD, 딥링크 생성, 클릭 추적 등
 * @refactored 2025-11-28
 * @see .claude/REFACTORING_SPEC.md
 */

import {
  mockSessionIds,
  mockUsers,
  mockFetch,
  createMockCoupangProduct,
  createSuccessResponse,
  createErrorResponse,
  setupTestEnvironment,
  teardownTestEnvironment,
} from '../helpers/test-utils';
import { v4 as uuidv4 } from 'uuid';

// Mock 상품 데이터 (DB 구조에 맞춤)
const createMockProductDB = (overrides?: Partial<any>) => ({
  id: 'cp_' + uuidv4(),
  user_id: mockUsers.regular.userId,
  title: '테스트 상품',
  description: '테스트 상품 설명입니다.',
  category: '전자기기',
  image_url: 'https://example.com/product.jpg',
  product_url: 'https://www.coupang.com/vp/products/123456',
  deep_link: 'https://link.coupang.com/a/test123',
  original_price: 35000,
  discount_price: 29900,
  status: 'active',
  view_count: 0,
  click_count: 0,
  is_favorite: 0,
  queue_id: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  ...overrides,
});

describe('상품관리 통합테스트', () => {
  beforeEach(() => {
    setupTestEnvironment();
  });

  afterEach(() => {
    teardownTestEnvironment();
  });

  describe('상품 목록 조회 (GET /api/coupang-products)', () => {
    it('인증된 사용자의 상품 목록 조회 성공', async () => {
      const mockProducts = [
        createMockProductDB(),
        createMockProductDB({ title: '두 번째 상품' }),
        createMockProductDB({ title: '세 번째 상품' }),
      ];

      const mockResponse = createSuccessResponse({
        products: mockProducts,
        total: 3,
      });

      global.fetch = mockFetch(mockResponse, 200);

      const response = await fetch('/api/coupang-products', {
        headers: {
          'Authorization': `Bearer ${mockSessionIds.regular}`,
        },
      });

      const data = await response.json();

      expect(response.ok).toBe(true);
      expect(data.products).toBeDefined();
      expect(Array.isArray(data.products)).toBe(true);
      expect(data.products.length).toBe(3);
      expect(data.total).toBe(3);
    });

    it('카테고리별 필터링 조회', async () => {
      const mockProducts = [
        createMockProductDB({ category: '식품' }),
        createMockProductDB({ category: '식품', title: '식품2' }),
      ];

      const mockResponse = createSuccessResponse({
        products: mockProducts,
        total: 2,
      });

      global.fetch = mockFetch(mockResponse, 200);

      const response = await fetch('/api/coupang-products?category=식품', {
        headers: {
          'Authorization': `Bearer ${mockSessionIds.regular}`,
        },
      });

      const data = await response.json();

      expect(response.ok).toBe(true);
      expect(data.products.length).toBe(2);
      expect(data.products.every((p: any) => p.category === '식품')).toBe(true);
    });

    it('상태별 필터링 조회', async () => {
      const mockProducts = [
        createMockProductDB({ status: 'pending' }),
      ];

      const mockResponse = createSuccessResponse({
        products: mockProducts,
        total: 1,
      });

      global.fetch = mockFetch(mockResponse, 200);

      const response = await fetch('/api/coupang-products?status=pending', {
        headers: {
          'Authorization': `Bearer ${mockSessionIds.regular}`,
        },
      });

      const data = await response.json();

      expect(response.ok).toBe(true);
      expect(data.products.every((p: any) => p.status === 'pending')).toBe(true);
    });

    it('인증되지 않은 사용자 접근 실패', async () => {
      const mockResponse = createErrorResponse('로그인이 필요합니다.', 401);
      global.fetch = mockFetch(mockResponse, 401);

      const response = await fetch('/api/coupang-products');
      const data = await response.json();

      expect(response.ok).toBe(false);
      expect(response.status).toBe(401);
    });
  });

  describe('상품 등록 (POST /api/coupang-products)', () => {
    it('상품 URL로 크롤링 큐 추가 성공', async () => {
      const mockResponse = createSuccessResponse({
        queueId: uuidv4(),
        message: '상품이 크롤링 큐에 추가되었습니다.',
      });

      global.fetch = mockFetch(mockResponse, 200);

      const response = await fetch('/api/coupang-products', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${mockSessionIds.regular}`,
        },
        body: JSON.stringify({
          productUrl: 'https://www.coupang.com/vp/products/123456',
          customCategory: '전자기기',
          destination: 'my_list',
        }),
      });

      const data = await response.json();

      expect(response.ok).toBe(true);
      expect(data.success).toBe(true);
      expect(data.queueId).toBeDefined();
    });

    it('상품 URL 없이 등록 시도 실패', async () => {
      const mockResponse = createErrorResponse('상품 URL을 입력해주세요.', 400);
      global.fetch = mockFetch(mockResponse, 400);

      const response = await fetch('/api/coupang-products', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${mockSessionIds.regular}`,
        },
        body: JSON.stringify({}),
      });

      const data = await response.json();

      expect(response.ok).toBe(false);
      expect(data.error).toContain('URL');
    });

    it('대기열 목적지 지정 가능 (queue)', async () => {
      const mockResponse = createSuccessResponse({
        queueId: uuidv4(),
        message: '상품이 크롤링 큐에 추가되었습니다.',
      });

      global.fetch = mockFetch(mockResponse, 200);

      const response = await fetch('/api/coupang-products', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${mockSessionIds.regular}`,
        },
        body: JSON.stringify({
          productUrl: 'https://www.coupang.com/vp/products/789',
          destination: 'queue',  // 대기열로 이동
        }),
      });

      const data = await response.json();

      expect(response.ok).toBe(true);
      expect(data.success).toBe(true);
    });
  });

  describe('즐겨찾기 토글 (PATCH /api/coupang-products)', () => {
    it('즐겨찾기 추가 성공', async () => {
      const mockResponse = createSuccessResponse({
        message: '상품이 업데이트되었습니다.',
      });

      global.fetch = mockFetch(mockResponse, 200);

      const response = await fetch('/api/coupang-products', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${mockSessionIds.regular}`,
        },
        body: JSON.stringify({
          productId: 'cp_test123',
          isFavorite: true,
        }),
      });

      const data = await response.json();

      expect(response.ok).toBe(true);
      expect(data.success).toBe(true);
    });

    it('즐겨찾기 제거 성공', async () => {
      const mockResponse = createSuccessResponse({
        message: '상품이 업데이트되었습니다.',
      });

      global.fetch = mockFetch(mockResponse, 200);

      const response = await fetch('/api/coupang-products', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${mockSessionIds.regular}`,
        },
        body: JSON.stringify({
          productId: 'cp_test123',
          isFavorite: false,
        }),
      });

      const data = await response.json();

      expect(response.ok).toBe(true);
      expect(data.success).toBe(true);
    });

    it('존재하지 않는 상품 업데이트 실패', async () => {
      const mockResponse = createErrorResponse('상품을 찾을 수 없습니다.', 404);
      global.fetch = mockFetch(mockResponse, 404);

      const response = await fetch('/api/coupang-products', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${mockSessionIds.regular}`,
        },
        body: JSON.stringify({
          productId: 'nonexistent',
          isFavorite: true,
        }),
      });

      const data = await response.json();

      expect(response.ok).toBe(false);
      expect(response.status).toBe(404);
    });
  });

  describe('상품 삭제 (DELETE /api/coupang-products)', () => {
    it('상품 삭제 성공', async () => {
      const mockResponse = createSuccessResponse({
        message: '상품이 삭제되었습니다.',
      });

      global.fetch = mockFetch(mockResponse, 200);

      const response = await fetch('/api/coupang-products?id=cp_test123', {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${mockSessionIds.regular}`,
        },
      });

      const data = await response.json();

      expect(response.ok).toBe(true);
      expect(data.success).toBe(true);
    });

    it('상품 ID 없이 삭제 시도 실패', async () => {
      const mockResponse = createErrorResponse('상품 ID가 필요합니다.', 400);
      global.fetch = mockFetch(mockResponse, 400);

      const response = await fetch('/api/coupang-products', {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${mockSessionIds.regular}`,
        },
      });

      const data = await response.json();

      expect(response.ok).toBe(false);
      expect(data.error).toContain('ID');
    });

    it('다른 사용자의 상품 삭제 시도 실패', async () => {
      const mockResponse = createErrorResponse('상품을 찾을 수 없습니다.', 404);
      global.fetch = mockFetch(mockResponse, 404);

      const response = await fetch('/api/coupang-products?id=other_user_product', {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${mockSessionIds.regular}`,
        },
      });

      expect(response.ok).toBe(false);
      expect(response.status).toBe(404);
    });
  });

  describe('상품 정보 수정 (PATCH /api/coupang-products/[id])', () => {
    it('상품 제목/설명 수정 성공', async () => {
      const mockResponse = createSuccessResponse({
        message: '상품이 수정되었습니다.',
      });

      global.fetch = mockFetch(mockResponse, 200);

      const response = await fetch('/api/coupang-products/cp_test123', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${mockSessionIds.regular}`,
        },
        body: JSON.stringify({
          title: '수정된 상품명',
          description: '수정된 설명',
        }),
      });

      const data = await response.json();

      expect(response.ok).toBe(true);
      expect(data.success).toBe(true);
    });

    it('상품 URL 변경 시 딥링크 자동 재생성', async () => {
      const mockResponse = createSuccessResponse({
        message: '상품이 수정되었습니다.',
      });

      global.fetch = mockFetch(mockResponse, 200);

      const response = await fetch('/api/coupang-products/cp_test123', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${mockSessionIds.regular}`,
        },
        body: JSON.stringify({
          product_url: 'https://www.coupang.com/vp/products/newproduct789',
        }),
      });

      const data = await response.json();

      expect(response.ok).toBe(true);
      expect(data.success).toBe(true);
    });

    it('쿠팡 API 키 미설정 시 딥링크 생성 실패', async () => {
      const mockResponse = createErrorResponse(
        '딥링크 생성에 실패했습니다. 쿠팡 API 키를 확인해주세요.',
        400
      );
      global.fetch = mockFetch(mockResponse, 400);

      const response = await fetch('/api/coupang-products/cp_test123', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${mockSessionIds.regular}`,
        },
        body: JSON.stringify({
          product_url: 'https://www.coupang.com/vp/products/newproduct789',
        }),
      });

      const data = await response.json();

      expect(response.ok).toBe(false);
      expect(data.error).toContain('딥링크');
    });

    it('수정할 내용 없이 요청 실패', async () => {
      const mockResponse = createErrorResponse('수정할 내용이 없습니다', 400);
      global.fetch = mockFetch(mockResponse, 400);

      const response = await fetch('/api/coupang-products/cp_test123', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${mockSessionIds.regular}`,
        },
        body: JSON.stringify({}),
      });

      const data = await response.json();

      expect(response.ok).toBe(false);
    });

    it('권한 없는 상품 수정 시도 실패', async () => {
      const mockResponse = createErrorResponse('권한이 없습니다', 403);
      global.fetch = mockFetch(mockResponse, 403);

      const response = await fetch('/api/coupang-products/other_user_product', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${mockSessionIds.regular}`,
        },
        body: JSON.stringify({
          title: '해킹 시도',
        }),
      });

      expect(response.ok).toBe(false);
      expect(response.status).toBe(403);
    });
  });

  describe('상품 삭제 (DELETE /api/coupang-products/[id])', () => {
    it('개별 상품 삭제 성공', async () => {
      const mockResponse = createSuccessResponse({
        message: '상품이 삭제되었습니다.',
      });

      global.fetch = mockFetch(mockResponse, 200);

      const response = await fetch('/api/coupang-products/cp_test123', {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${mockSessionIds.regular}`,
        },
      });

      const data = await response.json();

      expect(response.ok).toBe(true);
      expect(data.success).toBe(true);
    });
  });

  describe('클릭 추적 (POST /api/coupang-products/[id]/click)', () => {
    it('상품 클릭 기록 성공', async () => {
      const mockResponse = createSuccessResponse({
        message: '클릭이 기록되었습니다.',
        clickCount: 1,
      });

      global.fetch = mockFetch(mockResponse, 200);

      const response = await fetch('/api/coupang-products/cp_test123/click', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${mockSessionIds.regular}`,
        },
      });

      const data = await response.json();

      expect(response.ok).toBe(true);
      expect(data.success).toBe(true);
    });

    it('클릭 수 증가 확인', async () => {
      const mockResponse = createSuccessResponse({
        message: '클릭이 기록되었습니다.',
        clickCount: 5,  // 5번째 클릭
      });

      global.fetch = mockFetch(mockResponse, 200);

      const response = await fetch('/api/coupang-products/cp_test123/click', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${mockSessionIds.regular}`,
        },
      });

      const data = await response.json();

      expect(response.ok).toBe(true);
      expect(data.clickCount).toBe(5);
    });
  });

  describe('재크롤링 (POST /api/coupang-products/[id]/recrawl)', () => {
    it('상품 재크롤링 요청 성공', async () => {
      const mockResponse = createSuccessResponse({
        message: '재크롤링이 시작되었습니다.',
        queueId: uuidv4(),
      });

      global.fetch = mockFetch(mockResponse, 200);

      const response = await fetch('/api/coupang-products/cp_test123/recrawl', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${mockSessionIds.regular}`,
        },
      });

      const data = await response.json();

      expect(response.ok).toBe(true);
      expect(data.success).toBe(true);
      expect(data.queueId).toBeDefined();
    });

    it('이미 크롤링 중인 상품 재크롤링 방지', async () => {
      const mockResponse = createErrorResponse(
        '이미 크롤링 진행 중입니다.',
        409
      );
      global.fetch = mockFetch(mockResponse, 409);

      const response = await fetch('/api/coupang-products/cp_crawling/recrawl', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${mockSessionIds.regular}`,
        },
      });

      expect(response.ok).toBe(false);
      expect(response.status).toBe(409);
    });
  });

  describe('큐 상태 연동', () => {
    it('상품 조회 시 큐 상태 포함', async () => {
      const mockProducts = [
        {
          ...createMockProductDB(),
          queue_status: 'processing',
          queue_retry_count: 1,
          queue_error: null,
        },
      ];

      const mockResponse = createSuccessResponse({
        products: mockProducts,
        total: 1,
      });

      global.fetch = mockFetch(mockResponse, 200);

      const response = await fetch('/api/coupang-products', {
        headers: {
          'Authorization': `Bearer ${mockSessionIds.regular}`,
        },
      });

      const data = await response.json();

      expect(response.ok).toBe(true);
      expect(data.products[0].queue_status).toBe('processing');
    });

    it('크롤링 실패한 상품 에러 메시지 포함', async () => {
      const mockProducts = [
        {
          ...createMockProductDB({ status: 'error' }),
          queue_status: 'failed',
          queue_retry_count: 3,
          queue_error: '상품 페이지를 찾을 수 없습니다.',
        },
      ];

      const mockResponse = createSuccessResponse({
        products: mockProducts,
        total: 1,
      });

      global.fetch = mockFetch(mockResponse, 200);

      const response = await fetch('/api/coupang-products', {
        headers: {
          'Authorization': `Bearer ${mockSessionIds.regular}`,
        },
      });

      const data = await response.json();

      expect(response.ok).toBe(true);
      expect(data.products[0].queue_error).toBeDefined();
    });
  });

  describe('권한 및 인증', () => {
    it('인증 없이 모든 API 접근 실패', async () => {
      const endpoints = [
        { url: '/api/coupang-products', method: 'GET' },
        { url: '/api/coupang-products', method: 'POST' },
        { url: '/api/coupang-products', method: 'PATCH' },
        { url: '/api/coupang-products', method: 'DELETE' },
        { url: '/api/coupang-products/test/click', method: 'POST' },
        { url: '/api/coupang-products/test/recrawl', method: 'POST' },
      ];

      for (const endpoint of endpoints) {
        const mockResponse = createErrorResponse('로그인이 필요합니다.', 401);
        global.fetch = mockFetch(mockResponse, 401);

        const response = await fetch(endpoint.url, {
          method: endpoint.method,
          headers: {
            'Content-Type': 'application/json',
          },
        });

        expect(response.status).toBe(401);
      }
    });

    it('다른 사용자의 상품에 대한 작업 차단', async () => {
      const otherUserProduct = createMockProductDB({
        id: 'cp_other_user',
        user_id: 'other-user-id',
      });

      const operations = [
        {
          url: '/api/coupang-products',
          method: 'PATCH',
          body: { productId: otherUserProduct.id, isFavorite: true },
          expectedStatus: 404,
        },
        {
          url: `/api/coupang-products/${otherUserProduct.id}`,
          method: 'PATCH',
          body: { title: '해킹' },
          expectedStatus: 403,
        },
        {
          url: `/api/coupang-products/${otherUserProduct.id}`,
          method: 'DELETE',
          expectedStatus: 403,
        },
      ];

      for (const op of operations) {
        const mockResponse = createErrorResponse(
          op.expectedStatus === 404 ? '상품을 찾을 수 없습니다.' : '권한이 없습니다',
          op.expectedStatus
        );
        global.fetch = mockFetch(mockResponse, op.expectedStatus);

        const response = await fetch(op.url, {
          method: op.method,
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${mockSessionIds.regular}`,
          },
          body: op.body ? JSON.stringify(op.body) : undefined,
        });

        expect(response.status).toBe(op.expectedStatus);
      }
    });
  });

  describe('에러 처리', () => {
    it('서버 에러 발생 시 500 응답', async () => {
      const mockResponse = createErrorResponse('서버 오류가 발생했습니다.', 500);
      global.fetch = mockFetch(mockResponse, 500);

      const response = await fetch('/api/coupang-products', {
        headers: {
          'Authorization': `Bearer ${mockSessionIds.regular}`,
        },
      });

      expect(response.ok).toBe(false);
      expect(response.status).toBe(500);
    });

    it('잘못된 JSON 요청 처리', async () => {
      const mockResponse = createErrorResponse('잘못된 요청입니다.', 400);
      global.fetch = mockFetch(mockResponse, 400);

      const response = await fetch('/api/coupang-products', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${mockSessionIds.regular}`,
        },
        body: 'invalid json',
      });

      expect(response.ok).toBe(false);
    });
  });
});
