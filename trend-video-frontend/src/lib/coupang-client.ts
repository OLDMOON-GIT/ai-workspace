/**
 * 쿠팡 파트너스 API 클라이언트
 *
 * 쿠팡 파트너스 OpenAPI를 사용하여 상품 검색, 딥링크 생성 등을 수행합니다.
 *
 * 공식 문서: https://developers.coupang.com/hc/ko
 */

import crypto from 'crypto';

interface CoupangConfig {
  accessKey: string;
  secretKey: string;
  trackingId?: string;
}

interface CoupangProduct {
  productId: string;
  productName: string;
  productPrice: number;
  productImage: string;
  productUrl: string;
  categoryName: string;
  isRocket: boolean;
}

interface SearchResponse {
  rCode: string;
  rMessage: string;
  data?: {
    productData?: any[];
  };
}

interface DeepLinkResponse {
  rCode: string;
  rMessage: string;
  data?: Array<{
    shortenUrl: string;
  }>;
}

export class CoupangClient {
  private config: CoupangConfig;
  private domain = 'https://api-gateway.coupang.com';

  constructor(config: CoupangConfig) {
    this.config = config;
  }

  /**
   * API 요청을 위한 인증 헤더 생성
   * 🚨 datetime 형식: yymmddTHHMMSSZ (예: 241129T051204Z)
   */
  private generateAuthHeaders(method: string, url: string): Record<string, string> {
    const now = new Date();
    const year = String(now.getUTCFullYear()).slice(-2);
    const month = String(now.getUTCMonth() + 1).padStart(2, '0');
    const day = String(now.getUTCDate()).padStart(2, '0');
    const hours = String(now.getUTCHours()).padStart(2, '0');
    const minutes = String(now.getUTCMinutes()).padStart(2, '0');
    const seconds = String(now.getUTCSeconds()).padStart(2, '0');
    const datetime = `${year}${month}${day}T${hours}${minutes}${seconds}Z`;
    const message = datetime + method + url;

    const signature = crypto
      .createHmac('sha256', this.config.secretKey)
      .update(message)
      .digest('hex');

    const authorization = `CEA algorithm=HmacSHA256, access-key=${this.config.accessKey}, signed-date=${datetime}, signature=${signature}`;

    return {
      'Authorization': authorization,
      'Content-Type': 'application/json'
    };
  }

  /**
   * API 요청 실행
   */
  private async request<T>(method: string, url: string, body?: any): Promise<T> {
    const headers = this.generateAuthHeaders(method, url);

    const options: RequestInit = {
      method,
      headers
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(this.domain + url, options);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'API 요청 실패' }));
      throw new Error(errorData.message || `API 오류: ${response.status}`);
    }

    return response.json();
  }

  /**
   * 키워드로 상품 검색
   *
   * @param keyword 검색 키워드
   * @param limit 결과 개수 (기본: 20, 최대: 100)
   * @returns 검색된 상품 목록
   */
  async searchProducts(keyword: string, limit: number = 20): Promise<CoupangProduct[]> {
    const url = `/v2/providers/affiliate_open_api/apis/openapi/v1/products/search?keyword=${encodeURIComponent(keyword)}&limit=${limit}`;

    const response = await this.request<SearchResponse>('GET', url);

    if (response.rCode !== '0' || !response.data?.productData) {
      return [];
    }

    return response.data.productData.map((item: any) => ({
      productId: item.productId,
      productName: item.productName,
      productPrice: item.productPrice,
      productImage: item.productImage,
      productUrl: item.productUrl,
      categoryName: item.categoryName || '기타',
      isRocket: item.isRocket || false
    }));
  }

  /**
   * 딥링크 생성 (파트너스 제휴 링크)
   *
   * @param productUrl 쿠팡 상품 URL
   * @returns 생성된 파트너스 단축 링크
   */
  async generateDeepLink(productUrl: string): Promise<string> {
    const url = '/v2/providers/affiliate_open_api/apis/openapi/v1/deeplink';

    console.log('[Coupang API] 딥링크 생성 요청 URL:', productUrl);

    // ⚠️ URL 검증: 빈 문자열이나 유효하지 않은 URL 체크
    if (!productUrl || !productUrl.trim()) {
      console.error('[Coupang API] ❌ 빈 URL 전달됨');
      throw new Error('빈 URL로 딥링크 생성 불가');
    }

    // ⚠️ 쿠팡 URL인지 확인
    if (!productUrl.includes('coupang.com')) {
      console.error('[Coupang API] ❌ 쿠팡 URL이 아님:', productUrl);
      throw new Error(`쿠팡 URL이 아님: ${productUrl}`);
    }

    const response = await this.request<DeepLinkResponse>('POST', url, {
      coupangUrls: [productUrl]
    });

    if (response.rCode !== '0' || !response.data || response.data.length === 0) {
      console.error('[Coupang API] 딥링크 응답 실패:', JSON.stringify(response));
      console.error('[Coupang API] 요청한 URL:', productUrl);
      throw new Error(`딥링크 생성 실패 (rCode: ${response.rCode}, rMessage: ${response.rMessage})`);
    }

    return response.data[0].shortenUrl;
  }

  /**
   * 베스트 카테고리 상품 조회 (연결 테스트용)
   *
   * @param categoryId 카테고리 ID (기본: 1001 - 여성패션)
   * @param limit 결과 개수 (기본: 10)
   */
  async getBestProducts(categoryId: number = 1001, limit: number = 10): Promise<any[]> {
    const url = `/v2/providers/affiliate_open_api/apis/openapi/v1/products/bestcategories/${categoryId}?limit=${limit}`;

    const response = await this.request<any>('GET', url);

    if (response.rCode !== '0' || !response.data) {
      return [];
    }

    return response.data;
  }

  /**
   * API 연결 테스트
   *
   * @returns 연결 성공 여부
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.getBestProducts(1001, 1);
      return true;
    } catch (error) {
      console.error('쿠팡 API 연결 테스트 실패:', error);
      return false;
    }
  }

  /**
   * 여러 상품 URL을 한 번에 딥링크로 변환
   *
   * @param productUrls 상품 URL 배열 (최대 20개)
   * @returns 생성된 딥링크 배열
   */
  async generateMultipleDeepLinks(productUrls: string[]): Promise<string[]> {
    const url = '/v2/providers/affiliate_open_api/apis/openapi/v1/deeplink';

    // 최대 20개까지만 처리
    const urls = productUrls.slice(0, 20);

    const response = await this.request<DeepLinkResponse>('POST', url, {
      coupangUrls: urls
    });

    if (response.rCode !== '0' || !response.data) {
      throw new Error('딥링크 생성 실패');
    }

    return response.data.map(item => item.shortenUrl);
  }
}

/**
 * 쿠팡 클라이언트 인스턴스 생성 헬퍼
 */
export function createCoupangClient(config: CoupangConfig): CoupangClient {
  return new CoupangClient(config);
}

/**
 * 쿠팡 카테고리 ID 목록 (참고용)
 */
export const COUPANG_CATEGORIES = {
  FASHION_WOMEN: 1001,
  FASHION_MEN: 1002,
  FASHION_BAG: 1010,
  FASHION_SHOES: 1011,
  FASHION_ACC: 1012,
  BEAUTY: 1013,
  FOOD: 1029,
  BABY: 1030,
  KITCHEN: 1014,
  LIVING: 1015,
  SPORTS: 1016,
  DIGITAL: 1020,
  HOUSEHOLD: 1021,
  CAR: 1024,
  BOOKS: 1025,
  TOY: 1026,
  PET: 1032
} as const;
