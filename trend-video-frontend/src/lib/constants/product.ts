/**
 * Product 페이지 관련 상수
 */

/**
 * 크롤링 이력 초기 표시 개수
 */
export const HISTORY_INITIAL_LIMIT = 5;

/**
 * 크롤링 이력 페이지 사이즈
 */
export const HISTORY_PAGE_SIZE = 10;

/**
 * 쿠팡 베스트셀러 카테고리 목록
 */
export const BESTSELLER_CATEGORIES = [
  { value: 'all', label: '전체' },
  { value: '1001', label: '가전디지털' },
  { value: '1002', label: '패션의류' },
  { value: '1010', label: '식품' },
  { value: '1011', label: '스포츠/레저' },
  { value: '1012', label: '생활/건강' },
  { value: '1013', label: '여가/생활편의' },
  { value: '1014', label: '출산/육아' },
  { value: '1015', label: '면세점' }
] as const;
