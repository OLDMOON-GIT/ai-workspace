/**
 * @jest-environment node
 * coupang-deeplink.ts 유닛 테스트
 */

import {
  loadUserSettings,
  generateCoupangSignature,
  extractProductId,
  generateDeeplink,
} from '@/lib/coupang-deeplink';
import fs from 'fs/promises';

jest.mock('fs/promises');

describe('coupang-deeplink', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('loadUserSettings', () => {
    it('사용자 설정을 로드해야 함', async () => {
      const mockSettings = {
        'user123': {
          accessKey: 'test-access-key',
          secretKey: 'test-secret-key',
        },
      };

      (fs.readFile as jest.Mock).mockResolvedValueOnce(JSON.stringify(mockSettings));

      const result = await loadUserSettings('user123');

      expect(result).toEqual(mockSettings['user123']);
    });

    it('파일이 없으면 null을 반환해야 함', async () => {
      (fs.readFile as jest.Mock).mockRejectedValueOnce(new Error('File not found'));

      const result = await loadUserSettings('user123');

      expect(result).toBeNull();
    });

    it('존재하지 않는 사용자는 undefined를 반환해야 함', async () => {
      const mockSettings = {
        'user123': {
          accessKey: 'test-access-key',
        },
      };

      (fs.readFile as jest.Mock).mockResolvedValueOnce(JSON.stringify(mockSettings));

      const result = await loadUserSettings('nonexistent');

      expect(result).toBeUndefined();
    });
  });

  describe('generateCoupangSignature', () => {
    it('서명과 datetime을 반환해야 함', () => {
      const result = generateCoupangSignature('POST', '/test/path', 'test-secret-key');

      expect(result).toBeDefined();
      expect(result.datetime).toBeDefined();
      expect(result.signature).toBeDefined();
    });

    it('datetime 형식이 yymmddTHHMMSSZ 여야 함', () => {
      const result = generateCoupangSignature('GET', '/api/test', 'secret');

      // 형식: 241126T123456Z (2자리년 + 2자리월 + 2자리일 + T + 6자리시분초 + Z)
      expect(result.datetime).toMatch(/^\d{6}T\d{6}Z$/);
    });

    it('signature는 64자 hex 문자열이어야 함 (SHA256)', () => {
      const result = generateCoupangSignature('POST', '/api/deeplink', 'my-secret');

      expect(result.signature).toMatch(/^[a-f0-9]{64}$/);
    });

    it('같은 입력은 같은 순간에 같은 서명을 생성해야 함', () => {
      const method = 'POST';
      const path = '/test';
      const secretKey = 'secret123';

      const result1 = generateCoupangSignature(method, path, secretKey);
      const result2 = generateCoupangSignature(method, path, secretKey);

      // datetime이 같으면 signature도 같아야 함
      if (result1.datetime === result2.datetime) {
        expect(result1.signature).toBe(result2.signature);
      }
    });

    it('다른 secret key는 다른 서명을 생성해야 함', () => {
      const method = 'POST';
      const path = '/test';

      const result1 = generateCoupangSignature(method, path, 'secret1');
      const result2 = generateCoupangSignature(method, path, 'secret2');

      // datetime이 같아도 secret이 다르면 signature가 달라야 함
      if (result1.datetime === result2.datetime) {
        expect(result1.signature).not.toBe(result2.signature);
      }
    });
  });

  describe('extractProductId', () => {
    it('/vp/products/{productId} 형식에서 추출해야 함', () => {
      const url = 'https://www.coupang.com/vp/products/123456789';
      const result = extractProductId(url);
      expect(result).toBe('123456789');
    });

    it('productId 파라미터에서 추출해야 함', () => {
      const url = 'https://link.coupang.com/re/AFFSDP?productId=987654321';
      const result = extractProductId(url);
      expect(result).toBe('987654321');
    });

    it('itemId 파라미터에서 추출해야 함', () => {
      const url = 'https://link.coupang.com/re/AFFSDP?itemId=111222333';
      const result = extractProductId(url);
      expect(result).toBe('111222333');
    });

    it('pageKey 파라미터에서 추출해야 함', () => {
      const url = 'https://link.coupang.com/re/AFFSDP?lptag=AF123&pageKey=444555666';
      const result = extractProductId(url);
      expect(result).toBe('444555666');
    });

    it('복합 URL에서 /vp/products/ 경로 우선', () => {
      const url = 'https://www.coupang.com/vp/products/123?pageKey=456&itemId=789';
      const result = extractProductId(url);
      expect(result).toBe('123');
    });

    it('productId가 여러 파라미터보다 우선', () => {
      const url = 'https://link.coupang.com/re/AFFSDP?productId=111&itemId=222&pageKey=333';
      const result = extractProductId(url);
      expect(result).toBe('111');
    });

    it('잘못된 URL은 null 반환', () => {
      const result = extractProductId('not-a-valid-url');
      expect(result).toBeNull();
    });

    it('상품 ID가 없는 URL은 null 반환', () => {
      const url = 'https://www.coupang.com/np/search?q=테스트';
      const result = extractProductId(url);
      expect(result).toBeNull();
    });

    it('실제 어필리에이트 URL에서 추출', () => {
      const url = 'https://link.coupang.com/re/AFFSDP?lptag=AF5835292&pageKey=8391263121&subid=test';
      const result = extractProductId(url);
      expect(result).toBe('8391263121');
    });

    it('딥링크 URL에서 추출', () => {
      const url = 'https://www.coupang.com/vp/products/8391263121?itemId=23456789&vendorItemId=111';
      const result = extractProductId(url);
      expect(result).toBe('8391263121');
    });
  });

  describe('generateDeeplink', () => {
    beforeEach(() => {
      global.fetch = jest.fn();
    });

    afterEach(() => {
      delete (global as any).fetch;
    });

    it('성공적으로 딥링크를 생성해야 함', async () => {
      const mockResponse = {
        rCode: '0',
        rMessage: 'success',
        data: [
          {
            shortenUrl: 'https://link.coupang.com/a/bXYZ123',
          },
        ],
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const url = 'https://www.coupang.com/vp/products/123456';
      const accessKey = 'test-access';
      const secretKey = 'test-secret';

      const deeplink = await generateDeeplink(url, accessKey, secretKey);

      expect(deeplink).toBe('https://link.coupang.com/a/bXYZ123');
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/deeplink'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Authorization': expect.stringContaining('CEA algorithm=HmacSHA256'),
            'Content-Type': 'application/json',
          }),
        })
      );
    });

    it('상품 ID 추출 실패 시 에러를 던져야 함', async () => {
      const url = 'https://www.coupang.com/invalid';
      const accessKey = 'test-access';
      const secretKey = 'test-secret';

      await expect(generateDeeplink(url, accessKey, secretKey)).rejects.toThrow(
        '상품 ID를 추출할 수 없습니다'
      );
    });

    it('API 오류 응답 시 에러를 던져야 함', async () => {
      const mockResponse = {
        rCode: 'ERROR',
        rMessage: 'Invalid request',
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const url = 'https://www.coupang.com/vp/products/123456';
      const accessKey = 'test-access';
      const secretKey = 'test-secret';

      await expect(generateDeeplink(url, accessKey, secretKey)).rejects.toThrow(
        '딥링크 생성 실패'
      );
    });

    it('HTTP 에러 시 에러를 던져야 함', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        text: async () => 'Unauthorized access',
      });

      const url = 'https://www.coupang.com/vp/products/123456';
      const accessKey = 'test-access';
      const secretKey = 'test-secret';

      await expect(generateDeeplink(url, accessKey, secretKey)).rejects.toThrow(
        '딥링크 API 호출 실패'
      );
    });

    it('타임아웃 시 에러를 던져야 함', async () => {
      const abortError = new Error('Timeout');
      abortError.name = 'AbortError';

      (global.fetch as jest.Mock).mockRejectedValueOnce(abortError);

      const url = 'https://www.coupang.com/vp/products/123456';
      const accessKey = 'test-access';
      const secretKey = 'test-secret';

      await expect(generateDeeplink(url, accessKey, secretKey)).rejects.toThrow(
        '딥링크 생성 타임아웃'
      );
    });

    it('rCode 필드가 없으면 에러를 던져야 함', async () => {
      const mockResponse = {
        data: [],
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const url = 'https://www.coupang.com/vp/products/123456';
      const accessKey = 'test-access';
      const secretKey = 'test-secret';

      await expect(generateDeeplink(url, accessKey, secretKey)).rejects.toThrow(
        'rCode 필드가 없습니다'
      );
    });

    it('data 배열이 비어있으면 에러를 던져야 함', async () => {
      const mockResponse = {
        rCode: '0',
        data: [],
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const url = 'https://www.coupang.com/vp/products/123456';
      const accessKey = 'test-access';
      const secretKey = 'test-secret';

      await expect(generateDeeplink(url, accessKey, secretKey)).rejects.toThrow(
        '데이터가 없습니다'
      );
    });

    it('shortenUrl이 없으면 에러를 던져야 함', async () => {
      const mockResponse = {
        rCode: '0',
        data: [{}],
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const url = 'https://www.coupang.com/vp/products/123456';
      const accessKey = 'test-access';
      const secretKey = 'test-secret';

      await expect(generateDeeplink(url, accessKey, secretKey)).rejects.toThrow(
        'shortenUrl 필드가 없습니다'
      );
    });
  });
});
