/**
 * 필터링 관련 유틸리티 함수
 */

import type { DateFilter } from "@/types/video";

/**
 * 날짜 필터 매칭 확인
 */
export function matchesDateFilterLocal(publishedAt: string, filter: DateFilter): boolean {
  if (filter === "any") return true;

  const published = new Date(publishedAt);
  const now = new Date();
  const diffMs = now.getTime() - published.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);

  switch (filter) {
    case "today":
      return diffDays < 1;
    case "week":
      return diffDays < 7;
    case "month":
      return diffDays < 30;
    case "two_months":
      return diffDays < 60;
    default:
      return true;
  }
}

/**
 * 조회수 범위 매칭 확인
 */
export function matchesViewRange(
  views: number,
  range: { min: number; max: number }
): boolean {
  return views >= range.min && views <= range.max;
}

/**
 * 구독자 범위 매칭 확인
 */
export function matchesSubRange(
  subs: number | undefined,
  range: { min: number; max: number }
): boolean {
  if (subs === undefined) return true;
  return subs >= range.min && subs <= range.max;
}

/**
 * 영상 길이 범위 매칭 확인
 */
export function matchesDurationRange(
  duration: number,
  range: { min: number; max: number }
): boolean {
  return duration >= range.min && duration <= range.max;
}

/**
 * 제목 검색어 매칭 확인
 */
export function matchesTitleQuery(title: string, query: string): boolean {
  if (!query.trim()) return true;
  return title.toLowerCase().includes(query.toLowerCase());
}

/**
 * 카테고리 매칭 확인
 */
export function matchesCategories(
  categoryId: string | undefined,
  selectedCategories: string[]
): boolean {
  if (selectedCategories.length === 0) return true;
  return categoryId ? selectedCategories.includes(categoryId) : false;
}
