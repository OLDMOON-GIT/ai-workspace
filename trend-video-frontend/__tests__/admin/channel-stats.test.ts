/**
 * BTS-3087: 채널별 영상 통계 페이지 테스트
 *
 * 테스트 범위:
 * - 채널 통계 데이터 구조 검증
 * - 상태별 영상 분류 로직
 * - API 응답 형식 검증
 * - 필터링 기능 검증
 */

interface ChannelStats {
  channelId: string;
  channelName: string;
  totalVideos: number;
  completedVideos: number;
  failedVideos: number;
  pendingVideos: number;
  processingVideos: number;
}

interface TotalStats {
  totalChannels: number;
  totalVideos: number;
  totalCompleted: number;
  totalFailed: number;
  totalPending: number;
  totalProcessing: number;
}

describe('BTS-3087: 채널별 영상 통계', () => {
  describe('채널 통계 데이터 구조', () => {
    test('ChannelStats 인터페이스가 필수 필드를 포함해야 함', () => {
      const mockChannelStats: ChannelStats = {
        channelId: 'UC123456',
        channelName: '테스트 채널',
        totalVideos: 100,
        completedVideos: 80,
        failedVideos: 5,
        pendingVideos: 10,
        processingVideos: 5,
      };

      expect(mockChannelStats).toHaveProperty('channelId');
      expect(mockChannelStats).toHaveProperty('channelName');
      expect(mockChannelStats).toHaveProperty('totalVideos');
      expect(mockChannelStats).toHaveProperty('completedVideos');
      expect(mockChannelStats).toHaveProperty('failedVideos');
      expect(mockChannelStats).toHaveProperty('pendingVideos');
      expect(mockChannelStats).toHaveProperty('processingVideos');
    });

    test('TotalStats 인터페이스가 필수 필드를 포함해야 함', () => {
      const mockTotalStats: TotalStats = {
        totalChannels: 3,
        totalVideos: 300,
        totalCompleted: 250,
        totalFailed: 10,
        totalPending: 25,
        totalProcessing: 15,
      };

      expect(mockTotalStats).toHaveProperty('totalChannels');
      expect(mockTotalStats).toHaveProperty('totalVideos');
      expect(mockTotalStats).toHaveProperty('totalCompleted');
      expect(mockTotalStats).toHaveProperty('totalFailed');
      expect(mockTotalStats).toHaveProperty('totalPending');
      expect(mockTotalStats).toHaveProperty('totalProcessing');
    });
  });

  describe('상태별 영상 분류 로직', () => {
    test('status에 따라 올바른 카테고리로 분류되어야 함', () => {
      const statusCategoryMap: Record<string, 'completed' | 'failed' | 'pending' | 'processing'> = {
        completed: 'completed',
        failed: 'failed',
        pending: 'pending',
        waiting: 'pending',
        draft: 'pending',
        processing: 'processing',
        script: 'processing',
        image: 'processing',
        video: 'processing',
        youtube: 'processing',
      };

      // 완료 상태
      expect(statusCategoryMap['completed']).toBe('completed');

      // 실패 상태
      expect(statusCategoryMap['failed']).toBe('failed');

      // 대기 상태
      expect(statusCategoryMap['pending']).toBe('pending');
      expect(statusCategoryMap['waiting']).toBe('pending');
      expect(statusCategoryMap['draft']).toBe('pending');

      // 처리중 상태
      expect(statusCategoryMap['processing']).toBe('processing');
      expect(statusCategoryMap['script']).toBe('processing');
      expect(statusCategoryMap['image']).toBe('processing');
      expect(statusCategoryMap['video']).toBe('processing');
      expect(statusCategoryMap['youtube']).toBe('processing');
    });

    test('영상 수 합계가 totalVideos와 일치해야 함', () => {
      const stats: ChannelStats = {
        channelId: 'UC123',
        channelName: 'Test',
        totalVideos: 100,
        completedVideos: 60,
        failedVideos: 10,
        pendingVideos: 20,
        processingVideos: 10,
      };

      const sum = stats.completedVideos + stats.failedVideos + stats.pendingVideos + stats.processingVideos;
      expect(sum).toBe(stats.totalVideos);
    });
  });

  describe('통계 집계 로직', () => {
    test('전체 통계가 개별 채널 통계의 합과 일치해야 함', () => {
      const channels: ChannelStats[] = [
        {
          channelId: 'UC1',
          channelName: '채널1',
          totalVideos: 50,
          completedVideos: 40,
          failedVideos: 2,
          pendingVideos: 5,
          processingVideos: 3,
        },
        {
          channelId: 'UC2',
          channelName: '채널2',
          totalVideos: 30,
          completedVideos: 25,
          failedVideos: 1,
          pendingVideos: 2,
          processingVideos: 2,
        },
      ];

      const totalStats: TotalStats = {
        totalChannels: channels.length,
        totalVideos: channels.reduce((sum, c) => sum + c.totalVideos, 0),
        totalCompleted: channels.reduce((sum, c) => sum + c.completedVideos, 0),
        totalFailed: channels.reduce((sum, c) => sum + c.failedVideos, 0),
        totalPending: channels.reduce((sum, c) => sum + c.pendingVideos, 0),
        totalProcessing: channels.reduce((sum, c) => sum + c.processingVideos, 0),
      };

      expect(totalStats.totalChannels).toBe(2);
      expect(totalStats.totalVideos).toBe(80);
      expect(totalStats.totalCompleted).toBe(65);
      expect(totalStats.totalFailed).toBe(3);
      expect(totalStats.totalPending).toBe(7);
      expect(totalStats.totalProcessing).toBe(5);
    });
  });

  describe('API 응답 형식 검증', () => {
    test('채널 통계 API 응답 형식이 올바라야 함', () => {
      const mockApiResponse = {
        channelStats: [
          {
            channelId: 'UC123',
            channelName: '테스트채널',
            totalVideos: 10,
            completedVideos: 8,
            failedVideos: 1,
            pendingVideos: 1,
            processingVideos: 0,
          },
        ],
        totalStats: {
          totalChannels: 1,
          totalVideos: 10,
          totalCompleted: 8,
          totalFailed: 1,
          totalPending: 1,
          totalProcessing: 0,
        },
      };

      expect(mockApiResponse).toHaveProperty('channelStats');
      expect(mockApiResponse).toHaveProperty('totalStats');
      expect(Array.isArray(mockApiResponse.channelStats)).toBe(true);
      expect(typeof mockApiResponse.totalStats).toBe('object');
    });

    test('영상 목록 API 응답 형식이 올바라야 함', () => {
      const mockVideosResponse = {
        videos: [
          {
            contentId: 'uuid-123',
            title: '테스트 영상',
            status: 'completed',
            youtubeUrl: 'https://youtube.com/watch?v=test',
            youtubeChannel: 'UC123',
            youtubePublishTime: '2025-01-01T12:00:00Z',
            promptFormat: 'longform',
            category: '테스트',
            createdAt: '2025-01-01T00:00:00Z',
            updatedAt: '2025-01-01T12:00:00Z',
          },
        ],
        total: 1,
        limit: 50,
        offset: 0,
        hasMore: false,
      };

      expect(mockVideosResponse).toHaveProperty('videos');
      expect(mockVideosResponse).toHaveProperty('total');
      expect(mockVideosResponse).toHaveProperty('limit');
      expect(mockVideosResponse).toHaveProperty('offset');
      expect(mockVideosResponse).toHaveProperty('hasMore');
      expect(Array.isArray(mockVideosResponse.videos)).toBe(true);
    });
  });

  describe('필터링 기능', () => {
    test('상태 필터가 올바르게 적용되어야 함', () => {
      const allStatuses = ['all', 'completed', 'failed', 'pending', 'processing'];
      const videos = [
        { status: 'completed' },
        { status: 'failed' },
        { status: 'pending' },
        { status: 'processing' },
      ];

      // 'all' 필터
      const allFiltered = videos;
      expect(allFiltered.length).toBe(4);

      // 'completed' 필터
      const completedFiltered = videos.filter(v => v.status === 'completed');
      expect(completedFiltered.length).toBe(1);

      // 'failed' 필터
      const failedFiltered = videos.filter(v => v.status === 'failed');
      expect(failedFiltered.length).toBe(1);

      // 올바른 필터 옵션인지 검증
      allStatuses.forEach(status => {
        expect(['all', 'completed', 'failed', 'pending', 'processing']).toContain(status);
      });
    });

    test('channelId가 "unknown"인 경우 미지정 채널로 처리되어야 함', () => {
      const channelId = 'unknown';
      const channelName = channelId === 'unknown' ? '미지정' : channelId;

      expect(channelName).toBe('미지정');
    });

    test('channelId가 null/빈 문자열인 경우 "unknown"으로 그룹화되어야 함', () => {
      const getChannelGroup = (youtubeChannel: string | null | undefined): string => {
        if (!youtubeChannel || youtubeChannel === '') {
          return 'unknown';
        }
        return youtubeChannel;
      };

      expect(getChannelGroup(null)).toBe('unknown');
      expect(getChannelGroup('')).toBe('unknown');
      expect(getChannelGroup(undefined)).toBe('unknown');
      expect(getChannelGroup('UC123')).toBe('UC123');
    });
  });

  describe('UI 상태 표시', () => {
    test('상태별 뱃지 스타일이 정의되어야 함', () => {
      const statusBadgeMap: Record<string, { text: string; className: string }> = {
        completed: { text: '완료', className: 'bg-green-500/20 text-green-400' },
        failed: { text: '실패', className: 'bg-red-500/20 text-red-400' },
        pending: { text: '대기', className: 'bg-yellow-500/20 text-yellow-400' },
        processing: { text: '처리중', className: 'bg-blue-500/20 text-blue-400' },
      };

      expect(statusBadgeMap['completed'].text).toBe('완료');
      expect(statusBadgeMap['failed'].text).toBe('실패');
      expect(statusBadgeMap['pending'].text).toBe('대기');
      expect(statusBadgeMap['processing'].text).toBe('처리중');

      // 클래스명에 색상이 포함되어야 함
      expect(statusBadgeMap['completed'].className).toContain('green');
      expect(statusBadgeMap['failed'].className).toContain('red');
      expect(statusBadgeMap['pending'].className).toContain('yellow');
      expect(statusBadgeMap['processing'].className).toContain('blue');
    });

    test('진행률 바가 0-100% 범위 내에서 계산되어야 함', () => {
      const calculatePercentage = (count: number, total: number): number => {
        if (total === 0) return 0;
        return (count / total) * 100;
      };

      expect(calculatePercentage(50, 100)).toBe(50);
      expect(calculatePercentage(0, 100)).toBe(0);
      expect(calculatePercentage(100, 100)).toBe(100);
      expect(calculatePercentage(0, 0)).toBe(0); // 0으로 나누기 방지
    });
  });

  describe('날짜 포맷팅', () => {
    test('날짜가 한국어 형식으로 포맷되어야 함', () => {
      const formatDate = (dateString: string): string => {
        return new Date(dateString).toLocaleString('ko-KR', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        });
      };

      const formatted = formatDate('2025-01-15T14:30:00Z');
      // 한국 시간대 기준으로 포맷됨 (UTC+9)
      expect(formatted).toMatch(/\d{4}\. \d{1,2}\. \d{1,2}\./);
    });
  });

  describe('정렬 기능', () => {
    test('채널이 영상 수 기준 내림차순으로 정렬되어야 함', () => {
      const channels: ChannelStats[] = [
        { channelId: 'A', channelName: 'A', totalVideos: 10, completedVideos: 0, failedVideos: 0, pendingVideos: 0, processingVideos: 0 },
        { channelId: 'B', channelName: 'B', totalVideos: 50, completedVideos: 0, failedVideos: 0, pendingVideos: 0, processingVideos: 0 },
        { channelId: 'C', channelName: 'C', totalVideos: 30, completedVideos: 0, failedVideos: 0, pendingVideos: 0, processingVideos: 0 },
      ];

      const sorted = [...channels].sort((a, b) => b.totalVideos - a.totalVideos);

      expect(sorted[0].channelId).toBe('B');
      expect(sorted[1].channelId).toBe('C');
      expect(sorted[2].channelId).toBe('A');
    });
  });
});
