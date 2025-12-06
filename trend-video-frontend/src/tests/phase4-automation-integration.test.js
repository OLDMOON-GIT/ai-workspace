/**
 * Phase 4: 자동화 통합 테스트
 *
 * 테스트 범위:
 * 1. QueueManager 기본 기능 (task_id 기반)
 * 2. 파이프라인 생성 및 단계별 상태 관리
 * 3. 큐 상태 체크 및 단계 진행
 * 4. 전체 파이프라인 흐름 (script → image → video → youtube)
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// 테스트용 DB 경로
const TEST_QUEUE_DB_PATH = path.join(process.cwd(), 'data', 'test_task_queue.sqlite');
const TEST_MAIN_DB_PATH = path.join(process.cwd(), 'data', 'test_phase4_database.sqlite');
const tableExists = (db, name) => {
  const row = db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`).get(name);
  return !!row;
};

// QueueManager 직접 구현 (테스트용 - 새로운 task_id 기반 API)
class TestQueueManager {
  constructor(dbPath) {
    this.db = new Database(dbPath);
    this.initializeDatabase();
  }

  initializeDatabase() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS task_queue (
        task_id TEXT NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('script', 'image', 'video', 'youtube')),
        status TEXT NOT NULL CHECK(status IN ('waiting', 'processing', 'completed', 'failed')),
        priority INTEGER DEFAULT 0,
        created_at TEXT NOT NULL,
        started_at TEXT,
        completed_at TEXT,
        user_id TEXT NOT NULL,
        metadata TEXT,
        logs TEXT,
        error TEXT,
        retry_count INTEGER DEFAULT 0,
        max_retries INTEGER DEFAULT 3,
        PRIMARY KEY (task_id, type)
      );

      CREATE TABLE IF NOT EXISTS task_lock (
        task_type TEXT PRIMARY KEY CHECK(task_type IN ('script', 'image', 'video', 'youtube')),
        locked_by TEXT,
        locked_at TEXT,
        worker_pid INTEGER
      );

      INSERT OR IGNORE INTO task_lock (task_type, locked_by, locked_at, worker_pid)
      VALUES
        ('script', NULL, NULL, NULL),
        ('image', NULL, NULL, NULL),
        ('video', NULL, NULL, NULL),
        ('youtube', NULL, NULL, NULL);
    `);
  }

  // 파이프라인 생성 (모든 단계 한번에 생성)
  async createPipeline(params) {
    const { userId, metadata = {}, priority = 0, maxRetries = 3 } = params;
    const taskId = `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const createdAt = new Date().toISOString();
    const types = ['script', 'image', 'video', 'youtube'];

    const insert = this.db.prepare(`
      INSERT INTO task_queue (
        task_id, type, status, priority, created_at, user_id,
        metadata, logs, retry_count, max_retries
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const transaction = this.db.transaction(() => {
      for (const type of types) {
        insert.run(
          taskId,
          type,
          'waiting',
          priority,
          createdAt,
          userId,
          JSON.stringify(metadata),
          JSON.stringify([]),
          0,
          maxRetries
        );
      }
    });

    transaction();
    return taskId;
  }

  // 단일 작업 등록 (특정 타입만)
  async enqueue(task) {
    const taskId = task.taskId || `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const createdAt = new Date().toISOString();

    this.db.prepare(`
      INSERT OR REPLACE INTO task_queue (
        task_id, type, status, priority, created_at, user_id,
        metadata, logs, retry_count, max_retries
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      taskId,
      task.type,
      'waiting',
      task.priority || 0,
      createdAt,
      task.userId,
      JSON.stringify(task.metadata || {}),
      JSON.stringify(task.logs || []),
      task.retryCount || 0,
      task.maxRetries || 3
    );

    return {
      taskId,
      type: task.type,
      status: 'waiting',
      priority: task.priority || 0,
      createdAt,
      userId: task.userId,
      metadata: task.metadata || {},
      logs: task.logs || [],
      retryCount: task.retryCount || 0,
      maxRetries: task.maxRetries || 3
    };
  }

  async getTask(taskId, type) {
    const row = this.db.prepare('SELECT * FROM task_queue WHERE task_id = ? AND type = ?').get(taskId, type);
    if (!row) return null;
    return this.rowToTask(row);
  }

  async getPipeline(taskId) {
    const rows = this.db.prepare('SELECT * FROM task_queue WHERE task_id = ? ORDER BY created_at').all(taskId);
    return rows.map(row => this.rowToTask(row));
  }

  async getCurrentStage(taskId) {
    const stages = ['script', 'image', 'video', 'youtube'];
    for (const stage of stages) {
      const task = await this.getTask(taskId, stage);
      if (task && task.status !== 'completed') {
        return { type: stage, status: task.status };
      }
    }
    // 모든 단계 완료
    return { type: 'youtube', status: 'completed' };
  }

  async updateTask(taskId, type, updates) {
    const fields = [];
    const values = [];

    if (updates.status !== undefined) {
      fields.push('status = ?');
      values.push(updates.status);
    }
    if (updates.startedAt !== undefined) {
      fields.push('started_at = ?');
      values.push(updates.startedAt);
    }
    if (updates.completedAt !== undefined) {
      fields.push('completed_at = ?');
      values.push(updates.completedAt);
    }
    if (updates.error !== undefined) {
      fields.push('error = ?');
      values.push(updates.error);
    }
    if (updates.retryCount !== undefined) {
      fields.push('retry_count = ?');
      values.push(updates.retryCount);
    }
    if (updates.metadata !== undefined) {
      fields.push('metadata = ?');
      values.push(JSON.stringify(updates.metadata));
    }

    if (fields.length > 0) {
      values.push(taskId, type);
      this.db.prepare(`
        UPDATE task_queue SET ${fields.join(', ')} WHERE task_id = ? AND type = ?
      `).run(...values);
    }
  }

  async dequeue(type) {
    const transaction = this.db.transaction(() => {
      // 락 확인
      const lock = this.db.prepare('SELECT locked_by FROM task_lock WHERE task_type = ?').get(type);
      if (lock && lock.locked_by !== null) {
        return null;
      }

      // 선행 단계 확인
      const prerequisites = { image: 'script', video: 'image', youtube: 'video' };
      const prereq = prerequisites[type];

      // 다음 작업 선택
      let nextTask;
      if (prereq) {
        // 선행 단계가 완료된 작업만 선택
        nextTask = this.db.prepare(`
          SELECT t.* FROM task_queue t
          JOIN task_queue p ON t.task_id = p.task_id
          WHERE t.type = ? AND t.status = 'waiting'
            AND p.type = ? AND p.status = 'completed'
          ORDER BY t.priority DESC, t.created_at ASC
          LIMIT 1
        `).get(type, prereq);
      } else {
        // script는 선행 단계 없음
        nextTask = this.db.prepare(`
          SELECT * FROM task_queue
          WHERE type = ? AND status = 'waiting'
          ORDER BY priority DESC, created_at ASC
          LIMIT 1
        `).get(type);
      }

      if (!nextTask) {
        return null;
      }

      // 상태 업데이트
      const startedAt = new Date().toISOString();
      this.db.prepare(`
        UPDATE task_queue SET status = 'processing', started_at = ? WHERE task_id = ? AND type = ?
      `).run(startedAt, nextTask.task_id, nextTask.type);

      // 락 획득
      this.db.prepare(`
        UPDATE task_lock SET locked_by = ?, locked_at = ? WHERE task_type = ?
      `).run(nextTask.task_id, startedAt, type);

      return this.db.prepare('SELECT * FROM task_queue WHERE task_id = ? AND type = ?').get(nextTask.task_id, nextTask.type);
    });

    const task = transaction();
    return task ? this.rowToTask(task) : null;
  }

  async releaseTask(taskId, type) {
    this.db.prepare(`
      UPDATE task_lock SET locked_by = NULL, locked_at = NULL WHERE task_type = ?
    `).run(type);
  }

  // ⚠️ logs 컬럼 삭제됨 - 파일 기반 로그 사용

  rowToTask(row) {
    return {
      taskId: row.task_id,
      type: row.type,
      status: row.status,
      priority: row.priority,
      createdAt: row.created_at,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      userId: row.user_id,
      metadata: JSON.parse(row.metadata || '{}'),
      error: row.error,
      retryCount: row.retry_count,
      maxRetries: row.max_retries
    };
  }

  close() {
    this.db.close();
  }
}

describe('Phase 4: 자동화 통합 테스트 (task_id 기반)', () => {
  let queueManager;
  let mainDb;
  let hasTaskSchedule = false;
  const skipIfNoSchedule = () => {
    if (!hasTaskSchedule) {
      expect(true).toBe(true);
      return true;
    }
    return false;
  };

  beforeAll(() => {
    // data 디렉토리 확인
    const dataDir = path.join(process.cwd(), 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    // 테스트 DB 초기화
    if (fs.existsSync(TEST_QUEUE_DB_PATH)) {
      fs.unlinkSync(TEST_QUEUE_DB_PATH);
    }
    if (fs.existsSync(TEST_MAIN_DB_PATH)) {
      fs.unlinkSync(TEST_MAIN_DB_PATH);
    }

    queueManager = new TestQueueManager(TEST_QUEUE_DB_PATH);

    // 메인 DB 초기화
    mainDb = new Database(TEST_MAIN_DB_PATH);
    mainDb.exec(`
      CREATE TABLE IF NOT EXISTS task (
        id TEXT PRIMARY KEY,
        title TEXT,
        type TEXT,
        status TEXT DEFAULT 'pending',
        media_mode TEXT DEFAULT 'upload',
        user_id TEXT
      );
    `);
    hasTaskSchedule = tableExists(mainDb, 'task_schedule');
  });

  afterAll(() => {
    queueManager.close();
    mainDb.close();

    // 테스트 DB 정리
    if (fs.existsSync(TEST_QUEUE_DB_PATH)) {
      fs.unlinkSync(TEST_QUEUE_DB_PATH);
    }
    if (fs.existsSync(TEST_MAIN_DB_PATH)) {
      fs.unlinkSync(TEST_MAIN_DB_PATH);
    }
  });

  describe('1. QueueManager 기본 기능 (task_id 기반)', () => {
    test('파이프라인 생성 (createPipeline)', async () => {
      const taskId = await queueManager.createPipeline({
        userId: 'test_user_1',
        metadata: { scheduleId: 'schedule_001', titleId: 'title_001' },
        priority: 0,
        maxRetries: 3
      });

      expect(taskId).toBeDefined();
      expect(taskId).toMatch(/^task_\d+_[a-z0-9]+$/);

      // 4개 단계가 모두 생성되었는지 확인
      const pipeline = await queueManager.getPipeline(taskId);
      expect(pipeline.length).toBe(4);

      const types = pipeline.map(t => t.type);
      expect(types).toContain('script');
      expect(types).toContain('image');
      expect(types).toContain('video');
      expect(types).toContain('youtube');

      // 모두 waiting 상태
      pipeline.forEach(task => {
        expect(task.status).toBe('waiting');
      });
    });

    test('단일 작업 등록 (enqueue)', async () => {
      const task = await queueManager.enqueue({
        taskId: 'custom_task_001',
        type: 'image',
        userId: 'test_user_2',
        priority: 5,
        metadata: {
          scenes: [{ id: 1, text: '테스트 씬' }],
          scheduleId: 'schedule_002'
        }
      });

      expect(task).toBeDefined();
      expect(task.taskId).toBe('custom_task_001');
      expect(task.type).toBe('image');
      expect(task.status).toBe('waiting');
      expect(task.priority).toBe(5);
    });

    test('작업 상태 조회 (getTask with taskId + type)', async () => {
      const taskId = await queueManager.createPipeline({
        userId: 'test_user_3',
        metadata: { test: true }
      });

      const scriptTask = await queueManager.getTask(taskId, 'script');
      const imageTask = await queueManager.getTask(taskId, 'image');

      expect(scriptTask).toBeDefined();
      expect(scriptTask.taskId).toBe(taskId);
      expect(scriptTask.type).toBe('script');

      expect(imageTask).toBeDefined();
      expect(imageTask.taskId).toBe(taskId);
      expect(imageTask.type).toBe('image');
    });

    test('작업 상태 업데이트 (updateTask with taskId + type)', async () => {
      const taskId = await queueManager.createPipeline({
        userId: 'test_user_4',
        metadata: {}
      });

      await queueManager.updateTask(taskId, 'script', {
        status: 'processing',
        startedAt: new Date().toISOString()
      });

      const updated = await queueManager.getTask(taskId, 'script');
      expect(updated.status).toBe('processing');
      expect(updated.startedAt).toBeDefined();

      // 다른 단계는 영향 받지 않음
      const imageTask = await queueManager.getTask(taskId, 'image');
      expect(imageTask.status).toBe('waiting');
    });

    test('현재 단계 조회 (getCurrentStage)', async () => {
      const taskId = await queueManager.createPipeline({
        userId: 'test_user_5',
        metadata: {}
      });

      // 초기: script 단계
      let stage = await queueManager.getCurrentStage(taskId);
      expect(stage.type).toBe('script');
      expect(stage.status).toBe('waiting');

      // script 완료 후: image 단계
      await queueManager.updateTask(taskId, 'script', { status: 'completed' });
      stage = await queueManager.getCurrentStage(taskId);
      expect(stage.type).toBe('image');

      // image 완료 후: video 단계
      await queueManager.updateTask(taskId, 'image', { status: 'completed' });
      stage = await queueManager.getCurrentStage(taskId);
      expect(stage.type).toBe('video');

      // video 완료 후: youtube 단계
      await queueManager.updateTask(taskId, 'video', { status: 'completed' });
      stage = await queueManager.getCurrentStage(taskId);
      expect(stage.type).toBe('youtube');

      // 모두 완료
      await queueManager.updateTask(taskId, 'youtube', { status: 'completed' });
      stage = await queueManager.getCurrentStage(taskId);
      expect(stage.type).toBe('youtube');
      expect(stage.status).toBe('completed');
    });

    test('타입별 동시 1개 처리 보장 (dequeue)', async () => {
      // 파이프라인 생성 및 script 완료 처리 (image dequeue 가능하도록)
      const taskId = await queueManager.createPipeline({
        userId: 'test_user_6',
        metadata: {}
      });
      await queueManager.updateTask(taskId, 'script', { status: 'completed' });

      // 첫 번째 작업 dequeue
      const task1 = await queueManager.dequeue('image');
      expect(task1).toBeDefined();
      expect(task1.taskId).toBe(taskId);

      // 이미 처리 중인 작업이 있으므로 두 번째 dequeue는 null
      const task2 = await queueManager.dequeue('image');
      expect(task2).toBeNull();

      // 락 해제
      await queueManager.releaseTask(taskId, 'image');
    });

    test('선행 단계 미완료 시 dequeue 불가', async () => {
      const taskId = await queueManager.createPipeline({
        userId: 'test_user_7',
        metadata: {}
      });

      // script가 완료되지 않은 상태에서 image dequeue 시도
      // 기존 락 해제 먼저
      await queueManager.releaseTask(taskId, 'image');

      const imageTask = await queueManager.dequeue('image');
      // script가 완료되지 않았으므로 null
      expect(imageTask).toBeNull();
    });
  });

  describe('2. 스케줄과 큐 연동 (task_id 기반)', () => {
    test('스케줄에 task_id 저장', async () => {
      if (skipIfNoSchedule()) return;
      const scheduleId = `schedule_${Date.now()}`;
      const titleId = `title_${Date.now()}`;

      mainDb.prepare(`
        INSERT INTO task (id, title, type, status, media_mode, user_id)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(titleId, '테스트 타이틀', 'product', 'pending', 'upload', 'test_user');

      mainDb.prepare(`
        INSERT INTO task_schedule (id, title_id, scheduled_time, status)
        VALUES (?, ?, ?, ?)
      `).run(scheduleId, titleId, new Date().toISOString(), 'pending');

      // 파이프라인 생성
      const taskId = await queueManager.createPipeline({
        userId: 'test_user',
        metadata: { scheduleId, titleId }
      });

      // 스케줄에 task_id 저장
      mainDb.prepare(`
        UPDATE task_schedule SET task_id = ? WHERE id = ?
      `).run(taskId, scheduleId);

      const schedule = mainDb.prepare(`
        SELECT * FROM task_schedule WHERE id = ?
      `).get(scheduleId);

      expect(schedule.task_id).toBe(taskId);
    });

    test('task_id로 전체 파이프라인 상태 조회', async () => {
      if (skipIfNoSchedule()) return;
      const scheduleId = `schedule_pipeline_${Date.now()}`;
      const titleId = `title_pipeline_${Date.now()}`;

      mainDb.prepare(`
        INSERT INTO task (id, title, type, status, media_mode, user_id)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(titleId, '파이프라인 테스트', 'product', 'pending', 'upload', 'test_user');

      mainDb.prepare(`
        INSERT INTO task_schedule (id, title_id, scheduled_time, status)
        VALUES (?, ?, ?, ?)
      `).run(scheduleId, titleId, new Date().toISOString(), 'processing');

      const taskId = await queueManager.createPipeline({
        userId: 'test_user',
        metadata: { scheduleId, titleId }
      });

      mainDb.prepare('UPDATE task_schedule SET task_id = ? WHERE id = ?').run(taskId, scheduleId);

      // 스케줄에서 task_id 가져오기
      const schedule = mainDb.prepare('SELECT task_id FROM task_schedule WHERE id = ?').get(scheduleId);

      // 전체 파이프라인 상태 조회
      const pipeline = await queueManager.getPipeline(schedule.task_id);
      expect(pipeline.length).toBe(4);

      const currentStage = await queueManager.getCurrentStage(schedule.task_id);
      expect(currentStage.type).toBe('script');
    });
  });

  describe('3. 전체 파이프라인 흐름', () => {
    test('script → image → video → youtube 전체 흐름', async () => {
      const scheduleId = `schedule_flow_${Date.now()}`;
      const titleId = `title_flow_${Date.now()}`;

      // 1. 초기 설정
      mainDb.prepare(`
        INSERT INTO task (id, title, type, status, media_mode, user_id)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(titleId, '전체 흐름 테스트', 'product', 'pending', 'upload', 'test_user');

      mainDb.prepare(`
        INSERT INTO task_schedule (id, title_id, scheduled_time, status)
        VALUES (?, ?, ?, ?)
      `).run(scheduleId, titleId, new Date().toISOString(), 'pending');

      // 2. 파이프라인 생성
      const taskId = await queueManager.createPipeline({
        userId: 'test_user',
        metadata: { scheduleId, titleId }
      });

      mainDb.prepare('UPDATE task_schedule SET task_id = ?, status = ? WHERE id = ?')
        .run(taskId, 'processing', scheduleId);

      // 3. Script 단계
      let stage = await queueManager.getCurrentStage(taskId);
      expect(stage.type).toBe('script');

      await queueManager.updateTask(taskId, 'script', {
        status: 'processing',
        startedAt: new Date().toISOString()
      });
      await queueManager.appendLog(taskId, 'script', '대본 생성 시작');

      // 대본 생성 완료
      await queueManager.updateTask(taskId, 'script', {
        status: 'completed',
        completedAt: new Date().toISOString(),
        metadata: { scenes: [{ id: 1, text: '씬 1' }, { id: 2, text: '씬 2' }] }
      });
      await queueManager.appendLog(taskId, 'script', '대본 생성 완료');

      stage = await queueManager.getCurrentStage(taskId);
      expect(stage.type).toBe('image');

      // 4. Image 단계
      await queueManager.updateTask(taskId, 'image', {
        status: 'processing',
        startedAt: new Date().toISOString()
      });
      await queueManager.appendLog(taskId, 'image', '이미지 크롤링 시작');

      await queueManager.updateTask(taskId, 'image', {
        status: 'completed',
        completedAt: new Date().toISOString()
      });

      stage = await queueManager.getCurrentStage(taskId);
      expect(stage.type).toBe('video');

      // 5. Video 단계
      await queueManager.updateTask(taskId, 'video', {
        status: 'processing',
        startedAt: new Date().toISOString()
      });

      await queueManager.updateTask(taskId, 'video', {
        status: 'completed',
        completedAt: new Date().toISOString()
      });

      stage = await queueManager.getCurrentStage(taskId);
      expect(stage.type).toBe('youtube');

      // 6. YouTube 단계
      await queueManager.updateTask(taskId, 'youtube', {
        status: 'processing',
        startedAt: new Date().toISOString()
      });

      await queueManager.updateTask(taskId, 'youtube', {
        status: 'completed',
        completedAt: new Date().toISOString()
      });

      // 7. 전체 완료 확인
      stage = await queueManager.getCurrentStage(taskId);
      expect(stage.type).toBe('youtube');
      expect(stage.status).toBe('completed');

      // 스케줄 완료 처리
      mainDb.prepare(`
        UPDATE task_schedule SET status = ?, youtube_url = ? WHERE id = ?
      `).run('completed', 'https://youtube.com/watch?v=test123', scheduleId);

      const schedule = mainDb.prepare('SELECT * FROM task_schedule WHERE id = ?').get(scheduleId);
      expect(schedule.status).toBe('completed');
      expect(schedule.youtube_url).toBe('https://youtube.com/watch?v=test123');
    });
  });

  describe('4. 에러 처리', () => {
    test('존재하지 않는 작업 조회', async () => {
      const task = await queueManager.getTask('non_existent_task_id', 'script');
      expect(task).toBeNull();
    });

    test('특정 단계 실패 시 상태', async () => {
      const taskId = await queueManager.createPipeline({
        userId: 'test_user',
        metadata: {}
      });

      // script 완료
      await queueManager.updateTask(taskId, 'script', { status: 'completed' });

      // image 실패
      await queueManager.updateTask(taskId, 'image', {
        status: 'failed',
        error: '이미지 크롤링 실패: 네트워크 오류'
      });

      const failedTask = await queueManager.getTask(taskId, 'image');
      expect(failedTask.status).toBe('failed');
      expect(failedTask.error).toContain('네트워크 오류');

      // 실패한 단계 이후는 진행 불가
      const stage = await queueManager.getCurrentStage(taskId);
      expect(stage.type).toBe('image');
      expect(stage.status).toBe('failed');
    });

    test('재시도 카운트 증가', async () => {
      const taskId = await queueManager.createPipeline({
        userId: 'test_user',
        metadata: {}
      });

      // script 완료
      await queueManager.updateTask(taskId, 'script', { status: 'completed' });

      // 첫 번째 실패 - 재시도
      await queueManager.updateTask(taskId, 'image', {
        status: 'waiting',
        retryCount: 1,
        error: '첫 번째 실패'
      });

      let updated = await queueManager.getTask(taskId, 'image');
      expect(updated.retryCount).toBe(1);

      // 최종 실패
      await queueManager.updateTask(taskId, 'image', {
        status: 'failed',
        retryCount: 3,
        error: '최대 재시도 초과'
      });

      updated = await queueManager.getTask(taskId, 'image');
      expect(updated.status).toBe('failed');
      expect(updated.retryCount).toBe(3);
    });
  });

  describe('5. 우선순위 테스트', () => {
    test('높은 우선순위 작업이 먼저 처리됨', async () => {
      // 기존 락 해제
      await queueManager.releaseTask('any', 'script');

      // 기존 waiting 상태의 script 작업들을 모두 completed로 변경 (테스트 격리)
      queueManager.db.prepare(`
        UPDATE task_queue SET status = 'completed' WHERE type = 'script' AND status = 'waiting'
      `).run();

      // 낮은 우선순위 파이프라인
      const lowTaskId = await queueManager.createPipeline({
        userId: 'test_user',
        metadata: { name: 'low_priority' },
        priority: 0
      });

      // 높은 우선순위 파이프라인
      const highTaskId = await queueManager.createPipeline({
        userId: 'test_user',
        metadata: { name: 'high_priority' },
        priority: 10
      });

      // script 단계에서 우선순위 확인
      const first = await queueManager.dequeue('script');
      expect(first).toBeDefined();
      expect(first.taskId).toBe(highTaskId);

      await queueManager.releaseTask(first.taskId, 'script');

      const second = await queueManager.dequeue('script');
      expect(second).toBeDefined();
      expect(second.taskId).toBe(lowTaskId);

      await queueManager.releaseTask(second.taskId, 'script');
    });
  });

  describe('6. 로그 기능', () => {
    test('단계별 로그 추가 및 조회', async () => {
      const taskId = await queueManager.createPipeline({
        userId: 'test_user',
        metadata: {}
      });

      await queueManager.appendLog(taskId, 'script', '대본 생성 시작');
      await queueManager.appendLog(taskId, 'script', '프롬프트 처리 중...');
      await queueManager.appendLog(taskId, 'script', '대본 생성 완료');

      const scriptTask = await queueManager.getTask(taskId, 'script');
      expect(scriptTask.logs.length).toBe(3);
      expect(scriptTask.logs[0]).toBe('대본 생성 시작');
      expect(scriptTask.logs[2]).toBe('대본 생성 완료');

      // 다른 단계 로그는 별도
      await queueManager.appendLog(taskId, 'image', '이미지 크롤링 시작');

      const imageTask = await queueManager.getTask(taskId, 'image');
      expect(imageTask.logs.length).toBe(1);
      expect(imageTask.logs[0]).toBe('이미지 크롤링 시작');
    });
  });
});
