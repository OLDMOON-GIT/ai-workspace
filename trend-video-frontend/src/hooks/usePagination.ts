/**
 * 페이지네이션 관리 훅
 */

import { useState, useCallback } from 'react';

interface UsePaginationOptions<T> {
  fetchFunction: (offset: number, limit: number) => Promise<{
    items: T[];
    total: number;
    hasMore: boolean;
  }>;
  limit?: number;
  onError?: (error: Error) => void;
}

export function usePagination<T>({
  fetchFunction,
  limit = 50,
  onError,
}: UsePaginationOptions<T>) {
  const [items, setItems] = useState<T[]>([]);
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const fetchItems = useCallback(
    async (reset = false) => {
      setIsLoading(true);
      try {
        const currentOffset = reset ? 0 : offset;
        const result = await fetchFunction(currentOffset, limit);

        if (reset) {
          setItems(result.items);
          setOffset(result.items.length); // 페이지 계산 오류 수정: 실제 가져온 아이템 수로 설정
        } else {
          // 중복 제거
          setItems((prev) => {
            const existingIds = new Set(prev.map((item: any) => item.id));
            const newItems = result.items.filter(
              (item: any) => !existingIds.has(item.id)
            );
            return [...prev, ...newItems];
          });
          setOffset((prev) => prev + result.items.length); // 페이지 계산 오류 수정: 실제 가져온 아이템 수로 증가
        }

        setTotal(result.total);
        setHasMore(result.hasMore);
      } catch (error) {
        console.error('Failed to fetch items:', error);
        if (onError) {
          onError(error as Error);
        }
      } finally {
        setIsLoading(false);
      }
    },
    [offset, limit, fetchFunction, onError]
  );

  const loadMore = useCallback(() => {
    if (!isLoading && hasMore) {
      fetchItems(false);
    }
  }, [isLoading, hasMore, fetchItems]);

  const reset = useCallback(() => {
    setItems([]);
    setOffset(0);
    setTotal(0);
    setHasMore(false);
    fetchItems(true);
  }, [fetchItems]);

  return {
    items,
    offset,
    total,
    hasMore,
    isLoading,
    fetchItems,
    loadMore,
    reset,
    setItems,
  };
}
