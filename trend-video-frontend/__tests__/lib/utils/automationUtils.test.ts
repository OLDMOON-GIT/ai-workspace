/**
 * automationUtils.ts 유닛 테스트
 */

import {
  getDefaultModelByType,
  getCurrentTimeForInput,
  getDefaultScheduleTime,
  validateTitle,
  formatDate,
  localToUtcIso,
  utcIsoToLocal,
} from '@/lib/utils/automationUtils';

describe('automationUtils', () => {
  beforeEach(() => {
    // localStorage mock
    Object.defineProperty(window, 'localStorage', {
      value: {
        getItem: jest.fn(),
        setItem: jest.fn(),
        removeItem: jest.fn(),
        clear: jest.fn(),
      },
      writable: true,
    });
  });

  describe('getDefaultModelByType', () => {
    it('product 타입은 gemini 반환', () => {
      expect(getDefaultModelByType('product')).toBe('gemini');
    });

    it('product-info 타입은 gemini 반환', () => {
      expect(getDefaultModelByType('product-info')).toBe('gemini');
    });

    it('longform 타입은 claude 반환', () => {
      expect(getDefaultModelByType('longform')).toBe('claude');
    });

    it('sora2 타입은 claude 반환', () => {
      expect(getDefaultModelByType('sora2')).toBe('claude');
    });

    it('shortform 타입은 claude 반환', () => {
      expect(getDefaultModelByType('shortform')).toBe('claude');
    });

    it('알 수 없는 타입은 claude 반환', () => {
      expect(getDefaultModelByType('unknown')).toBe('claude');
    });

    it('undefined는 claude 반환', () => {
      expect(getDefaultModelByType(undefined)).toBe('claude');
    });
  });

  describe('getCurrentTimeForInput', () => {
    it('datetime-local 형식으로 반환해야 함', () => {
      const result = getCurrentTimeForInput();
      // 형식: YYYY-MM-DDTHH:mm
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    });

    it('현재 시간과 가까워야 함', () => {
      const result = getCurrentTimeForInput();
      const now = new Date();
      const resultDate = new Date(result);

      // 1분 이내 차이
      const diffMs = Math.abs(now.getTime() - resultDate.getTime());
      expect(diffMs).toBeLessThan(60000);
    });
  });

  describe('getDefaultScheduleTime', () => {
    it('datetime-local 형식으로 반환해야 함', () => {
      const result = getDefaultScheduleTime();
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    });

    it('현재 시간 + 3분이어야 함', () => {
      const result = getDefaultScheduleTime();
      const now = new Date();
      now.setMinutes(now.getMinutes() + 3);

      const resultDate = new Date(result);

      // 1분 이내 차이
      const diffMs = Math.abs(now.getTime() - resultDate.getTime());
      expect(diffMs).toBeLessThan(60000);
    });
  });

  describe('validateTitle', () => {
    it('유효한 제목은 빈 문자열 반환', () => {
      expect(validateTitle('정상적인 제목')).toBe('');
      expect(validateTitle('Test Title 123')).toBe('');
      expect(validateTitle('질문?')).toBe(''); // ? 허용
    });

    it('< 문자 포함 시 에러 메시지 반환', () => {
      expect(validateTitle('test<title')).toContain('사용할 수 없는 문자');
    });

    it('> 문자 포함 시 에러 메시지 반환', () => {
      expect(validateTitle('test>title')).toContain('사용할 수 없는 문자');
    });

    it(': 문자 포함 시 에러 메시지 반환', () => {
      expect(validateTitle('test:title')).toContain('사용할 수 없는 문자');
    });

    it('" 문자 포함 시 에러 메시지 반환', () => {
      expect(validateTitle('test"title')).toContain('사용할 수 없는 문자');
    });

    it('/ 문자 포함 시 에러 메시지 반환', () => {
      expect(validateTitle('test/title')).toContain('사용할 수 없는 문자');
    });

    it('\\ 문자 포함 시 에러 메시지 반환', () => {
      expect(validateTitle('test\\title')).toContain('사용할 수 없는 문자');
    });

    it('| 문자 포함 시 에러 메시지 반환', () => {
      expect(validateTitle('test|title')).toContain('사용할 수 없는 문자');
    });

    it('* 문자 포함 시 에러 메시지 반환', () => {
      expect(validateTitle('test*title')).toContain('사용할 수 없는 문자');
    });
  });

  describe('formatDate', () => {
    it('날짜를 한국어 형식으로 변환해야 함', () => {
      const result = formatDate('2024-01-15T10:30:00Z');
      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
    });

    it('유효한 날짜 문자열을 처리해야 함', () => {
      const result = formatDate('2024-12-25T00:00:00');
      expect(result).toBeDefined();
    });
  });

  describe('localToUtcIso', () => {
    it('로컬 시간을 ISO 형식으로 변환해야 함', () => {
      const result = localToUtcIso('2024-01-15T10:30');
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/);
    });

    it('Z로 끝나야 함 (UTC)', () => {
      const result = localToUtcIso('2024-06-15T15:00');
      expect(result).toMatch(/Z$/);
    });
  });

  describe('utcIsoToLocal', () => {
    it('UTC ISO를 datetime-local 형식으로 변환해야 함', () => {
      const result = utcIsoToLocal('2024-01-15T10:30:00.000Z');
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    });

    it('왕복 변환이 일관되어야 함', () => {
      const original = '2024-06-15T12:00';
      const utc = localToUtcIso(original);
      const backToLocal = utcIsoToLocal(utc);

      // 원래 값과 동일해야 함
      expect(backToLocal).toBe(original);
    });
  });

  describe('localStorage 함수들', () => {
    test('getDefaultTtsByType - longform은 순복 음성 반환', () => {
      const { getDefaultTtsByType } = require('@/lib/utils/automationUtils');
      expect(getDefaultTtsByType('longform')).toBe('ko-KR-SoonBokNeural');
    });

    test('getDefaultTtsByType - shortform은 선희 음성 반환', () => {
      const { getDefaultTtsByType } = require('@/lib/utils/automationUtils');
      expect(getDefaultTtsByType('shortform')).toBe('ko-KR-SunHiNeural');
    });

    test('getDefaultMediaModeByType - longform은 crawl 반환', () => {
      const { getDefaultMediaModeByType } = require('@/lib/utils/automationUtils');
      expect(getDefaultMediaModeByType('longform')).toBe('crawl');
    });

    test('getDefaultMediaModeByType - shortform은 imagen3 반환', () => {
      const { getDefaultMediaModeByType } = require('@/lib/utils/automationUtils');
      expect(getDefaultMediaModeByType('shortform')).toBe('imagen3');
    });
  });
});
