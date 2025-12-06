/**
 * 비디오 관련 상수 정의
 */

import type { DateFilter, SortOption, VideoType } from "@/types/video";

export const FILTER_STORAGE_KEY = 'trend-video-filters';
export const MAX_LOG_LINES = 50;

export const fallbackVideos: any[] = [];

export const typeOptions: { label: string; value: VideoType | "all" }[] = [
  { label: "전체", value: "all" },
  { label: "Video", value: "video" },
  { label: "Shorts", value: "shorts" },
  { label: "Live", value: "live" },
];

export const dateOptions: { label: string; value: DateFilter }[] = [
  { label: "전체", value: "any" },
  { label: "오늘", value: "today" },
  { label: "이번 주", value: "week" },
  { label: "이번 달", value: "month" },
  { label: "최근 2달", value: "two_months" },
];

export const sortOptions: { label: string; value: SortOption }[] = [
  { label: "조회수", value: "views" },
  { label: "VPH", value: "vph" },
  { label: "최신순", value: "recent" },
];

export const CATEGORY_OPTIONS: Array<{ id: string; label: string }> = [
  { id: "1", label: "영화 & 애니" },
  { id: "2", label: "자동차" },
  { id: "10", label: "음악" },
  { id: "17", label: "스포츠" },
  { id: "20", label: "게임" },
  { id: "22", label: "인물 & 블로그" },
  { id: "23", label: "코미디" },
  { id: "24", label: "엔터테인먼트" },
  { id: "25", label: "뉴스 & 정치" },
  { id: "26", label: "교육" },
  { id: "27", label: "과학 & 기술" },
  { id: "28", label: "DIY & 라이프" },
];

export const categoryLabelMap = Object.fromEntries(
  CATEGORY_OPTIONS.map((option) => [option.id, option.label])
);

export const modelOptions = [
  { label: 'ChatGPT', value: 'chatgpt' },
  { label: 'Gemini', value: 'gemini' },
  { label: 'Claude', value: 'claude' },
  { label: 'Grok', value: 'grok' }
] as const;

export type ModelOption = (typeof modelOptions)[number]['value'];

export const defaultViewRange = { min: 200_000, max: 100_000_000 };
export const defaultSubRange = { min: 1, max: 10_000_000 };
export const defaultDurationRange = { min: 0, max: 120 };

export const numberFormatter = new Intl.NumberFormat("ko-KR");
