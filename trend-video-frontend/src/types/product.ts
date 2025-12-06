/**
 * Product 페이지 관련 타입 정의
 */

/**
 * 상품 정보
 * @description API 응답 형식 (snake_case) 그대로 사용
 */
export interface Product {
  id: string;           // coupang_id as id
  user_id?: string;
  title: string;
  description: string;
  category: string;
  thumbnail_url: string;
  product_url?: string;
  deep_link: string;    // 쿠팡 딥링크 (수익화 필수)
  original_price?: number;
  discount_price?: number;
  status: string;
  view_count: number;
  click_count: number;
  created_at: string;
  updated_at?: string;
  is_favorite?: number; // 0 or 1
  queue_id?: string;    // 대기목록에서 온 경우에만 존재
  queue_status?: string;
  queue_retry_count?: number;
  queue_error?: string;
}

/**
 * 크롤링 이력 항목
 */
export interface CrawlHistoryItem {
  id: string;
  url: string;
  hostname?: string;
  lastCrawledAt?: string;
  resultCount?: number;
  duplicateCount?: number;
  errorCount?: number;
  totalLinks?: number;
  status?: string;
  message?: string;
  pendingCount?: number;
}

/**
 * 상품 편집 폼
 */
export interface ProductEditForm {
  title: string;
  description: string;
  category: string;
  original_price: string;
  discount_price: string;
  product_url: string;  // ⭐ 상품 링크 (품절 시 교체용)
}

/**
 * 쇼핑몰 카테고리
 */
export interface ShopCategory {
  name: string;
  count: number;
  thumbnail?: string;
}

/**
 * 쿠팡 파트너스 통계
 */
export interface CoupangStats {
  totalClicks: number;
  totalLinks: number;
  estimatedRevenue: number;
  conversionRate: number;
}

/**
 * 베스트셀러 검색 결과
 */
export interface BestsellerItem {
  productId: string;
  productName: string;
  productPrice: number;
  productImage: string;
  productUrl: string;
  categoryName?: string;
  rank?: number;
}

/**
 * 쿠팡 검색 결과
 */
export interface CoupangSearchResult {
  productId: string;
  productName: string;
  productPrice: number;
  productImage: string;
  productUrl: string;
  categoryName?: string;
}

/**
 * 탭 타입
 */
export type ProductTabType = 'my-list' | 'queue' | 'pending' | 'shop' | 'coupang';

/**
 * 쿠팡 서브 탭 타입
 */
export type CoupangSubTabType = 'bestseller' | 'search';
