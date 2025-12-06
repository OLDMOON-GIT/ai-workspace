/**
 * useFilterManagement hook 테스트
 */

import { renderHook, act } from '@testing-library/react';
import { useFilterManagement } from '@/hooks/useFilterManagement';
import {
  defaultViewRange,
  defaultSubRange,
  defaultDurationRange,
} from '@/lib/constants/video';

// localStorage mock
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: jest.fn((key: string) => store[key] || null),
    setItem: jest.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: jest.fn((key: string) => {
      delete store[key];
    }),
    clear: jest.fn(() => {
      store = {};
    }),
  };
})();

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

describe('useFilterManagement', () => {
  beforeEach(() => {
    localStorageMock.clear();
    jest.clearAllMocks();
  });

  describe('초기화', () => {
    it('기본값으로 초기화되어야 함', () => {
      const { result } = renderHook(() => useFilterManagement());

      expect(result.current.viewRange).toEqual(defaultViewRange);
      expect(result.current.subRange).toEqual(defaultSubRange);
      expect(result.current.durationRange).toEqual(defaultDurationRange);
      expect(result.current.videoType).toBe('all');
      expect(result.current.dateFilter).toBe('any');
      expect(result.current.sortBy).toBe('views');
      expect(result.current.selectedCategories).toEqual([]);
      expect(result.current.titleQuery).toBe('');
      expect(result.current.selectedModel).toBe('chatgpt');
    });

    it('localStorage에서 필터를 복원해야 함', () => {
      const savedFilters = {
        videoType: 'short',
        dateFilter: 'week',
        sortBy: 'vph',
        selectedCategories: ['20', '22'],
        titleQuery: '테스트',
        selectedModel: 'claude',
      };

      localStorageMock.getItem.mockReturnValue(JSON.stringify(savedFilters));

      const { result } = renderHook(() => useFilterManagement());

      expect(result.current.videoType).toBe('short');
      expect(result.current.dateFilter).toBe('week');
      expect(result.current.sortBy).toBe('vph');
      expect(result.current.selectedCategories).toEqual(['20', '22']);
      expect(result.current.titleQuery).toBe('테스트');
      expect(result.current.selectedModel).toBe('claude');
    });

    it('잘못된 localStorage 데이터는 무시해야 함', () => {
      localStorageMock.getItem.mockReturnValue('invalid json');

      const { result } = renderHook(() => useFilterManagement());

      expect(result.current.videoType).toBe('all');
      expect(result.current.selectedModel).toBe('chatgpt');
    });
  });

  describe('상태 변경', () => {
    it('setVideoType이 동작해야 함', () => {
      const { result } = renderHook(() => useFilterManagement());

      act(() => {
        result.current.setVideoType('long');
      });

      expect(result.current.videoType).toBe('long');
    });

    it('setDateFilter가 동작해야 함', () => {
      const { result } = renderHook(() => useFilterManagement());

      act(() => {
        result.current.setDateFilter('month');
      });

      expect(result.current.dateFilter).toBe('month');
    });

    it('setSortBy가 동작해야 함', () => {
      const { result } = renderHook(() => useFilterManagement());

      act(() => {
        result.current.setSortBy('date');
      });

      expect(result.current.sortBy).toBe('date');
    });

    it('setTitleQuery가 동작해야 함', () => {
      const { result } = renderHook(() => useFilterManagement());

      act(() => {
        result.current.setTitleQuery('검색어');
      });

      expect(result.current.titleQuery).toBe('검색어');
    });

    it('setSelectedModel이 동작해야 함', () => {
      const { result } = renderHook(() => useFilterManagement());

      act(() => {
        result.current.setSelectedModel('gemini');
      });

      expect(result.current.selectedModel).toBe('gemini');
    });

    it('setViewRange가 동작해야 함', () => {
      const { result } = renderHook(() => useFilterManagement());

      const newRange = { min: 1000, max: 50000 };
      act(() => {
        result.current.setViewRange(newRange);
      });

      expect(result.current.viewRange).toEqual(newRange);
    });

    it('setSubRange가 동작해야 함', () => {
      const { result } = renderHook(() => useFilterManagement());

      const newRange = { min: 100, max: 10000 };
      act(() => {
        result.current.setSubRange(newRange);
      });

      expect(result.current.subRange).toEqual(newRange);
    });

    it('setDurationRange가 동작해야 함', () => {
      const { result } = renderHook(() => useFilterManagement());

      const newRange = { min: 60, max: 600 };
      act(() => {
        result.current.setDurationRange(newRange);
      });

      expect(result.current.durationRange).toEqual(newRange);
    });

    it('setIsFilterExpanded가 동작해야 함', () => {
      const { result } = renderHook(() => useFilterManagement());

      act(() => {
        result.current.setIsFilterExpanded(false);
      });

      expect(result.current.isFilterExpanded).toBe(false);
    });
  });

  describe('toggleCategory', () => {
    it('카테고리를 추가해야 함', () => {
      const { result } = renderHook(() => useFilterManagement());

      act(() => {
        result.current.toggleCategory('20');
      });

      expect(result.current.selectedCategories).toContain('20');
    });

    it('이미 선택된 카테고리를 제거해야 함', () => {
      const { result } = renderHook(() => useFilterManagement());

      act(() => {
        result.current.toggleCategory('20');
      });

      expect(result.current.selectedCategories).toContain('20');

      act(() => {
        result.current.toggleCategory('20');
      });

      expect(result.current.selectedCategories).not.toContain('20');
    });

    it('여러 카테고리를 토글할 수 있어야 함', () => {
      const { result } = renderHook(() => useFilterManagement());

      act(() => {
        result.current.toggleCategory('20');
        result.current.toggleCategory('22');
        result.current.toggleCategory('24');
      });

      expect(result.current.selectedCategories).toEqual(['20', '22', '24']);

      act(() => {
        result.current.toggleCategory('22');
      });

      expect(result.current.selectedCategories).toEqual(['20', '24']);
    });
  });

  describe('resetFilters', () => {
    it('모든 필터를 기본값으로 초기화해야 함', () => {
      const { result } = renderHook(() => useFilterManagement());

      // 필터 변경
      act(() => {
        result.current.setVideoType('short');
        result.current.setDateFilter('week');
        result.current.setSortBy('vph');
        result.current.setTitleQuery('검색어');
        result.current.setSelectedModel('claude');
        result.current.toggleCategory('20');
      });

      expect(result.current.videoType).toBe('short');
      expect(result.current.selectedCategories).toHaveLength(1);

      // 초기화
      act(() => {
        result.current.resetFilters();
      });

      expect(result.current.viewRange).toEqual(defaultViewRange);
      expect(result.current.subRange).toEqual(defaultSubRange);
      expect(result.current.durationRange).toEqual(defaultDurationRange);
      expect(result.current.videoType).toBe('all');
      expect(result.current.dateFilter).toBe('any');
      expect(result.current.sortBy).toBe('views');
      expect(result.current.selectedCategories).toEqual([]);
      expect(result.current.titleQuery).toBe('');
      expect(result.current.selectedModel).toBe('chatgpt');
    });
  });

  describe('selectedModel 유효성 검사', () => {
    it('유효한 모델만 허용해야 함', () => {
      const savedFilters = {
        selectedModel: 'invalid_model',
      };

      localStorageMock.getItem.mockReturnValue(JSON.stringify(savedFilters));

      const { result } = renderHook(() => useFilterManagement());

      // 유효하지 않은 모델은 기본값으로 대체
      expect(result.current.selectedModel).toBe('chatgpt');
    });

    it('gemini 모델이 허용되어야 함', () => {
      const savedFilters = {
        selectedModel: 'gemini',
      };

      localStorageMock.getItem.mockReturnValue(JSON.stringify(savedFilters));

      const { result } = renderHook(() => useFilterManagement());

      expect(result.current.selectedModel).toBe('gemini');
    });

    it('grok 모델이 허용되어야 함', () => {
      const savedFilters = {
        selectedModel: 'grok',
      };

      localStorageMock.getItem.mockReturnValue(JSON.stringify(savedFilters));

      const { result } = renderHook(() => useFilterManagement());

      expect(result.current.selectedModel).toBe('grok');
    });
  });

  describe('isFilterExpanded', () => {
    it('기본값은 true여야 함', () => {
      const { result } = renderHook(() => useFilterManagement());

      expect(result.current.isFilterExpanded).toBe(true);
    });

    it('localStorage에서 false를 복원해야 함', () => {
      const savedFilters = {
        isFilterExpanded: false,
      };

      localStorageMock.getItem.mockReturnValue(JSON.stringify(savedFilters));

      const { result } = renderHook(() => useFilterManagement());

      expect(result.current.isFilterExpanded).toBe(false);
    });
  });
});
