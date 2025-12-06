/**
 * usePagination hook 테스트
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { usePagination } from '@/hooks/usePagination';

describe('usePagination', () => {
  const mockFetchFunction = jest.fn();

  beforeEach(() => {
    mockFetchFunction.mockReset();
  });

  it('초기 상태가 올바르게 설정되어야 함', () => {
    mockFetchFunction.mockResolvedValue({
      items: [],
      total: 0,
      hasMore: false,
    });

    const { result } = renderHook(() =>
      usePagination({
        fetchFunction: mockFetchFunction,
      })
    );

    expect(result.current.items).toEqual([]);
    expect(result.current.offset).toBe(0);
    expect(result.current.total).toBe(0);
    expect(result.current.hasMore).toBe(false);
    expect(result.current.isLoading).toBe(false);
  });

  it('fetchItems를 호출하면 데이터를 가져와야 함', async () => {
    const mockItems = [
      { id: 1, name: 'Item 1' },
      { id: 2, name: 'Item 2' },
    ];

    mockFetchFunction.mockResolvedValue({
      items: mockItems,
      total: 10,
      hasMore: true,
    });

    const { result } = renderHook(() =>
      usePagination({
        fetchFunction: mockFetchFunction,
        limit: 2,
      })
    );

    await act(async () => {
      await result.current.fetchItems(true);
    });

    expect(result.current.items).toEqual(mockItems);
    expect(result.current.total).toBe(10);
    expect(result.current.hasMore).toBe(true);
    expect(mockFetchFunction).toHaveBeenCalledWith(0, 2);
  });

  it('loadMore를 호출하면 추가 데이터를 가져와야 함', async () => {
    const firstPage = [
      { id: 1, name: 'Item 1' },
      { id: 2, name: 'Item 2' },
    ];
    const secondPage = [
      { id: 3, name: 'Item 3' },
      { id: 4, name: 'Item 4' },
    ];

    mockFetchFunction
      .mockResolvedValueOnce({
        items: firstPage,
        total: 10,
        hasMore: true,
      })
      .mockResolvedValueOnce({
        items: secondPage,
        total: 10,
        hasMore: true,
      });

    const { result } = renderHook(() =>
      usePagination({
        fetchFunction: mockFetchFunction,
        limit: 2,
      })
    );

    // 첫 번째 페이지 로드
    await act(async () => {
      await result.current.fetchItems(true);
    });

    expect(result.current.items).toHaveLength(2);

    // 두 번째 페이지 로드
    await act(async () => {
      result.current.loadMore();
    });

    await waitFor(() => {
      expect(result.current.items).toHaveLength(4);
    });
  });

  it('중복 아이템을 제거해야 함', async () => {
    const firstPage = [
      { id: 1, name: 'Item 1' },
      { id: 2, name: 'Item 2' },
    ];
    const secondPage = [
      { id: 2, name: 'Item 2' }, // 중복
      { id: 3, name: 'Item 3' },
    ];

    mockFetchFunction
      .mockResolvedValueOnce({
        items: firstPage,
        total: 10,
        hasMore: true,
      })
      .mockResolvedValueOnce({
        items: secondPage,
        total: 10,
        hasMore: false,
      });

    const { result } = renderHook(() =>
      usePagination({
        fetchFunction: mockFetchFunction,
        limit: 2,
      })
    );

    await act(async () => {
      await result.current.fetchItems(true);
    });

    await act(async () => {
      result.current.loadMore();
    });

    await waitFor(() => {
      expect(result.current.items).toHaveLength(3);
      const ids = result.current.items.map((item: any) => item.id);
      expect(ids).toEqual([1, 2, 3]);
    });
  });

  it('reset을 호출하면 상태가 초기화되어야 함', async () => {
    const mockItems = [
      { id: 1, name: 'Item 1' },
      { id: 2, name: 'Item 2' },
    ];

    mockFetchFunction.mockResolvedValue({
      items: mockItems,
      total: 10,
      hasMore: true,
    });

    const { result } = renderHook(() =>
      usePagination({
        fetchFunction: mockFetchFunction,
        limit: 2,
      })
    );

    await act(async () => {
      await result.current.fetchItems(true);
    });

    expect(result.current.items).toHaveLength(2);

    mockFetchFunction.mockResolvedValue({
      items: [{ id: 10, name: 'Reset Item' }],
      total: 1,
      hasMore: false,
    });

    await act(async () => {
      result.current.reset();
    });

    await waitFor(() => {
      expect(result.current.items).toHaveLength(1);
      expect(result.current.items[0].id).toBe(10);
    });
  });

  it('hasMore가 false면 loadMore가 동작하지 않아야 함', async () => {
    mockFetchFunction.mockResolvedValue({
      items: [{ id: 1 }],
      total: 1,
      hasMore: false,
    });

    const { result } = renderHook(() =>
      usePagination({
        fetchFunction: mockFetchFunction,
      })
    );

    await act(async () => {
      await result.current.fetchItems(true);
    });

    const callCountAfterFetch = mockFetchFunction.mock.calls.length;

    act(() => {
      result.current.loadMore();
    });

    // loadMore가 fetchFunction을 호출하지 않아야 함
    expect(mockFetchFunction.mock.calls.length).toBe(callCountAfterFetch);
  });

  it('에러 발생 시 onError 콜백이 호출되어야 함', async () => {
    const mockError = new Error('Fetch failed');
    mockFetchFunction.mockRejectedValue(mockError);

    const onError = jest.fn();

    const { result } = renderHook(() =>
      usePagination({
        fetchFunction: mockFetchFunction,
        onError,
      })
    );

    await act(async () => {
      await result.current.fetchItems(true);
    });

    expect(onError).toHaveBeenCalledWith(mockError);
  });

  it('로딩 중에는 loadMore가 동작하지 않아야 함', async () => {
    let resolvePromise: (value: any) => void;
    const slowFetch = new Promise((resolve) => {
      resolvePromise = resolve;
    });

    mockFetchFunction.mockReturnValue(slowFetch);

    const { result } = renderHook(() =>
      usePagination({
        fetchFunction: mockFetchFunction,
      })
    );

    // fetchItems 시작 (아직 완료 안 됨)
    act(() => {
      result.current.fetchItems(true);
    });

    expect(result.current.isLoading).toBe(true);

    // 로딩 중에 loadMore 시도
    act(() => {
      result.current.loadMore();
    });

    // fetchFunction이 한 번만 호출되어야 함
    expect(mockFetchFunction.mock.calls.length).toBe(1);

    // 완료
    await act(async () => {
      resolvePromise!({ items: [], total: 0, hasMore: false });
    });
  });

  it('기본 limit이 50이어야 함', async () => {
    mockFetchFunction.mockResolvedValue({
      items: [],
      total: 0,
      hasMore: false,
    });

    const { result } = renderHook(() =>
      usePagination({
        fetchFunction: mockFetchFunction,
      })
    );

    await act(async () => {
      await result.current.fetchItems(true);
    });

    expect(mockFetchFunction).toHaveBeenCalledWith(0, 50);
  });

  it('setItems를 사용하여 직접 items를 설정할 수 있어야 함', () => {
    mockFetchFunction.mockResolvedValue({
      items: [],
      total: 0,
      hasMore: false,
    });

    const { result } = renderHook(() =>
      usePagination({
        fetchFunction: mockFetchFunction,
      })
    );

    act(() => {
      result.current.setItems([{ id: 100, name: 'Direct Item' }]);
    });

    expect(result.current.items).toEqual([{ id: 100, name: 'Direct Item' }]);
  });
});
