/**
 * localStorage 관련 유틸리티 함수
 */

import type { StoredFilters } from "@/types/page";
import { FILTER_STORAGE_KEY } from "@/lib/constants/video";
import { extractPureJson } from "@/lib/json-utils";
import { normalizeModel } from "@/lib/utils/modelUtils";

/**
 * 마크다운 코드 블록 제거 (하위 호환성 유지)
 */
export function stripMarkdownCodeBlock(text: string): string {
  return extractPureJson(text);
}

let cachedFilters: StoredFilters | null | undefined = undefined;

/**
 * 저장된 필터 불러오기
 */
export function loadStoredFilters(): StoredFilters | null {
  if (typeof window === 'undefined') {
    return null;
  }
  if (cachedFilters !== undefined) {
    return cachedFilters ?? null;
  }
  try {
    const saved = localStorage.getItem(FILTER_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved) as StoredFilters;
      if (parsed && typeof parsed === 'object' && 'selectedModel' in parsed && parsed.selectedModel) {
        parsed.selectedModel = normalizeModel(parsed.selectedModel);
      }
      cachedFilters = parsed;
      return cachedFilters;
    }
  } catch (e) {
    console.error('Failed to load stored filters:', e);
  }
  cachedFilters = null;
  return null;
}

/**
 * 필터 저장하기
 */
export function saveFilters(filters: StoredFilters): void {
  if (typeof window === 'undefined') return;

  try {
    localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify(filters));
    cachedFilters = filters;
  } catch (e) {
    console.error('Failed to save filters:', e);
  }
}

/**
 * 캐시 무효화
 */
export function invalidateFiltersCache(): void {
  cachedFilters = undefined;
}
