/**
 * 필터 관리 훅
 */

import { useState, useEffect } from 'react';
import type { DateFilter, SortOption, VideoType } from '@/types/video';
import type { ModelOption } from '@/lib/constants/video';
import type { StoredFilters } from '@/types/page';
import {
  defaultViewRange,
  defaultSubRange,
  defaultDurationRange,
} from '@/lib/constants/video';
import { saveFilters } from '@/lib/utils/storageUtils';

export function useFilterManagement() {
  const [isMounted, setIsMounted] = useState(false);

  // localStorage에서 필터 복원
  const loadFilters = (): Partial<StoredFilters> => {
    if (typeof window === 'undefined') return {};
    try {
      const saved = localStorage.getItem('trend-video-filters');
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.error('Failed to load filters:', e);
    }
    return {};
  };

  const savedFilters = loadFilters();

  const [viewRange, setViewRange] = useState(savedFilters.viewRange || defaultViewRange);
  const [subRange, setSubRange] = useState(savedFilters.subRange || defaultSubRange);
  const [videoType, setVideoType] = useState<VideoType | "all">(savedFilters.videoType || "all");
  const [dateFilter, setDateFilter] = useState<DateFilter>(savedFilters.dateFilter || "any");
  const [sortBy, setSortBy] = useState<SortOption>(savedFilters.sortBy || "views");
  const [selectedCategories, setSelectedCategories] = useState<string[]>(savedFilters.selectedCategories || []);
  const [titleQuery, setTitleQuery] = useState(savedFilters.titleQuery || "");
  const [durationRange, setDurationRange] = useState(savedFilters.durationRange || defaultDurationRange);
  const [selectedModel, setSelectedModel] = useState<ModelOption>(() => {
    if (typeof window !== 'undefined') {
      try {
        const filters = localStorage.getItem('trend-video-filters');
        if (filters) {
          const parsed = JSON.parse(filters);
          const storedModel = parsed.selectedModel;
          if (storedModel && ['chatgpt', 'gemini', 'claude', 'grok'].includes(storedModel)) {
            return storedModel as ModelOption;
          }
        }
      } catch (e) {
        console.error('Failed to load selectedModel from localStorage:', e);
      }
    }
    return 'chatgpt';
  });

  const [isFilterExpanded, setIsFilterExpanded] = useState(() => {
    if (typeof window === 'undefined') return true;
    try {
      const saved = localStorage.getItem('trend-video-filters');
      if (saved) {
        const filters = JSON.parse(saved);
        return filters.isFilterExpanded ?? true;
      }
    } catch (e) {
      console.error('Failed to load isFilterExpanded:', e);
    }
    return true;
  });

  // 필터 변경 시 localStorage에 저장
  useEffect(() => {
    if (!isMounted) return;

    const filters: StoredFilters = {
      viewRange,
      subRange,
      videoType,
      dateFilter,
      sortBy,
      selectedCategories,
      titleQuery,
      durationRange,
      selectedModel
    };

    saveFilters(filters);
  }, [isMounted, viewRange, subRange, videoType, dateFilter, sortBy, selectedCategories, titleQuery, durationRange, selectedModel]);

  // 마운트 시 플래그 설정
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // 카테고리 토글
  const toggleCategory = (categoryId: string) => {
    setSelectedCategories(prev =>
      prev.includes(categoryId)
        ? prev.filter(c => c !== categoryId)
        : [...prev, categoryId]
    );
  };

  // 필터 초기화
  const resetFilters = () => {
    setViewRange(defaultViewRange);
    setSubRange(defaultSubRange);
    setVideoType("all");
    setDateFilter("any");
    setSortBy("views");
    setSelectedCategories([]);
    setTitleQuery("");
    setDurationRange(defaultDurationRange);
    setSelectedModel('chatgpt');
  };

  return {
    // State
    viewRange,
    subRange,
    videoType,
    dateFilter,
    sortBy,
    selectedCategories,
    titleQuery,
    durationRange,
    selectedModel,
    isFilterExpanded,

    // Setters
    setViewRange,
    setSubRange,
    setVideoType,
    setDateFilter,
    setSortBy,
    setSelectedCategories,
    setTitleQuery,
    setDurationRange,
    setSelectedModel,
    setIsFilterExpanded,

    // Methods
    toggleCategory,
    resetFilters,
  };
}
