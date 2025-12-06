/**
 * Automation 페이지 관련 유틸리티 함수
 */

/**
 * localStorage에서 선택한 채널 불러오기
 */
export function getSelectedChannel(): string {
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem('automation_selected_channel');
    return saved || '';
  }
  return '';
}

/**
 * localStorage에서 선택한 카테고리 불러오기
 */
export function getSelectedCategory(): string {
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem('automation_selected_category');
    return saved || '';
  }
  return '';
}

/**
 * localStorage에서 선택한 타입 불러오기
 */
export function getSelectedType(): string {
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem('automation_selected_type');
    return saved || 'longform';
  }
  return 'longform';
}

/**
 * 타입별 기본 모델 설정
 */
export function getDefaultModelByType(type?: string): string {
  switch (type) {
    case 'product':
    case 'product-info':
      return 'gemini'; // 상품: Gemini
    case 'longform':
    case 'sora2':
    case 'shortform':
    default:
      return 'claude'; // 기본값: Claude
  }
}

/**
 * 타입별 기본 TTS 음성 설정
 * - 롱폼: 순복 (SoonBokNeural)
 * - 숏폼/상품: 선희 (SunHiNeural)
 */
export function getDefaultTtsByType(type?: string): string {
  switch (type) {
    case 'longform':
      return 'ko-KR-SoonBokNeural'; // 롱폼: 순복
    case 'shortform':
    case 'product':
    case 'product-info':
    default:
      return 'ko-KR-SunHiNeural'; // 숏폼/상품/기본: 선희
  }
}

/**
 * localStorage에서 선택한 LLM 모델 불러오기
 */
export function getSelectedModel(): string {
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem('automation_selected_model');
    return saved || 'claude';
  }
  return 'claude';
}

/**
 * 현재 선택된 타입에 따른 모델 가져오기
 */
export function getModelForCurrentType(): string {
  const currentType = getSelectedType();
  return getDefaultModelByType(currentType);
}

/**
 * 타입별 기본 미디어 모드 설정
 */
export function getDefaultMediaModeByType(type?: string): string {
  switch (type) {
    case 'longform':
      return 'crawl'; // 롱폼: 이미지 크롤링 (imageFX+whisk)
    case 'shortform':
    case 'product':
    case 'product-info':
    case 'sora2':
      return 'imagen3'; // 숏폼/상품: Imagen 3
    default:
      return 'crawl'; // 기본값: 이미지 크롤링
  }
}

/**
 * localStorage에서 선택한 미디어 모드 불러오기
 */
export function getSelectedMediaMode(): string {
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem('automation_selected_media_mode');
    // 저장된 값이 없으면 현재 타입에 맞는 기본값 사용
    if (!saved) {
      const currentType = getSelectedType();
      return getDefaultMediaModeByType(currentType);
    }
    return saved;
  }
  return 'crawl';
}

/**
 * localStorage에서 선택한 공개 설정 불러오기
 */
export function getSelectedPrivacy(): string {
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem('automation_selected_privacy');
    return saved || 'public';
  }
  return 'public';
}

/**
 * 현재 시간을 datetime-local 형식으로 반환
 */
export function getCurrentTimeForInput(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

/**
 * 현재 시간 + 3분 계산 (로컬 시간대)
 */
export function getDefaultScheduleTime(): string {
  const now = new Date();
  now.setMinutes(now.getMinutes() + 3);
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

/**
 * 파일명으로 사용할 수 없는 문자 검증 (? 제외 - YouTube 제목에는 사용 가능)
 */
export function validateTitle(title: string): string {
  const invalidChars = /[<>:"/\\|*]/g;
  if (invalidChars.test(title)) {
    return `제목에 사용할 수 없는 문자가 포함되어 있습니다: < > : " / \\ | *`;
  }
  return '';
}

/**
 * 날짜 포맷팅 (한국어 형식)
 */
export function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleString('ko-KR');
}

/**
 * 로컬 시간을 UTC ISO 문자열로 변환
 */
export function localToUtcIso(localDateTimeString: string): string {
  const localDate = new Date(localDateTimeString);
  return localDate.toISOString();
}

/**
 * UTC ISO 문자열을 로컬 datetime-local 형식으로 변환
 */
export function utcIsoToLocal(utcIsoString: string): string {
  const date = new Date(utcIsoString);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}
