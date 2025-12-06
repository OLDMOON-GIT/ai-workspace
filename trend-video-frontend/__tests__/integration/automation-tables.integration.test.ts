/**
 * 자동화 테이블 통합 테스트
 *
 * 테이블 관계:
 * ┌─────────────────────────────────────────────────────────────┐
 * │                    테이블 관계도                              │
 * ├─────────────────────────────────────────────────────────────┤
 * │                                                             │
 * │    task (작업 설정)                                          │
 * │    ├── id (PK)                                              │
 * │    ├── title, type, category, channel, model                │
 * │    ├── product_info (JSON)                                  │
 * │    └── user_id (FK → user)                                  │
 * │         │                                                   │
 * │         ├─────────────────────────────────┬─────┐          │
 * │         │                                 │     │          │
 * │         ▼                                 ▼     ▼          │
 * │    task (스케줄 포함)               task_queue  content    │
 * │    ├── scheduled_time               ├── task_id ├── content_id│
 * │    ├── youtube_publish_time         ├── type     │   = task_id│
 * │    └── youtube_privacy              ├── status   ├── type     │
 * │                                      └── error    │ (script/  │
 * │                                                  │  video)   │
 * │                                              ├── product_info│
 * │                                              └── category    │
 * │                                                             │
 * │  ID 통일 규칙: task.id = content.content_id = task_queue.task_id │
 * └─────────────────────────────────────────────────────────────┘
 *
 * 상태 관리:
 * - task_queue.type: 'script' → 'image' → 'video' → 'youtube' (단계)
 * - task_queue.status: 'waiting' → 'processing' → 'completed' | 'failed'
 * - content.status: 'pending' → 'processing' → 'completed' | 'failed'
 */

import Database from 'better-sqlite3';
import crypto from 'crypto';

// 테스트용 DB (인메모리)
let db: Database.Database;

// 테이블 스키마 생성
function createTestSchema(db: Database.Database) {
  // task 테이블
  db.exec(`
    CREATE TABLE IF NOT EXISTS task (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('shortform', 'longform', 'product', 'product-info', 'sora2')),
      status TEXT DEFAULT 'draft' CHECK(status IN ('draft', 'active', 'completed', 'archived')),
      user_id TEXT NOT NULL,
      product_info TEXT,
      category TEXT,
      channel TEXT,
      script_mode TEXT,
      media_mode TEXT,
      model TEXT,
      scheduled_time DATETIME,
      youtube_publish_time DATETIME,
      youtube_privacy TEXT DEFAULT 'public',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // task_queue 테이블 (상태 관리!)
  db.exec(`
    CREATE TABLE IF NOT EXISTS task_queue (
      task_id TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('schedule', 'script', 'image', 'video', 'youtube')),
      status TEXT NOT NULL CHECK(status IN ('waiting', 'processing', 'completed', 'failed')),
      priority INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      started_at TEXT,
      completed_at TEXT,
      user_id TEXT NOT NULL,
      error TEXT,
      retry_count INTEGER DEFAULT 0,
      max_retries INTEGER DEFAULT 3,
      PRIMARY KEY (task_id, type)
    )
  `);

  // content 테이블
  db.exec(`
    CREATE TABLE IF NOT EXISTS content (
      content_id TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('script', 'video')),
      user_id TEXT NOT NULL,
      format TEXT,
      title TEXT NOT NULL,
      content TEXT,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'processing', 'completed', 'failed')),
      progress INTEGER DEFAULT 0,
      error TEXT,
      task_id TEXT,
      product_info TEXT,
      category TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (content_id, type)
    )
  `);
}

// 헬퍼 함수들
function createTask(data: {
  id?: string;
  title: string;
  type: string;
  userId: string;
  productInfo?: any;
  category?: string;
  channel?: string;
  model?: string;
  scheduledTime?: string;
  youtubePublishTime?: string;
  youtubePrivacy?: string;
}) {
  const id = data.id || crypto.randomUUID();
  const productInfoJson = data.productInfo ? JSON.stringify(data.productInfo) : null;

  db.prepare(`
    INSERT INTO task (id, title, type, user_id, product_info, category, channel, model, status, scheduled_time, youtube_publish_time, youtube_privacy)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)
  `).run(
    id,
    data.title,
    data.type,
    data.userId,
    productInfoJson,
    data.category || null,
    data.channel || null,
    data.model || null,
    data.scheduledTime || null,
    data.youtubePublishTime || null,
    data.youtubePrivacy || 'public'
  );

  return id;
}

function createQueueEntry(data: {
  taskId: string;
  type: 'schedule' | 'script' | 'image' | 'video' | 'youtube';
  userId: string;
  status?: string;
}) {
  db.prepare(`
    INSERT INTO task_queue (task_id, type, status, user_id, created_at)
    VALUES (?, ?, ?, ?, datetime('now'))
  `).run(data.taskId, data.type, data.status || 'waiting', data.userId);
}

function updateQueueStatus(taskId: string, type: string, status: string, error?: string) {
  if (error) {
    db.prepare(`
      UPDATE task_queue SET status = ?, error = ?, started_at = datetime('now')
      WHERE task_id = ? AND type = ?
    `).run(status, error, taskId, type);
  } else {
    db.prepare(`
      UPDATE task_queue SET status = ?, started_at = datetime('now')
      WHERE task_id = ? AND type = ?
    `).run(status, taskId, type);
  }
}

function createContent(data: {
  contentId: string;  // = taskId
  type: 'script' | 'video';
  userId: string;
  title: string;
  taskId: string;
  productInfo?: any;
  category?: string;
  format?: string;
}) {
  const productInfoJson = data.productInfo ? JSON.stringify(data.productInfo) : null;
  // productInfo가 있으면 category는 자동으로 '상품'
  const category = data.productInfo ? '상품' : (data.category || null);

  db.prepare(`
    INSERT INTO content (content_id, type, user_id, title, task_id, product_info, category, format, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')
  `).run(data.contentId, data.type, data.userId, data.title, data.taskId, productInfoJson, category, data.format || null);
}

function getQueueStatus(taskId: string, type: string) {
  return db.prepare(`
    SELECT * FROM task_queue WHERE task_id = ? AND type = ?
  `).get(taskId, type) as any;
}

function getContent(contentId: string, type: string) {
  return db.prepare(`
    SELECT * FROM content WHERE content_id = ? AND type = ?
  `).get(contentId, type) as any;
}

function getTask(taskId: string) {
  return db.prepare(`SELECT * FROM task WHERE id = ?`).get(taskId) as any;
}

// ============================================================
// 테스트 시작
// ============================================================

describe('테이블 관계 통합 테스트', () => {
  beforeAll(() => {
    // 인메모리 DB 생성
    db = new Database(':memory:');
    createTestSchema(db);
  });

  afterAll(() => {
    db.close();
  });

  beforeEach(() => {
    // 각 테스트 전 데이터 초기화
    db.exec('DELETE FROM content');
    db.exec('DELETE FROM task_queue');
    db.exec('DELETE FROM task');
  });

  describe('1. 기본 테이블 관계', () => {
    test('task.scheduled_time → task_queue 연결', () => {
      const userId = 'test-user-1';

      // 1. task 생성
      const taskId = createTask({
        title: '테스트 영상',
        type: 'shortform',
        userId,
        category: '일반',
        scheduledTime: new Date().toISOString()
      });

      // 2. queue entry 생성 (상태 관리)
      createQueueEntry({
        taskId,
        type: 'schedule',
        userId,
        status: 'waiting'
      });

      // 검증
      const task = getTask(taskId);
      const queue = getQueueStatus(taskId, 'schedule');

      expect(task).toBeDefined();
      expect(task.title).toBe('테스트 영상');
      expect(task.scheduled_time).toBeTruthy();
      expect(queue).toBeDefined();
      expect(queue.status).toBe('waiting');
    });

    test('task_id = content.content_id 규칙', () => {
      const userId = 'test-user-2';

      // 1. task 생성
      const taskId = createTask({
        title: '대본 테스트',
        type: 'longform',
        userId
      });

      // 2. content 생성 (content_id = task_id)
      createContent({
        contentId: taskId,  // 동일한 ID 사용!
        type: 'script',
        userId,
        title: '대본 테스트',
        taskId
      });

      // 검증
      const content = getContent(taskId, 'script');

      expect(content).toBeDefined();
      expect(content.content_id).toBe(taskId);
      expect(content.task_id).toBe(taskId);
    });
  });

  describe('2. product_info 전달 흐름', () => {
    test('task.product_info → content.product_info 전달', () => {
      const userId = 'test-user-3';
      const productInfo = {
        title: '테스트 상품',
        thumbnail: 'https://example.com/thumb.jpg',
        product_link: 'https://link.coupang.com/a/test',
        description: '상품 설명'
      };

      // 1. task 생성 (product_info 포함)
      const taskId = createTask({
        title: productInfo.title,
        type: 'product',
        userId,
        productInfo,
        category: '상품'
      });

      // 2. content 생성 시 product_info 전달
      createContent({
        contentId: taskId,
        type: 'script',
        userId,
        title: productInfo.title,
        taskId,
        productInfo,  // task에서 전달받은 것
        format: 'product'
      });

      // 검증
      const task = getTask(taskId);
      const content = getContent(taskId, 'script');

      expect(task.product_info).toBeDefined();
      expect(content.product_info).toBeDefined();

      const taskProductInfo = JSON.parse(task.product_info);
      const contentProductInfo = JSON.parse(content.product_info);

      expect(taskProductInfo.product_link).toBe(productInfo.product_link);
      expect(contentProductInfo.product_link).toBe(productInfo.product_link);
      expect(contentProductInfo.thumbnail).toBe(productInfo.thumbnail);
    });

    test('product_info가 있으면 category는 자동으로 "상품"', () => {
      const userId = 'test-user-4';
      const productInfo = {
        product_link: 'https://link.coupang.com/a/test'
      };

      const taskId = createTask({
        title: '상품 테스트',
        type: 'product',
        userId,
        productInfo
        // category 미지정
      });

      createContent({
        contentId: taskId,
        type: 'script',
        userId,
        title: '상품 테스트',
        taskId,
        productInfo
        // category 미지정 - 자동으로 '상품'이 되어야 함
      });

      const content = getContent(taskId, 'script');
      expect(content.category).toBe('상품');
    });
  });

  describe('3. 상태 관리 (task_queue)', () => {
    test('단계별 상태 전이: waiting → processing → completed', () => {
      const userId = 'test-user-5';
      const taskId = createTask({
        title: '상태 테스트',
        type: 'shortform',
        userId
      });

      // schedule queue 생성
      createQueueEntry({ taskId, type: 'schedule', userId, status: 'waiting' });

      // 상태 전이
      updateQueueStatus(taskId, 'schedule', 'processing');
      let queue = getQueueStatus(taskId, 'schedule');
      expect(queue.status).toBe('processing');

      updateQueueStatus(taskId, 'schedule', 'completed');
      queue = getQueueStatus(taskId, 'schedule');
      expect(queue.status).toBe('completed');
    });

    test('실패 시 에러 저장', () => {
      const userId = 'test-user-6';
      const taskId = createTask({
        title: '에러 테스트',
        type: 'shortform',
        userId
      });

      createQueueEntry({ taskId, type: 'script', userId });
      updateQueueStatus(taskId, 'script', 'failed', 'API 호출 실패');

      const queue = getQueueStatus(taskId, 'script');
      expect(queue.status).toBe('failed');
      expect(queue.error).toBe('API 호출 실패');
    });

    test('멀티 단계 큐 관리', () => {
      const userId = 'test-user-7';
      const taskId = createTask({
        title: '멀티 단계 테스트',
        type: 'shortform',
        userId
      });

      // 모든 단계 큐 생성
      const stages = ['schedule', 'script', 'image', 'video', 'youtube'] as const;
      stages.forEach(type => {
        createQueueEntry({ taskId, type, userId, status: 'waiting' });
      });

      // 순차적 처리 시뮬레이션
      for (const type of stages) {
        updateQueueStatus(taskId, type, 'processing');
        updateQueueStatus(taskId, type, 'completed');
      }

      // 모든 단계 완료 확인
      stages.forEach(type => {
        const queue = getQueueStatus(taskId, type);
        expect(queue.status).toBe('completed');
      });
    });
  });

  describe('4. 스케줄 메타 정보는 task 테이블에만 존재', () => {
    test('task.scheduled_time 컬럼만 사용하고 별도 task_schedule 테이블은 없음', () => {
      const taskColumns = db.prepare(`PRAGMA table_info(task)`).all() as any[];
      const columnNames = taskColumns.map(c => c.name);

      expect(columnNames).toContain('scheduled_time');
      expect(columnNames).toContain('youtube_publish_time');
      expect(columnNames).toContain('youtube_privacy');

      const scheduleTable = db
        .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'task_schedule'`)
        .get();
      expect(scheduleTable).toBeUndefined();
    });
  });

  describe('5. 전체 자동화 흐름 테스트', () => {
    test('task 생성 → schedule → queue → content 전체 흐름', () => {
      const userId = 'test-user-8';
      const productInfo = {
        title: '통합 테스트 상품',
        thumbnail: 'https://example.com/product.jpg',
        product_link: 'https://link.coupang.com/a/integrated'
      };

      // 1. Task 생성
      const taskId = createTask({
        title: productInfo.title,
        type: 'product',
        userId,
        productInfo,
        channel: 'test-channel',
        model: 'claude',
        scheduledTime: new Date().toISOString(),
        youtubePublishTime: new Date(Date.now() + 3600000).toISOString(),
        youtubePrivacy: 'private'
      });

      // 2. Queue entries 생성 (상태 관리)
      createQueueEntry({ taskId, type: 'schedule', userId, status: 'processing' });
      createQueueEntry({ taskId, type: 'script', userId, status: 'waiting' });

      // 3. Script 생성 시작
      updateQueueStatus(taskId, 'script', 'processing');

      // 4. Content 생성 (대본)
      createContent({
        contentId: taskId,  // task_id = content_id
        type: 'script',
        userId,
        title: productInfo.title,
        taskId,
        productInfo,
        format: 'product'
      });

      // 5. Script 완료
      updateQueueStatus(taskId, 'script', 'completed');

      // 검증
      const task = getTask(taskId);
      const content = getContent(taskId, 'script');
      const scheduleQueue = getQueueStatus(taskId, 'schedule');
      const scriptQueue = getQueueStatus(taskId, 'script');

      // Task 검증
      expect(task.type).toBe('product');
      expect(task.channel).toBe('test-channel');
      expect(task.scheduled_time).toBeTruthy();
      expect(task.youtube_privacy).toBe('private');
      expect(task.youtube_publish_time).toBeTruthy();

      // Product info 전달 검증
      const taskPI = JSON.parse(task.product_info);
      const contentPI = JSON.parse(content.product_info);
      expect(taskPI.product_link).toBe(contentPI.product_link);
      expect(contentPI.thumbnail).toBe(productInfo.thumbnail);

      // 상태 검증
      expect(scheduleQueue.status).toBe('processing');
      expect(scriptQueue.status).toBe('completed');

      // Category 자동 설정 검증
      expect(content.category).toBe('상품');
    });
  });

  describe('6. ID 통일 규칙 (UUID만, prefix 금지)', () => {
    test('task.id는 순수 UUID 형식이어야 함', () => {
      const userId = 'test-user-9';
      const taskId = crypto.randomUUID();

      // UUID 형식 검증
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      expect(taskId).toMatch(uuidRegex);

      // task_ prefix가 없어야 함
      expect(taskId.startsWith('task_')).toBe(false);
      expect(taskId.startsWith('project_')).toBe(false);

      createTask({
        id: taskId,
        title: 'UUID 테스트',
        type: 'shortform',
        userId
      });

      const task = getTask(taskId);
      expect(task.id).toBe(taskId);
      expect(task.id).toMatch(uuidRegex);
    });

    test('content.content_id = task.id (동일 UUID)', () => {
      const userId = 'test-user-10';
      const taskId = crypto.randomUUID();

      createTask({
        id: taskId,
        title: 'ID 통일 테스트',
        type: 'shortform',
        userId
      });

      createContent({
        contentId: taskId,
        type: 'script',
        userId,
        title: 'ID 통일 테스트',
        taskId
      });

      const task = getTask(taskId);
      const content = getContent(taskId, 'script');

      // 모든 ID가 동일해야 함
      expect(task.id).toBe(content.content_id);
      expect(task.id).toBe(content.task_id);
      expect(content.content_id).toBe(content.task_id);
    });

    test('task_queue.task_id도 동일한 UUID 사용', () => {
      const userId = 'test-user-11';
      const taskId = crypto.randomUUID();

      createTask({
        id: taskId,
        title: 'Queue ID 테스트',
        type: 'shortform',
        userId
      });

      createQueueEntry({ taskId, type: 'script', userId });

      const task = getTask(taskId);
      const queue = getQueueStatus(taskId, 'script');

      expect(queue.task_id).toBe(task.id);
    });
  });

  describe('7. 파일 경로 규칙', () => {
    test('파일 경로는 tasks/{UUID}/ 형식이어야 함', () => {
      const taskId = crypto.randomUUID();

      // 경로 생성 함수
      const getTaskFolder = (id: string) => `tasks/${id}`;
      const getStoryPath = (id: string) => `tasks/${id}/story.json`;
      const getVideoPath = (id: string) => `tasks/${id}/output.mp4`;
      const getThumbnailPath = (id: string) => `tasks/${id}/thumbnail.png`;

      // 경로 검증
      expect(getTaskFolder(taskId)).toBe(`tasks/${taskId}`);
      expect(getStoryPath(taskId)).toContain(taskId);
      expect(getVideoPath(taskId)).toContain(taskId);

      // task_ prefix가 경로에 없어야 함
      expect(getTaskFolder(taskId)).not.toContain('task_');
      expect(getStoryPath(taskId)).not.toContain('task_');
    });
  });

  describe('8. Content 타입별 테스트', () => {
    test('script와 video 두 개의 content 생성 가능 (동일 task_id)', () => {
      const userId = 'test-user-12';
      const taskId = crypto.randomUUID();

      createTask({
        id: taskId,
        title: '다중 콘텐츠 테스트',
        type: 'shortform',
        userId
      });

      // script content
      createContent({
        contentId: taskId,
        type: 'script',
        userId,
        title: '다중 콘텐츠 테스트',
        taskId
      });

      // video content (같은 content_id, 다른 type)
      createContent({
        contentId: taskId,
        type: 'video',
        userId,
        title: '다중 콘텐츠 테스트',
        taskId
      });

      const script = getContent(taskId, 'script');
      const video = getContent(taskId, 'video');

      expect(script).toBeDefined();
      expect(video).toBeDefined();
      expect(script.content_id).toBe(video.content_id);
      expect(script.type).toBe('script');
      expect(video.type).toBe('video');
    });
  });

  describe('9. 조인 쿼리 테스트', () => {
    test('task + task_queue 조인', () => {
      const userId = 'test-user-14';
      const taskId = crypto.randomUUID();

      createTask({
        id: taskId,
        title: '조인 테스트',
        type: 'product',
        userId,
        productInfo: { product_link: 'https://example.com' },
        scheduledTime: '2025-11-26T10:00:00Z',
        youtubePrivacy: 'unlisted'
      });

      createQueueEntry({ taskId, type: 'schedule', userId, status: 'waiting' });

      // 조인 쿼리
      const result = db.prepare(`
        SELECT
          t.id as task_id,
          t.title,
          t.type as task_type,
          t.product_info,
          t.scheduled_time,
          t.youtube_privacy,
          q.status as queue_status,
          q.type as queue_type
        FROM task t
        JOIN task_queue q ON t.id = q.task_id AND q.type = 'schedule'
        WHERE t.id = ?
      `).get(taskId) as any;

      expect(result).toBeDefined();
      expect(result.task_id).toBe(taskId);
      expect(result.title).toBe('조인 테스트');
      expect(result.task_type).toBe('product');
      expect(result.youtube_privacy).toBe('unlisted');
      expect(result.scheduled_time).toBe('2025-11-26T10:00:00Z');
      expect(result.queue_status).toBe('waiting');
      expect(result.queue_type).toBe('schedule');
    });

    test('task + content 조인', () => {
      const userId = 'test-user-15';
      const taskId = crypto.randomUUID();
      const productInfo = {
        title: '상품명',
        product_link: 'https://coupang.com/test'
      };

      createTask({
        id: taskId,
        title: productInfo.title,
        type: 'product',
        userId,
        productInfo
      });

      createContent({
        contentId: taskId,
        type: 'script',
        userId,
        title: productInfo.title,
        taskId,
        productInfo,
        format: 'product'
      });

      // 조인 쿼리
      const result = db.prepare(`
        SELECT
          t.id as task_id,
          t.title as task_title,
          t.product_info as task_product_info,
          c.content_id,
          c.type as content_type,
          c.product_info as content_product_info,
          c.category
        FROM task t
        JOIN content c ON t.id = c.content_id
        WHERE t.id = ? AND c.type = 'script'
      `).get(taskId) as any;

      expect(result).toBeDefined();
      expect(result.task_id).toBe(result.content_id);
      expect(result.category).toBe('상품');

      const taskPI = JSON.parse(result.task_product_info);
      const contentPI = JSON.parse(result.content_product_info);
      expect(taskPI.product_link).toBe(contentPI.product_link);
    });
  });

  describe('10. 에러 핸들링', () => {
    test('중복 PK 삽입 시 에러 발생', () => {
      const userId = 'test-user-16';
      const taskId = crypto.randomUUID();

      createTask({
        id: taskId,
        title: '중복 테스트',
        type: 'shortform',
        userId
      });

      // 동일 ID로 다시 생성 시도
      expect(() => {
        createTask({
          id: taskId,
          title: '중복 테스트 2',
          type: 'shortform',
          userId
        });
      }).toThrow();
    });

    test('content 중복 PK (content_id, type) 삽입 시 에러', () => {
      const userId = 'test-user-17';
      const taskId = crypto.randomUUID();

      createTask({
        id: taskId,
        title: 'Content 중복 테스트',
        type: 'shortform',
        userId
      });

      createContent({
        contentId: taskId,
        type: 'script',
        userId,
        title: 'Content 중복 테스트',
        taskId
      });

      // 동일 (content_id, type) 조합으로 다시 생성 시도
      expect(() => {
        createContent({
          contentId: taskId,
          type: 'script',  // 같은 type
          userId,
          title: 'Content 중복 테스트 2',
          taskId
        });
      }).toThrow();
    });

    test('task_queue 중복 PK (task_id, type) 삽입 시 에러', () => {
      const userId = 'test-user-18';
      const taskId = crypto.randomUUID();

      createTask({
        id: taskId,
        title: 'Queue 중복 테스트',
        type: 'shortform',
        userId
      });

      createQueueEntry({ taskId, type: 'script', userId });

      // 동일 (task_id, type) 조합으로 다시 생성 시도
      expect(() => {
        createQueueEntry({ taskId, type: 'script', userId });
      }).toThrow();
    });
  });
});

// 테스트 실행
if (require.main === module) {
  console.log('테이블 관계 통합 테스트 시작...');
}
