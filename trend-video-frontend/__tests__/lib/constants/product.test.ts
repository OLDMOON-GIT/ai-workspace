/**
 * product constants 테스트
 */

import {
  HISTORY_INITIAL_LIMIT,
  HISTORY_PAGE_SIZE,
  BESTSELLER_CATEGORIES,
} from '@/lib/constants/product';

describe('product constants', () => {
  describe('HISTORY_INITIAL_LIMIT', () => {
    it('양수여야 함', () => {
      expect(HISTORY_INITIAL_LIMIT).toBeGreaterThan(0);
      expect(typeof HISTORY_INITIAL_LIMIT).toBe('number');
    });

    it('5이어야 함', () => {
      expect(HISTORY_INITIAL_LIMIT).toBe(5);
    });
  });

  describe('HISTORY_PAGE_SIZE', () => {
    it('양수여야 함', () => {
      expect(HISTORY_PAGE_SIZE).toBeGreaterThan(0);
      expect(typeof HISTORY_PAGE_SIZE).toBe('number');
    });

    it('10이어야 함', () => {
      expect(HISTORY_PAGE_SIZE).toBe(10);
    });

    it('HISTORY_INITIAL_LIMIT보다 크거나 같아야 함', () => {
      expect(HISTORY_PAGE_SIZE).toBeGreaterThanOrEqual(HISTORY_INITIAL_LIMIT);
    });
  });

  describe('BESTSELLER_CATEGORIES', () => {
    it('배열이어야 함', () => {
      expect(Array.isArray(BESTSELLER_CATEGORIES)).toBe(true);
      expect(BESTSELLER_CATEGORIES.length).toBeGreaterThan(0);
    });

    it('전체(all) 옵션이 있어야 함', () => {
      const allOption = BESTSELLER_CATEGORIES.find(c => c.value === 'all');
      expect(allOption).toBeDefined();
      expect(allOption?.label).toBe('전체');
    });

    it('각 옵션은 value와 label을 가져야 함', () => {
      BESTSELLER_CATEGORIES.forEach(category => {
        expect(category.value).toBeDefined();
        expect(category.label).toBeDefined();
        expect(typeof category.value).toBe('string');
        expect(typeof category.label).toBe('string');
      });
    });

    it('가전디지털 카테고리가 있어야 함', () => {
      const electronics = BESTSELLER_CATEGORIES.find(c => c.value === '1001');
      expect(electronics).toBeDefined();
      expect(electronics?.label).toBe('가전디지털');
    });

    it('패션의류 카테고리가 있어야 함', () => {
      const fashion = BESTSELLER_CATEGORIES.find(c => c.value === '1002');
      expect(fashion).toBeDefined();
      expect(fashion?.label).toBe('패션의류');
    });

    it('식품 카테고리가 있어야 함', () => {
      const food = BESTSELLER_CATEGORIES.find(c => c.value === '1010');
      expect(food).toBeDefined();
      expect(food?.label).toBe('식품');
    });

    it('생활/건강 카테고리가 있어야 함', () => {
      const health = BESTSELLER_CATEGORIES.find(c => c.value === '1012');
      expect(health).toBeDefined();
      expect(health?.label).toBe('생활/건강');
    });

    it('출산/육아 카테고리가 있어야 함', () => {
      const baby = BESTSELLER_CATEGORIES.find(c => c.value === '1014');
      expect(baby).toBeDefined();
      expect(baby?.label).toBe('출산/육아');
    });

    it('중복된 value가 없어야 함', () => {
      const values = BESTSELLER_CATEGORIES.map(c => c.value);
      const uniqueValues = new Set(values);
      expect(uniqueValues.size).toBe(values.length);
    });
  });
});
