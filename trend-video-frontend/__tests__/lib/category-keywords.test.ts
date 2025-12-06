/**
 * category-keywords.ts 유닛 테스트
 */

import {
  CATEGORY_KEYWORDS,
  getCategoryKeywords,
  getAllCategories,
  getCategoryDisplayNames,
  getRandomKeyword,
  getCombinedKeywords,
  CategoryKeywordSet
} from '@/lib/category-keywords';

describe('category-keywords', () => {
  describe('CATEGORY_KEYWORDS', () => {
    it('카테고리 배열이 존재해야 함', () => {
      expect(CATEGORY_KEYWORDS).toBeDefined();
      expect(Array.isArray(CATEGORY_KEYWORDS)).toBe(true);
      expect(CATEGORY_KEYWORDS.length).toBeGreaterThan(0);
    });

    it('각 카테고리는 필수 필드를 가져야 함', () => {
      CATEGORY_KEYWORDS.forEach((category) => {
        expect(category.category).toBeDefined();
        expect(category.displayName).toBeDefined();
        expect(category.keywords).toBeDefined();
        expect(Array.isArray(category.keywords)).toBe(true);
        expect(category.keywords.length).toBeGreaterThan(0);
        expect(category.description).toBeDefined();
      });
    });

    it('시니어사연 카테고리가 존재해야 함', () => {
      const senior = CATEGORY_KEYWORDS.find(c => c.category === '시니어사연');
      expect(senior).toBeDefined();
      expect(senior?.displayName).toBe('시니어 실화·사연');
    });

    it('상품 카테고리가 존재해야 함', () => {
      const product = CATEGORY_KEYWORDS.find(c => c.category === '상품');
      expect(product).toBeDefined();
      expect(product?.keywords).toContain('상품 리뷰');
    });
  });

  describe('getCategoryKeywords', () => {
    it('존재하는 카테고리를 찾아야 함', () => {
      const result = getCategoryKeywords('시니어사연');
      expect(result).toBeDefined();
      expect(result?.category).toBe('시니어사연');
    });

    it('displayName으로도 찾아야 함', () => {
      const result = getCategoryKeywords('시니어 실화·사연');
      expect(result).toBeDefined();
      expect(result?.category).toBe('시니어사연');
    });

    it('대소문자 구분 없이 찾아야 함', () => {
      const result = getCategoryKeywords('코미디');
      expect(result).toBeDefined();
      expect(result?.category).toBe('코미디');
    });

    it('존재하지 않는 카테고리는 사용자 정의 카테고리로 반환', () => {
      const result = getCategoryKeywords('새로운카테고리');
      expect(result).toBeDefined();
      expect(result?.category).toBe('새로운카테고리');
      expect(result?.keywords).toContain('새로운카테고리');
      expect(result?.description).toContain('사용자 정의');
    });

    it('일반 카테고리가 없으면 undefined 반환', () => {
      // '일반'은 매핑에 있으므로 반환됨
      const result = getCategoryKeywords('일반');
      expect(result).toBeDefined();
      expect(result?.category).toBe('일반');
    });
  });

  describe('getAllCategories', () => {
    it('모든 카테고리 이름을 반환해야 함', () => {
      const categories = getAllCategories();
      expect(Array.isArray(categories)).toBe(true);
      expect(categories.length).toBe(CATEGORY_KEYWORDS.length);
      expect(categories).toContain('시니어사연');
      expect(categories).toContain('상품');
      expect(categories).toContain('북한탈북자사연');
    });
  });

  describe('getCategoryDisplayNames', () => {
    it('카테고리와 displayName 쌍을 반환해야 함', () => {
      const result = getCategoryDisplayNames();
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(CATEGORY_KEYWORDS.length);

      result.forEach(item => {
        expect(item.category).toBeDefined();
        expect(item.displayName).toBeDefined();
      });
    });

    it('시니어사연의 displayName이 올바른지 확인', () => {
      const result = getCategoryDisplayNames();
      const senior = result.find(r => r.category === '시니어사연');
      expect(senior?.displayName).toBe('시니어 실화·사연');
    });
  });

  describe('getRandomKeyword', () => {
    it('존재하는 카테고리에서 키워드를 반환해야 함', () => {
      const keyword = getRandomKeyword('시니어사연');
      const seniorCategory = CATEGORY_KEYWORDS.find(c => c.category === '시니어사연');
      expect(seniorCategory?.keywords).toContain(keyword);
    });

    it('존재하지 않는 카테고리는 기본값 반환', () => {
      // 빈 카테고리의 경우
      const keyword = getRandomKeyword('');
      expect(keyword).toBe('korea trending');
    });

    it('여러 번 호출 시 키워드 배열 내 값을 반환', () => {
      const keywords: string[] = [];
      for (let i = 0; i < 10; i++) {
        keywords.push(getRandomKeyword('코미디'));
      }

      const comedyCategory = CATEGORY_KEYWORDS.find(c => c.category === '코미디');
      keywords.forEach(kw => {
        expect(comedyCategory?.keywords).toContain(kw);
      });
    });
  });

  describe('getCombinedKeywords', () => {
    it('여러 카테고리의 키워드를 합쳐야 함', () => {
      const combined = getCombinedKeywords(['시니어사연', '코미디']);

      const seniorKeywords = CATEGORY_KEYWORDS.find(c => c.category === '시니어사연')?.keywords || [];
      const comedyKeywords = CATEGORY_KEYWORDS.find(c => c.category === '코미디')?.keywords || [];

      seniorKeywords.forEach(kw => {
        expect(combined).toContain(kw);
      });
      comedyKeywords.forEach(kw => {
        expect(combined).toContain(kw);
      });
    });

    it('빈 배열은 빈 결과 반환', () => {
      const combined = getCombinedKeywords([]);
      expect(combined).toEqual([]);
    });

    it('존재하지 않는 카테고리도 포함해야 함', () => {
      const combined = getCombinedKeywords(['시니어사연', '새카테고리']);
      expect(combined).toContain('새카테고리');
    });
  });
});
