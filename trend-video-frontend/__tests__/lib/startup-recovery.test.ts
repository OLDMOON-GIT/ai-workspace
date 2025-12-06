/**
 * @jest-environment node
 */
import { recoverStaleProcessingJobs, recoverStaleJobsByTime } from '@/lib/startup-recovery';
import db from '@/lib/sqlite';

// Mock sqlite
jest.mock('@/lib/sqlite', () => ({
  __esModule: true,
  default: {
    prepare: jest.fn(),
  },
}));

describe('startup-recovery', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('recoverStaleProcessingJobs', () => {
    test('processing 상태의 content와 queue를 failed로 변경해야 함', async () => {
      const mockContents = [
        {
          content_id: 'test-id-1',
          title: 'Test Title 1',
          status: 'processing',
          updated_at: '2024-11-30 10:00:00',
        },
        {
          content_id: 'test-id-2',
          title: 'Test Title 2',
          status: 'processing',
          updated_at: '2024-11-30 11:00:00',
        },
      ];

      const mockQueues = [
        {
          task_id: 'test-id-1',
          type: 'script',
          status: 'processing',
          started_at: '2024-11-30 10:00:00',
        },
      ];

      const mockPrepare = {
        all: jest.fn()
          .mockResolvedValueOnce(mockContents) // content 조회
          .mockResolvedValueOnce(mockQueues),  // task_queue 조회
        run: jest.fn()
          .mockResolvedValueOnce({ changes: mockContents.length }) // content 업데이트
          .mockResolvedValueOnce({ changes: mockQueues.length }),  // task_queue 업데이트
      };

      (db.prepare as jest.Mock).mockReturnValue(mockPrepare);

      const result = await recoverStaleProcessingJobs();

      expect(result.contentRecovered).toBe(2);
      expect(result.queueRecovered).toBe(1);
      expect(result.scheduleRecovered).toBe(0);
      expect(result.recoveredIds).toContain('test-id-1');
      expect(result.recoveredIds).toContain('test-id-2');
    });

    test('복구할 작업이 없으면 빈 결과를 반환해야 함', async () => {
      const mockPrepare = {
        all: jest.fn()
          .mockResolvedValueOnce([]) // content 없음
          .mockResolvedValueOnce([]), // task_queue 없음
        run: jest.fn(),
      };

      (db.prepare as jest.Mock).mockReturnValue(mockPrepare);

      const result = await recoverStaleProcessingJobs();

      expect(result.contentRecovered).toBe(0);
      expect(result.queueRecovered).toBe(0);
      expect(result.recoveredIds).toHaveLength(0);
    });

    test('task_queue 테이블이 없어도 에러 없이 동작해야 함', async () => {
      const mockContents = [
        {
          content_id: 'test-id-1',
          title: 'Test Title',
          status: 'processing',
          updated_at: '2024-11-30 10:00:00',
        },
      ];

      const mockPrepare = {
        all: jest.fn()
          .mockResolvedValueOnce(mockContents) // content 조회
          .mockRejectedValueOnce(new Error('no such table: task_queue')), // task_queue 에러
        run: jest.fn()
          .mockResolvedValueOnce({ changes: 1 }), // content 업데이트
      };

      (db.prepare as jest.Mock).mockReturnValue(mockPrepare);

      const result = await recoverStaleProcessingJobs();

      expect(result.contentRecovered).toBe(1);
      expect(result.queueRecovered).toBe(0);
      expect(result.recoveredIds).toContain('test-id-1');
    });
  });

  describe('recoverStaleJobsByTime', () => {
    test('지정된 시간 이상 processing 상태인 작업을 복구해야 함', async () => {
      const mockContents = [
        {
          content_id: 'stale-id-1',
          title: 'Stale Task',
          updated_at: '2024-11-30 09:00:00',
        },
      ];

      const mockPrepare = {
        all: jest.fn().mockResolvedValueOnce(mockContents),
        run: jest.fn()
          .mockResolvedValueOnce({ changes: 1 }) // content 업데이트
          .mockResolvedValueOnce({ changes: 1 }), // task_queue 업데이트
      };

      (db.prepare as jest.Mock).mockReturnValue(mockPrepare);

      const result = await recoverStaleJobsByTime(30);

      expect(result.contentRecovered).toBe(1);
      expect(result.recoveredIds).toContain('stale-id-1');
      expect(mockPrepare.all).toHaveBeenCalledWith(expect.any(String));
    });

    test('기본값 30분으로 동작해야 함', async () => {
      const mockPrepare = {
        all: jest.fn().mockResolvedValueOnce([]),
        run: jest.fn()
          .mockResolvedValueOnce({ changes: 0 })
          .mockResolvedValueOnce({ changes: 0 }),
      };

      (db.prepare as jest.Mock).mockReturnValue(mockPrepare);

      const result = await recoverStaleJobsByTime();

      expect(result.contentRecovered).toBe(0);
      expect(mockPrepare.all).toHaveBeenCalled();
    });

    test('사용자 지정 threshold로 동작해야 함', async () => {
      const mockPrepare = {
        all: jest.fn().mockResolvedValueOnce([]),
        run: jest.fn()
          .mockResolvedValueOnce({ changes: 0 })
          .mockResolvedValueOnce({ changes: 0 }),
      };

      (db.prepare as jest.Mock).mockReturnValue(mockPrepare);

      const result = await recoverStaleJobsByTime(60);

      expect(result.contentRecovered).toBe(0);
      expect(mockPrepare.all).toHaveBeenCalled();
    });
  });
});
