/**
 * video constants 테스트
 */

import {
  FILTER_STORAGE_KEY,
  MAX_LOG_LINES,
  fallbackVideos,
  typeOptions,
  dateOptions,
  sortOptions,
  CATEGORY_OPTIONS,
  categoryLabelMap,
  modelOptions,
  defaultViewRange,
  defaultSubRange,
  defaultDurationRange,
  numberFormatter,
} from '@/lib/constants/video';

describe('video constants', () => {
  describe('FILTER_STORAGE_KEY', () => {
    it('문자열이어야 함', () => {
      expect(typeof FILTER_STORAGE_KEY).toBe('string');
      expect(FILTER_STORAGE_KEY.length).toBeGreaterThan(0);
    });
  });

  describe('MAX_LOG_LINES', () => {
    it('양수여야 함', () => {
      expect(MAX_LOG_LINES).toBeGreaterThan(0);
      expect(typeof MAX_LOG_LINES).toBe('number');
    });
  });

  describe('fallbackVideos', () => {
    it('배열이어야 함', () => {
      expect(Array.isArray(fallbackVideos)).toBe(true);
    });
  });

  describe('typeOptions', () => {
    it('배열이어야 함', () => {
      expect(Array.isArray(typeOptions)).toBe(true);
      expect(typeOptions.length).toBeGreaterThan(0);
    });

    it('전체 옵션이 있어야 함', () => {
      const allOption = typeOptions.find(o => o.value === 'all');
      expect(allOption).toBeDefined();
      expect(allOption?.label).toBe('전체');
    });

    it('각 옵션은 label과 value를 가져야 함', () => {
      typeOptions.forEach(option => {
        expect(option.label).toBeDefined();
        expect(option.value).toBeDefined();
      });
    });
  });

  describe('dateOptions', () => {
    it('배열이어야 함', () => {
      expect(Array.isArray(dateOptions)).toBe(true);
    });

    it('any(전체) 옵션이 있어야 함', () => {
      const anyOption = dateOptions.find(o => o.value === 'any');
      expect(anyOption).toBeDefined();
    });

    it('week(이번 주) 옵션이 있어야 함', () => {
      const weekOption = dateOptions.find(o => o.value === 'week');
      expect(weekOption).toBeDefined();
    });
  });

  describe('sortOptions', () => {
    it('배열이어야 함', () => {
      expect(Array.isArray(sortOptions)).toBe(true);
    });

    it('views 옵션이 있어야 함', () => {
      const viewsOption = sortOptions.find(o => o.value === 'views');
      expect(viewsOption).toBeDefined();
    });

    it('vph 옵션이 있어야 함', () => {
      const vphOption = sortOptions.find(o => o.value === 'vph');
      expect(vphOption).toBeDefined();
    });
  });

  describe('CATEGORY_OPTIONS', () => {
    it('배열이어야 함', () => {
      expect(Array.isArray(CATEGORY_OPTIONS)).toBe(true);
      expect(CATEGORY_OPTIONS.length).toBeGreaterThan(0);
    });

    it('각 옵션은 id와 label을 가져야 함', () => {
      CATEGORY_OPTIONS.forEach(option => {
        expect(option.id).toBeDefined();
        expect(option.label).toBeDefined();
      });
    });

    it('게임 카테고리가 있어야 함', () => {
      const gaming = CATEGORY_OPTIONS.find(o => o.id === '20');
      expect(gaming).toBeDefined();
      expect(gaming?.label).toBe('게임');
    });
  });

  describe('categoryLabelMap', () => {
    it('객체여야 함', () => {
      expect(typeof categoryLabelMap).toBe('object');
    });

    it('CATEGORY_OPTIONS의 모든 id를 포함해야 함', () => {
      CATEGORY_OPTIONS.forEach(option => {
        expect(categoryLabelMap[option.id]).toBe(option.label);
      });
    });
  });

  describe('modelOptions', () => {
    it('배열이어야 함', () => {
      expect(Array.isArray(modelOptions)).toBe(true);
    });

    it('chatgpt 옵션이 있어야 함', () => {
      const chatgpt = modelOptions.find(o => o.value === 'chatgpt');
      expect(chatgpt).toBeDefined();
      expect(chatgpt?.label).toBe('ChatGPT');
    });

    it('claude 옵션이 있어야 함', () => {
      const claude = modelOptions.find(o => o.value === 'claude');
      expect(claude).toBeDefined();
    });
  });

  describe('default ranges', () => {
    it('defaultViewRange가 min/max를 가져야 함', () => {
      expect(defaultViewRange.min).toBeDefined();
      expect(defaultViewRange.max).toBeDefined();
      expect(defaultViewRange.min).toBeLessThan(defaultViewRange.max);
    });

    it('defaultSubRange가 min/max를 가져야 함', () => {
      expect(defaultSubRange.min).toBeDefined();
      expect(defaultSubRange.max).toBeDefined();
    });

    it('defaultDurationRange가 min/max를 가져야 함', () => {
      expect(defaultDurationRange.min).toBeDefined();
      expect(defaultDurationRange.max).toBeDefined();
    });
  });

  describe('numberFormatter', () => {
    it('숫자를 포맷팅해야 함', () => {
      const result = numberFormatter.format(1000);
      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
    });

    it('큰 숫자를 천 단위로 구분해야 함', () => {
      const result = numberFormatter.format(1000000);
      expect(result).toContain(',');
    });
  });
});
