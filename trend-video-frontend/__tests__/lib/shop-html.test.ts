/**
 * shop-html.ts 유닛 테스트
 */

import {
  generateShopHtml,
  normalizeCategoryName,
  PublishedProduct,
} from '@/lib/shop-html';

describe('shop-html', () => {
  describe('normalizeCategoryName', () => {
    it('정상 카테고리는 그대로 반환', () => {
      expect(normalizeCategoryName('가전디지털')).toBe('가전디지털');
      expect(normalizeCategoryName('패션의류')).toBe('패션의류');
    });

    it('앞뒤 공백 제거', () => {
      expect(normalizeCategoryName('  가전디지털  ')).toBe('가전디지털');
    });

    it('빈 문자열은 "기타" 반환', () => {
      expect(normalizeCategoryName('')).toBe('기타');
      expect(normalizeCategoryName('   ')).toBe('기타');
    });

    it('undefined는 "기타" 반환', () => {
      expect(normalizeCategoryName(undefined)).toBe('기타');
    });

    it('null은 "기타" 반환', () => {
      expect(normalizeCategoryName(null)).toBe('기타');
    });
  });

  describe('generateShopHtml', () => {
    const mockProducts: PublishedProduct[] = [
      {
        id: 'product-1',
        title: '테스트 상품 1',
        description: '상품 설명 1',
        category: '가전디지털',
        original_price: 100000,
        discount_price: 80000,
        image_url: 'https://example.com/image1.jpg',
        deep_link: 'https://coupang.com/1',
      },
      {
        id: 'product-2',
        title: '테스트 상품 2',
        description: '상품 설명 2',
        category: '패션의류',
        original_price: 50000,
        discount_price: null,
        image_url: null,
        deep_link: 'https://coupang.com/2',
      },
    ];

    it('HTML을 생성해야 함', () => {
      const html = generateShopHtml(mockProducts);
      expect(html).toBeDefined();
      expect(typeof html).toBe('string');
    });

    it('쿠팡 샵 컨테이너가 있어야 함', () => {
      const html = generateShopHtml(mockProducts);
      expect(html).toContain('coupang-shop-container');
    });

    it('상품 카드가 포함되어야 함', () => {
      const html = generateShopHtml(mockProducts);
      expect(html).toContain('coupang-product-card');
      expect(html).toContain('테스트 상품 1');
      expect(html).toContain('테스트 상품 2');
    });

    it('카테고리 탭이 포함되어야 함', () => {
      const html = generateShopHtml(mockProducts);
      expect(html).toContain('coupang-category-tabs');
      expect(html).toContain('data-category="all"');
      expect(html).toContain('가전디지털');
      expect(html).toContain('패션의류');
    });

    it('전체 탭이 있어야 함', () => {
      const html = generateShopHtml(mockProducts);
      expect(html).toContain('data-category="all">전체</button>');
    });

    it('잠시저장 탭이 있어야 함', () => {
      const html = generateShopHtml(mockProducts);
      expect(html).toContain('data-category="bookmarks"');
    });

    it('가격 정보가 포함되어야 함', () => {
      const html = generateShopHtml(mockProducts);
      expect(html).toContain('80,000원');
      expect(html).toContain('100,000원');
    });

    it('쿠팡 링크가 포함되어야 함', () => {
      const html = generateShopHtml(mockProducts);
      expect(html).toContain('https://coupang.com/1');
      expect(html).toContain('쿠팡에서 보기');
    });

    it('이미지가 있으면 포함되어야 함', () => {
      const html = generateShopHtml(mockProducts);
      expect(html).toContain('https://example.com/image1.jpg');
    });

    it('북마크 버튼이 포함되어야 함', () => {
      const html = generateShopHtml(mockProducts);
      expect(html).toContain('bookmark-btn');
      expect(html).toContain('toggleBookmark');
    });

    it('스크립트가 포함되어야 함', () => {
      const html = generateShopHtml(mockProducts);
      expect(html).toContain('<script>');
      expect(html).toContain('filterProducts');
    });

    it('면책 조항이 포함되어야 함', () => {
      const html = generateShopHtml(mockProducts);
      expect(html).toContain('쿠팡 파트너스');
      expect(html).toContain('수수료');
    });

    it('닉네임이 제공되면 공지에 포함되어야 함', () => {
      const html = generateShopHtml(mockProducts, '테스트채널');
      expect(html).toContain('테스트채널');
    });

    it('닉네임이 없으면 기본값 사용', () => {
      const html = generateShopHtml(mockProducts);
      expect(html).toContain('운영자');
    });

    it('빈 상품 배열은 빈 메시지 표시', () => {
      const html = generateShopHtml([]);
      expect(html).toContain('coupang-empty');
      expect(html).toContain('퍼블리시된 상품이 없습니다');
    });

    it('빈 상품일 때 스크립트가 없어야 함', () => {
      const html = generateShopHtml([]);
      expect(html).not.toContain('filterProducts');
    });

    it('XSS 방지 - HTML 특수문자 이스케이프', () => {
      const xssProduct: PublishedProduct[] = [
        {
          id: 'xss-1',
          title: '<script>alert("xss")</script>',
          description: '<img onerror="alert(1)" src="x">',
          category: 'test<>',
          deep_link: 'https://coupang.com/safe',
        },
      ];

      const html = generateShopHtml(xssProduct);
      expect(html).not.toContain('<script>alert');
      expect(html).toContain('&lt;script&gt;');
      expect(html).toContain('&lt;img');
    });

    it('가격이 문자열로 와도 포맷팅 됨', () => {
      const stringPriceProduct: PublishedProduct[] = [
        {
          id: 'str-price',
          title: '테스트',
          discount_price: '12345' as any,
          deep_link: 'https://coupang.com/1',
        },
      ];

      const html = generateShopHtml(stringPriceProduct);
      expect(html).toContain('12,345');
    });

    it('스타일이 포함되어야 함', () => {
      const html = generateShopHtml(mockProducts);
      expect(html).toContain('<style>');
      expect(html).toContain('.coupang-shop-grid');
      expect(html).toContain('grid-template-columns');
    });

    it('반응형 스타일이 포함되어야 함', () => {
      const html = generateShopHtml(mockProducts);
      expect(html).toContain('@media');
      expect(html).toContain('max-width: 768px');
    });
  });
});
