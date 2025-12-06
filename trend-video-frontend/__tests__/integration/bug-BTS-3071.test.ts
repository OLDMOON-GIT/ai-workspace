/**
 * BTS-3071: fetch failed 에러 처리 테스트
 * 
 * 네트워크 에러 발생 시 자동 재시도 로직 테스트
 */

import { fetchJson, fetchWithRetry } from '@/lib/fetch-utils';

describe('BTS-3071: fetch failed 에러 재시도 로직', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('fetchJson retry', () => {
    it('fetch failed 에러 발생 시 재시도해야 함', async () => {
      const mockData = { success: true };
      
      // 첫 번째: 실패, 두 번째: 성공
      (global.fetch as jest.Mock)
        .mockRejectedValueOnce(new Error('fetch failed'))
        .mockResolvedValueOnce(
          new Response(JSON.stringify(mockData), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          })
        );

      // 짧은 retryDelay로 실제 테스트
      const result = await fetchJson('/api/test', { maxRetries: 3, retryDelay: 10 });

      expect(global.fetch).toHaveBeenCalledTimes(2);
      expect(result).toEqual(mockData);
    });

    it('ECONNREFUSED 에러 발생 시 재시도해야 함', async () => {
      const mockData = { success: true };
      
      (global.fetch as jest.Mock)
        .mockRejectedValueOnce(new Error('ECONNREFUSED'))
        .mockResolvedValueOnce(
          new Response(JSON.stringify(mockData), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          })
        );

      const result = await fetchJson('/api/test', { maxRetries: 3, retryDelay: 10 });

      expect(global.fetch).toHaveBeenCalledTimes(2);
      expect(result).toEqual(mockData);
    });

    it('ETIMEDOUT 에러 발생 시 재시도해야 함', async () => {
      const mockData = { success: true };
      
      (global.fetch as jest.Mock)
        .mockRejectedValueOnce(new Error('ETIMEDOUT'))
        .mockResolvedValueOnce(
          new Response(JSON.stringify(mockData), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          })
        );

      const result = await fetchJson('/api/test', { maxRetries: 3, retryDelay: 10 });

      expect(global.fetch).toHaveBeenCalledTimes(2);
      expect(result).toEqual(mockData);
    });

    it('최대 재시도 횟수를 초과하면 에러를 던져야 함', async () => {
      (global.fetch as jest.Mock)
        .mockRejectedValue(new Error('fetch failed'));

      await expect(fetchJson('/api/test', { maxRetries: 3, retryDelay: 10 }))
        .rejects.toThrow('fetch failed');
      
      expect(global.fetch).toHaveBeenCalledTimes(3);
    });

    it('재시도 불가능한 에러는 즉시 던져야 함', async () => {
      (global.fetch as jest.Mock)
        .mockRejectedValue(new Error('Invalid URL'));

      await expect(fetchJson('/api/test', { maxRetries: 3, retryDelay: 10 }))
        .rejects.toThrow('Invalid URL');
      
      // 재시도 없이 한 번만 호출
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('fetchWithRetry', () => {
    it('fetch failed 에러 발생 시 재시도해야 함', async () => {
      const mockResponse = new Response('OK', { status: 200 });
      
      (global.fetch as jest.Mock)
        .mockRejectedValueOnce(new Error('fetch failed'))
        .mockResolvedValueOnce(mockResponse);

      const result = await fetchWithRetry('/api/test', { maxRetries: 3, retryDelay: 10 });

      expect(global.fetch).toHaveBeenCalledTimes(2);
      expect(result.status).toBe(200);
    });

    it('socket hang up 에러 발생 시 재시도해야 함', async () => {
      const mockResponse = new Response('OK', { status: 200 });
      
      (global.fetch as jest.Mock)
        .mockRejectedValueOnce(new Error('socket hang up'))
        .mockResolvedValueOnce(mockResponse);

      const result = await fetchWithRetry('/api/test', { maxRetries: 3, retryDelay: 10 });

      expect(global.fetch).toHaveBeenCalledTimes(2);
      expect(result.status).toBe(200);
    });
  });

  describe('기타 네트워크 에러', () => {
    it('ECONNRESET 에러 발생 시 재시도해야 함', async () => {
      const mockData = { success: true };
      
      (global.fetch as jest.Mock)
        .mockRejectedValueOnce(new Error('ECONNRESET'))
        .mockResolvedValueOnce(
          new Response(JSON.stringify(mockData), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          })
        );

      const result = await fetchJson('/api/test', { maxRetries: 3, retryDelay: 10 });

      expect(global.fetch).toHaveBeenCalledTimes(2);
      expect(result).toEqual(mockData);
    });

    it('network error 발생 시 재시도해야 함', async () => {
      const mockData = { success: true };
      
      (global.fetch as jest.Mock)
        .mockRejectedValueOnce(new Error('network error'))
        .mockResolvedValueOnce(
          new Response(JSON.stringify(mockData), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          })
        );

      const result = await fetchJson('/api/test', { maxRetries: 3, retryDelay: 10 });

      expect(global.fetch).toHaveBeenCalledTimes(2);
      expect(result).toEqual(mockData);
    });
  });
});
