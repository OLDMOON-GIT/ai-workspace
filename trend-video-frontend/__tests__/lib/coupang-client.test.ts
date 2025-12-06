/**
 * coupang-client.ts 유닛 테스트
 */

import {
  CoupangClient,
  createCoupangClient,
  COUPANG_CATEGORIES,
} from '@/lib/coupang-client';

// fetch mock
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('CoupangClient', () => {
  const mockConfig = {
    accessKey: 'test-access-key',
    secretKey: 'test-secret-key',
  };

  let client: CoupangClient;

  beforeEach(() => {
    mockFetch.mockReset();
    client = new CoupangClient(mockConfig);
  });

  describe('constructor', () => {
    it('설정으로 초기화되어야 함', () => {
      const clientWithTrackingId = new CoupangClient({
        ...mockConfig,
        trackingId: 'test-tracking-id',
      });
      expect(clientWithTrackingId).toBeDefined();
    });
  });

  describe('searchProducts', () => {
    it('검색 결과를 반환해야 함', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          rCode: '0',
          rMessage: 'SUCCESS',
          data: {
            productData: [
              {
                productId: '123456',
                productName: '테스트 상품',
                productPrice: 10000,
                productImage: 'https://example.com/image.jpg',
                productUrl: 'https://coupang.com/product',
                categoryName: '가전',
                isRocket: true,
              },
            ],
          },
        }),
      });

      const results = await client.searchProducts('테스트', 20);

      expect(results).toHaveLength(1);
      expect(results[0].productId).toBe('123456');
      expect(results[0].productName).toBe('테스트 상품');
      expect(results[0].isRocket).toBe(true);
    });

    it('검색 실패 시 빈 배열 반환', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          rCode: '1',
          rMessage: 'FAIL',
        }),
      });

      const results = await client.searchProducts('테스트');

      expect(results).toEqual([]);
    });

    it('기본 limit이 20이어야 함', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ rCode: '0', data: { productData: [] } }),
      });

      await client.searchProducts('테스트');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('limit=20'),
        expect.any(Object)
      );
    });

    it('카테고리가 없으면 기타로 설정', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          rCode: '0',
          data: {
            productData: [
              {
                productId: '123',
                productName: '상품',
                productPrice: 1000,
                productImage: 'img.jpg',
                productUrl: 'url',
              },
            ],
          },
        }),
      });

      const results = await client.searchProducts('테스트');

      expect(results[0].categoryName).toBe('기타');
      expect(results[0].isRocket).toBe(false);
    });
  });

  describe('generateDeepLink', () => {
    it('딥링크를 생성해야 함', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          rCode: '0',
          data: [{ shortenUrl: 'https://link.coupang.com/short' }],
        }),
      });

      const deepLink = await client.generateDeepLink('https://coupang.com/product');

      expect(deepLink).toBe('https://link.coupang.com/short');
    });

    it('딥링크 생성 실패 시 에러 throw', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          rCode: '1',
          rMessage: 'FAIL',
        }),
      });

      await expect(client.generateDeepLink('https://coupang.com/product'))
        .rejects.toThrow('딥링크 생성 실패');
    });

    it('빈 data 배열인 경우 에러 throw', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          rCode: '0',
          data: [],
        }),
      });

      await expect(client.generateDeepLink('https://coupang.com/product'))
        .rejects.toThrow('딥링크 생성 실패');
    });
  });

  describe('getBestProducts', () => {
    it('베스트 상품을 반환해야 함', async () => {
      const mockProducts = [{ id: 1 }, { id: 2 }];
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          rCode: '0',
          data: mockProducts,
        }),
      });

      const results = await client.getBestProducts(1001, 10);

      expect(results).toEqual(mockProducts);
    });

    it('기본 카테고리가 1001이어야 함', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ rCode: '0', data: [] }),
      });

      await client.getBestProducts();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/1001'),
        expect.any(Object)
      );
    });

    it('실패 시 빈 배열 반환', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          rCode: '1',
        }),
      });

      const results = await client.getBestProducts();

      expect(results).toEqual([]);
    });
  });

  describe('testConnection', () => {
    it('연결 성공 시 true 반환', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ rCode: '0', data: [] }),
      });

      const result = await client.testConnection();

      expect(result).toBe(true);
    });

    it('연결 실패 시 false 반환', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      const result = await client.testConnection();

      expect(result).toBe(false);
    });
  });

  describe('generateMultipleDeepLinks', () => {
    it('여러 딥링크를 생성해야 함', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          rCode: '0',
          data: [
            { shortenUrl: 'https://link1.coupang.com' },
            { shortenUrl: 'https://link2.coupang.com' },
          ],
        }),
      });

      const urls = ['https://coupang.com/1', 'https://coupang.com/2'];
      const results = await client.generateMultipleDeepLinks(urls);

      expect(results).toHaveLength(2);
      expect(results[0]).toBe('https://link1.coupang.com');
    });

    it('20개 이상은 잘라야 함', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          rCode: '0',
          data: Array(20).fill({ shortenUrl: 'https://link.coupang.com' }),
        }),
      });

      const urls = Array(25).fill('https://coupang.com/product');
      await client.generateMultipleDeepLinks(urls);

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.coupangUrls).toHaveLength(20);
    });

    it('실패 시 에러 throw', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ rCode: '1' }),
      });

      await expect(client.generateMultipleDeepLinks(['url']))
        .rejects.toThrow('딥링크 생성 실패');
    });
  });

  describe('API 에러 처리', () => {
    it('HTTP 에러 시 에러 throw', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ message: 'Server Error' }),
      });

      await expect(client.searchProducts('테스트'))
        .rejects.toThrow('Server Error');
    });

    it('JSON 파싱 실패 시 기본 에러 메시지', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => { throw new Error('Parse error'); },
      });

      await expect(client.searchProducts('테스트'))
        .rejects.toThrow('API 요청 실패');
    });
  });
});

describe('createCoupangClient', () => {
  it('CoupangClient 인스턴스를 생성해야 함', () => {
    const client = createCoupangClient({
      accessKey: 'key',
      secretKey: 'secret',
    });

    expect(client).toBeInstanceOf(CoupangClient);
  });
});

describe('COUPANG_CATEGORIES', () => {
  it('카테고리 상수가 정의되어야 함', () => {
    expect(COUPANG_CATEGORIES.FASHION_WOMEN).toBe(1001);
    expect(COUPANG_CATEGORIES.DIGITAL).toBe(1020);
    expect(COUPANG_CATEGORIES.FOOD).toBe(1029);
  });

  it('모든 카테고리가 숫자여야 함', () => {
    Object.values(COUPANG_CATEGORIES).forEach(value => {
      expect(typeof value).toBe('number');
    });
  });
});
