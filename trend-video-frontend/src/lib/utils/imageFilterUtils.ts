/**
 * BTS-3059: 모든 이미지 보기에서 이미지 필터링 및 prefix 표시 유틸리티
 */

// 숨길 이미지 파일명 패턴
// - product_thumbnail: 상품 썸네일 (크롤링된 상품 대표 이미지)
// - scene_00_hook: 훅/인트로 이미지 (디버깅용)
export const HIDDEN_IMAGE_PREFIXES = ['product_thumbnail', 'scene_00_hook'];

/**
 * 파일명이 숨겨야 할 이미지인지 확인
 * @param filename 파일명 (예: product_thumbnail.jpeg, scene_00_hook.png)
 * @returns 숨겨야 하면 true
 */
export function isHiddenImage(filename: string): boolean {
  return HIDDEN_IMAGE_PREFIXES.some(prefix => filename.startsWith(prefix));
}

/**
 * 파일명에서 prefix 추출 (예: scene_01_main.jpeg → scene_01_main)
 * @param filename 파일명
 * @returns 추출된 prefix 또는 확장자 제거된 파일명
 */
export function extractImagePrefix(filename: string): string {
  // 확장자 제거
  const nameWithoutExt = filename.replace(/\.\w+$/, '');
  // scene_XX_xxx 패턴 또는 product_thumbnail 등
  const match = nameWithoutExt.match(/^(scene_\d+_[^.]+|product_thumbnail)/);
  return match ? match[1] : nameWithoutExt;
}

/**
 * 이미지 목록에서 숨길 이미지 필터링
 * @param images 전체 이미지 목록
 * @param showHidden true이면 모든 이미지 반환, false이면 숨김 이미지 제외
 * @returns 필터링된 이미지 목록
 */
export function filterImages<T extends { filename: string }>(
  images: T[],
  showHidden: boolean = false
): T[] {
  if (showHidden) return images;
  return images.filter(img => !isHiddenImage(img.filename));
}
