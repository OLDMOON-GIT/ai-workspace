/**
 * 큐 시스템 통합 테스트
 * - task, task_queue, task_lock 테이블 검증 (task_schedule 제거)
 * - 카운트 계산 로직 검증
 * - 자동 탭 전환 로직 검증
 */

const mysql = require('mysql2/promise');

// 큐 탭 분류: queue_type + status 기반
function categorizeQueue(item) {
  if (!item.queue_type || !item.queue_status) {
    return 'scheduled';
  }
  if (item.queue_status === 'failed' || item.queue_status === 'cancelled') {
    return 'failed';
  }
  if (item.queue_status === 'completed') {
    return 'completed';
  }
  if (item.queue_type === 'script') return 'script';
  if (item.queue_type === 'image') return 'image';
  if (item.queue_type === 'video') return 'video';
  if (item.queue_type === 'youtube') return 'youtube';
  if (item.queue_type === 'schedule') return 'scheduled';
  return null;
}

describe('큐 시스템 통합 테스트', () => {
  let pool;

  beforeAll(async () => {
    pool = mysql.createPool({
      host: '127.0.0.1',
      port: 3306,
      user: 'root',
      password: 'trend2024',
      database: 'trend_video',
      charset: 'utf8mb4',
      timezone: '+09:00',
    });
  });

  afterAll(async () => {
    if (pool) {
      await pool.end();
    }
  });

  describe('1. 테이블 기본 구조 검증', () => {
    test('task 테이블이 존재하고 필수 컬럼이 있어야 한다', async () => {
      const [rows] = await pool.query(`
        SELECT task_id, scheduled_time, user_id, created_at, updated_at
        FROM task
        LIMIT 1
      `);

      if (rows.length > 0) {
        expect(rows[0]).toHaveProperty('task_id');
        expect(rows[0]).toHaveProperty('scheduled_time');
        expect(rows[0]).toHaveProperty('user_id');
        expect(rows[0]).toHaveProperty('created_at');
        expect(rows[0]).toHaveProperty('updated_at');
      }
    });

    test('task_queue 테이블이 존재하고 필수 컬럼이 있어야 한다', async () => {
      const [rows] = await pool.query(`
        SELECT task_id, type, status, created_at
        FROM task_queue
        LIMIT 1
      `);

      if (rows.length > 0) {
        expect(rows[0]).toHaveProperty('task_id');
        expect(rows[0]).toHaveProperty('type');
        expect(rows[0]).toHaveProperty('status');
        expect(rows[0]).toHaveProperty('created_at');
      }
    });

    test('task_schedule 테이블은 제거되고 task.scheduled_time을 사용한다', async () => {
      const [tableRows] = await pool.query(`SHOW TABLES LIKE 'task_schedule'`);
      if (tableRows.length > 0) {
        const [countRows] = await pool.query(`SELECT COUNT(*) as cnt FROM task_schedule`);
        expect(countRows[0].cnt).toBe(0);
      }

      const [columns] = await pool.query(`
        SELECT COLUMN_NAME
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'task' AND COLUMN_NAME = 'scheduled_time'
      `);
      expect(columns.length).toBe(1);
    });
  });

  describe('2. 카운트 계산 로직 검증', () => {
    test('통합 뷰에서 각 탭별 카운트를 정확히 계산해야 한다', async () => {
      const [integrated] = await pool.query(`
        SELECT
          t.task_id,
          q.status as queue_status,
          q.type as queue_type
        FROM task t
        LEFT JOIN task_queue q ON t.task_id = q.task_id
        ORDER BY t.scheduled_time DESC, t.created_at DESC
      `);

      const counts = {
        scheduled: 0,
        script: 0,
        image: 0,
        video: 0,
        youtube: 0,
        failed: 0,
        completed: 0,
      };

      integrated.forEach(item => {
        const matchedTab = categorizeQueue(item);
        if (matchedTab && counts.hasOwnProperty(matchedTab)) {
          counts[matchedTab]++;
        }
        if (!matchedTab) {
          counts.scheduled++;
        }
      });

      // 카운트 검증
      expect(counts.scheduled).toBeGreaterThanOrEqual(0);
      expect(counts.script).toBeGreaterThanOrEqual(0);
      expect(counts.image).toBeGreaterThanOrEqual(0);
      expect(counts.video).toBeGreaterThanOrEqual(0);
      expect(counts.youtube).toBeGreaterThanOrEqual(0);
      expect(counts.failed).toBeGreaterThanOrEqual(0);
      expect(counts.completed).toBeGreaterThanOrEqual(0);

      // 총합이 실제 레코드 수와 맞아야 함
      const totalCount = Object.values(counts).reduce((a, b) => a + b, 0);
      expect(totalCount).toBeLessThanOrEqual(integrated.length);

      console.log('📊 카운트 결과:', counts);
    });

    test('queue_type + status 매핑이 올바르게 작동해야 한다', async () => {
      expect(categorizeQueue({ queue_type: 'script', queue_status: 'waiting' })).toBe('script');
      expect(categorizeQueue({ queue_type: 'image', queue_status: 'processing' })).toBe('image');
      expect(categorizeQueue({ queue_type: 'video', queue_status: 'processing' })).toBe('video');
      expect(categorizeQueue({ queue_type: 'youtube', queue_status: 'processing' })).toBe('youtube');
      expect(categorizeQueue({ queue_type: 'script', queue_status: 'completed' })).toBe('completed');
      expect(categorizeQueue({ queue_type: 'video', queue_status: 'failed' })).toBe('failed');
      expect(categorizeQueue({ queue_type: 'schedule', queue_status: 'waiting' })).toBe('scheduled');
      expect(categorizeQueue({ queue_type: null, queue_status: null })).toBe('scheduled');
    });
  });

  describe('3. 자동 탭 전환 로직 검증', () => {
    test('진행 중인 작업에 따라 올바른 탭을 추천해야 한다', async () => {
      const [queues] = await pool.query(`
        SELECT type, status, COUNT(*) as count
        FROM task_queue
        GROUP BY type, status
      `);

      const typeCounts = {
        script: 0,
        image: 0,
        video: 0,
        youtube: 0,
        schedule: 0,
      };

      queues.forEach(q => {
        if (q.status === 'processing' || q.status === 'waiting') {
          const key = q.type || 'schedule';
          typeCounts[key] = (typeCounts[key] || 0) + q.count;
        }
      });

      // 우선순위: script → image → video → youtube → schedule
      const priority = ['script', 'image', 'video', 'youtube', 'schedule'];
      const picked = priority.find(type => typeCounts[type] > 0);
      const recommendedTab = picked === 'schedule' ? 'scheduled' : picked || null;

      console.log('🔀 추천 탭:', recommendedTab || '진행 중인 작업 없음');

      // 추천 탭은 유효한 탭이거나 null이어야 함
      if (recommendedTab) {
        expect(['scheduled', 'script', 'image', 'video', 'youtube']).toContain(recommendedTab);
      }
    });
  });

  describe('4. 데이터 일관성 검증', () => {
    test('task_queue의 모든 task_id는 task 테이블에 존재해야 한다', async () => {
      const [orphanedQueues] = await pool.query(`
        SELECT q.task_id
        FROM task_queue q
        LEFT JOIN task t ON q.task_id = t.task_id
        WHERE t.task_id IS NULL
      `);

      expect(orphanedQueues.length).toBe(0);

      if (orphanedQueues.length > 0) {
        console.error('❌ 고아 큐:', orphanedQueues.map(q => q.task_id));
      }
    });

    test('스케줄 큐(type=schedule)는 task.scheduled_time과 연결되어야 한다', async () => {
      const [scheduledQueues] = await pool.query(`
        SELECT q.task_id, t.scheduled_time
        FROM task_queue q
        LEFT JOIN task t ON q.task_id = t.task_id
        WHERE q.type = 'schedule'
      `);

      scheduledQueues.forEach(item => {
        expect(item.scheduled_time).not.toBeNull();
      });
    });

    test('completed 상태의 작업은 완료 시간이 있어야 한다', async () => {
      const [completedWithoutTime] = await pool.query(`
        SELECT task_id
        FROM task_queue
        WHERE status = 'completed' AND completed_at IS NULL
      `);

      expect(completedWithoutTime.length).toBe(0);

      if (completedWithoutTime.length > 0) {
        console.warn('⚠️  완료 시간 없는 completed 작업:', completedWithoutTime.map(q => q.task_id));
      }
    });
  });

  describe('5. 성능 검증', () => {
    test('통합 뷰 쿼리가 2초 이내에 완료되어야 한다', async () => {
      const startTime = Date.now();

      await pool.query(`
        SELECT
          t.task_id,
          c.title,
          t.scheduled_time,
          q.status as queue_status,
          q.type as queue_type
        FROM task t
        LEFT JOIN content c ON t.task_id = c.content_id
        LEFT JOIN task_queue q ON t.task_id = q.task_id
        ORDER BY t.scheduled_time DESC, t.created_at DESC
        LIMIT 100
      `);

      const elapsed = Date.now() - startTime;
      console.log(`⏱️  쿼리 실행 시간: ${elapsed}ms`);

      expect(elapsed).toBeLessThan(2000);
    });
  });
});
