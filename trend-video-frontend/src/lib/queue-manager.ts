/**
 * Global Queue Management System
 *
 * 서버 전체의 리소스를 관리하는 큐 시스템.
 * 각 작업 타입(script, image, video)별로 1개씩만 동시 실행.
 *
 * ⚠️ ID 규칙:
 * - task_id = task_schedule.task_id (동일한 값 사용)
 * - 폴더명: task_{task_id} 형식으로 통일
 *
 * @module queue-manager
 */

import { getAll, getOne, run, exec } from './mysql';
import crypto from 'crypto';

// 로컬 시간 헬퍼
function getLocalDateTime(): string {
  const now = new Date();
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}

// 날짜 객체를 로컬 시간 형식으로 변환
function formatDateToLocal(date: Date): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export type PromptFormat = 'schedule' | 'script' | 'image' | 'video' | 'youtube';
export type TaskState = 'waiting' | 'processing' | 'completed' | 'failed' | 'cancelled';

export interface QueueTask {
  taskId: string;       // 파이프라인 전체를 식별하는 단일 ID
  promptFormat: PromptFormat;       // 현재 단계 (script, image, video, youtube)
  state: TaskState;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  userId: string;
  projectId?: string;   // 프로젝트 ID (선택)
  error?: string;
  metadata?: Record<string, any>;  // 추가 메타데이터
  logs?: string[];                 // 로그 메시지
  // ⭐ 각 단계별 완료 시간
  scriptCompletedAt?: string;
  imageCompletedAt?: string;
  videoCompletedAt?: string;
  youtubeCompletedAt?: string;
}

export interface QueueSummary {
  schedule: { waiting: number; processing: number; completed: number; failed: number };
  script: { waiting: number; processing: number; completed: number; failed: number };
  image: { waiting: number; processing: number; completed: number; failed: number };
  video: { waiting: number; processing: number; completed: number; failed: number };
  youtube: { waiting: number; processing: number; completed: number; failed: number };
}

export class QueueManager {
  constructor() {
    // MySQL: using imported db
    this.initializeDatabase();
  }

  private async initializeDatabase() {
    // ⭐ Queue Spec v6: task_id가 PK (하나의 task = 하나의 row)
    // type과 status가 phase에 따라 변경됨
    // v6: 'schedule' 타입 제거됨 - task_schedule 직접 사용
    await exec(`
      CREATE TABLE IF NOT EXISTS task_queue (
        task_id VARCHAR(255) PRIMARY KEY NOT NULL,
        type VARCHAR(50) NOT NULL,
        status VARCHAR(50) NOT NULL,
        created_at VARCHAR(100) NOT NULL,
        started_at VARCHAR(100),
        completed_at VARCHAR(100),
        user_id VARCHAR(255) NOT NULL,
        metadata TEXT,
        logs TEXT,
        error TEXT
      )
    `);

    // 인덱스 생성 (MySQL: IF NOT EXISTS 미지원)
    try {
      await run(`CREATE INDEX idx_task_queue_type_status ON task_queue(type, status, created_at)`);
    } catch (e) { /* 이미 존재 */ }
    try {
      await run(`CREATE INDEX idx_task_queue_user_status ON task_queue(user_id, status)`);
    } catch (e) { /* 이미 존재 */ }

    // 락 테이블 (각 타입별 1개만 processing 보장)
    // v6: 'schedule' 타입 제거됨, locked_by 컬럼 제거됨 (worker_pid로 통합)
    await exec(`
      CREATE TABLE IF NOT EXISTS task_lock (
        task_type VARCHAR(50) PRIMARY KEY,
        lock_task_id CHAR(36),
        locked_at VARCHAR(100),
        worker_pid INTEGER
      )
    `);

    await exec(`
      INSERT IGNORE INTO task_lock (task_type, lock_task_id, locked_at, worker_pid)
      VALUES
        ('schedule', NULL, NULL, NULL),
        ('script', NULL, NULL, NULL),
        ('image', NULL, NULL, NULL),
        ('video', NULL, NULL, NULL),
        ('youtube', NULL, NULL, NULL)
    `);

    console.log('✅ Queue database initialized (MySQL)');
  }

  // Internal use (e.g., scheduler health checks)
  getDb() {
    return { getAll, getOne, run, exec };
  }

  /**
   * 새 파이프라인 생성 (task_id 발급)
   * 모든 단계(script, image, video, youtube)를 한번에 생성
   */
  async createPipeline(params: {
    userId: string;
    metadata?: Record<string, any>;
  }): Promise<string> {
    // ⚠️ ID 규칙: prefix 없이 순수 ID만 사용
    const taskId = `${Date.now()}_${crypto.randomUUID().split('-')[0]}`;
    const createdAt = getLocalDateTime();
    const types: PromptFormat[] = ['script', 'image', 'video', 'youtube'];

    // ⚠️ task_id가 단독 PK - 같은 task_id로 여러 type 불가!
    // REPLACE로 기존 레코드 덮어쓰기
    // 첫 번째 단계(script)만 waiting, 나머지는 waiting 상태로 대기
    for (const promptFormat of types) {
      await run(`
        REPLACE INTO task_queue (
          task_id, type, status, created_at, user_id,
          metadata, logs
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [
        taskId,
        promptFormat,
        'waiting',
        createdAt,
        params.userId,
        JSON.stringify(params.metadata || {}),
        JSON.stringify([])
      ]);
    }

    console.log(`✅ Pipeline created: ${taskId} (4 stages)`);
    return taskId;
  }

  /**
   * 특정 단계를 큐에 추가 (기존 호환용)
   */
  async enqueue(task: Omit<QueueTask, 'state' | 'createdAt'>): Promise<QueueTask> {
    const createdAt = getLocalDateTime();

    const newTask: QueueTask = {
      state: 'waiting',
      createdAt,
      ...task
    };

    await run(`
      REPLACE INTO task_queue (
        task_id, type, status, created_at, user_id,
        metadata, logs
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [
      newTask.taskId,
      newTask.promptFormat,
      newTask.state,
      newTask.createdAt,
      newTask.userId,
      JSON.stringify(newTask.metadata),
      JSON.stringify(newTask.logs)
    ]);

    console.log(`✅ Task enqueued: ${newTask.taskId} (${newTask.promptFormat})`);
    return newTask;
  }

  /**
   * 큐에서 다음 작업 가져오기 (워커용)
   * 해당 타입의 락을 획득하고 작업을 processing 상태로 변경
   */
  async dequeue(promptFormat: PromptFormat): Promise<QueueTask | null> {
    // MySQL: individual queries (no transaction wrapper)
    // 1. 해당 타입의 락 확인 (5분 타임아웃 포함)
    const lock = await getOne(`
      SELECT worker_pid, locked_at FROM task_lock WHERE task_type = ?
    `, [promptFormat]) as { worker_pid: number | null; locked_at: string | null } | undefined;

    if (lock && lock.worker_pid !== null) {
      // 락 타임아웃 체크 (5분 = 300000ms)
      const lockTime = lock.locked_at ? new Date(lock.locked_at).getTime() : 0;
      const now = Date.now();
      const LOCK_TIMEOUT = 60 * 60 * 1000; // 1시간 (이미지 크롤링은 오래 걸릴 수 있음)

      if (now - lockTime < LOCK_TIMEOUT) {
        // 아직 타임아웃되지 않은 락 - 다른 작업이 처리 중
        return null;
      }

      // 타임아웃된 락 - 자동 해제
      console.log(`⚠️ [QueueManager] 타임아웃된 락 해제: ${promptFormat} (PID: ${lock.worker_pid})`);
      await run(`
        UPDATE task_lock
        SET lock_task_id = NULL, locked_at = NULL, worker_pid = NULL
        WHERE task_type = ?
      `, [promptFormat]);
    }

    // 2. 다음 작업 선택 (우선순위 높은 순, 생성 시간 오래된 순)
    // ⭐ type이 해당 단계로 설정되어 있다는 것 자체가 이전 단계가 완료되었다는 의미
    // (이전 단계 worker가 완료 후 type을 다음 단계로 변경)
    const nextTask = await getOne(`
      SELECT * FROM task_queue
      WHERE type = ? AND status = 'waiting'
      ORDER BY created_at ASC
      LIMIT 1
    `, [promptFormat]) as any;

    if (!nextTask) {
      return null;
    }

    // 3. 작업 상태 업데이트: processing
    const startedAt = getLocalDateTime();
    await run(`
      UPDATE task_queue
      SET status = 'processing'
      WHERE task_id = ? AND type = ?
    `, [nextTask.task_id, promptFormat]);

    // v6: 시작 시간을 task_time_log에 기록 (retry_cnt는 기존 로그 개수로 계산)
    const retryCnt = await getOne(`
      SELECT COALESCE(MAX(retry_cnt), -1) + 1 as next_retry
      FROM task_time_log
      WHERE task_id = ? AND type = ?
    `, [nextTask.task_id, promptFormat]);
    await run(`
      INSERT INTO task_time_log (task_id, type, retry_cnt, start_time)
      VALUES (?, ?, ?, ?)
    `, [nextTask.task_id, promptFormat, retryCnt?.next_retry || 0, startedAt]);

    // 4. 락 획득
    await run(`
      UPDATE task_lock
      SET lock_task_id = ?, locked_at = ?, worker_pid = ?
      WHERE task_type = ?
    `, [nextTask.task_id, startedAt, process.pid, promptFormat]);

    // 5. 업데이트된 작업 반환
    const task = await getOne('SELECT * FROM task_queue WHERE task_id = ? AND type = ?', [nextTask.task_id, promptFormat]) as any;

    if (task) {
      console.log(`▶️  Dequeued task: ${task.task_id} (${promptFormat})`);
      return this.rowToTask(task);
    }

    return null;
  }

  /**
   * 작업 완료 시 락 해제
   */
  async releaseTask(taskId: string, promptFormat: PromptFormat): Promise<void> {
    await run(`
      UPDATE task_lock
      SET lock_task_id = NULL, locked_at = NULL, worker_pid = NULL
      WHERE task_type = ? AND lock_task_id = ?
    `, [promptFormat, taskId]);

    console.log(`🔓 Lock released: ${taskId} (${promptFormat})`);
  }

  /**
   * 작업 취소 (waiting 상태만 가능)
   */
  async cancel(taskId: string, promptFormat?: PromptFormat): Promise<boolean> {
    let query = `
      UPDATE task_queue
      SET status = 'failed', error = 'Cancelled by user'
      WHERE task_id = ? AND status = 'waiting'
    `;
    const params: any[] = [taskId];

    if (promptFormat) {
      query += ' AND type = ?';
      params.push(promptFormat);
    }

    const result = await run(query, params) as any;

    if (result.affectedRows > 0) {
      console.log(`❌ Task cancelled: ${taskId}${promptFormat ? ` (${promptFormat})` : ' (all stages)'}`);
      return true;
    }

    return false;
  }

  /**
   * 큐 조회 (필터링 가능)
   */
  async getQueue(options?: {
    taskId?: string;
    promptFormat?: PromptFormat;
    state?: TaskState;
    userId?: string;
    limit?: number;
    offset?: number;
  }): Promise<QueueTask[]> {
    let query = 'SELECT * FROM task_queue WHERE 1=1';
    const params: any[] = [];

    if (options?.taskId) {
      query += ' AND task_id = ?';
      params.push(options.taskId);
    }

    if (options?.promptFormat) {
      query += ' AND type = ?';
      params.push(options.promptFormat);
    }

    if (options?.state) {
      query += ' AND status = ?';
      params.push(options.state);
    }

    if (options?.userId) {
      query += ' AND user_id = ?';
      params.push(options.userId);
    }

    query += ' ORDER BY created_at DESC';

    if (options?.limit) {
      query += ' LIMIT ?';
      params.push(options.limit);

      if (options?.offset) {
        query += ' OFFSET ?';
        params.push(options.offset);
      }
    }

    const rows = await getAll(query, params) as any[];
    return rows.map(row => this.rowToTask(row));
  }

  /**
   * 특정 단계 조회 (task_id + promptFormat)
   * promptFormat이 없으면 task_id로만 첫 번째 작업 조회
   */
  async getTask(taskId: string, promptFormat?: PromptFormat): Promise<QueueTask | null> {
    let row;
    if (promptFormat) {
      row = await getOne('SELECT * FROM task_queue WHERE task_id = ? AND type = ?', [taskId, promptFormat]) as any;
    } else {
      row = await getOne('SELECT * FROM task_queue WHERE task_id = ? LIMIT 1', [taskId]) as any;
    }
    return row ? this.rowToTask(row) : null;
  }

  /**
   * 파이프라인 전체 상태 조회 (모든 단계)
   */
  async getPipeline(taskId: string): Promise<QueueTask[]> {
    const rows = await getAll(`
      SELECT * FROM task_queue
      WHERE task_id = ?
      ORDER BY CASE type
        WHEN 'script' THEN 1
        WHEN 'image' THEN 2
        WHEN 'video' THEN 3
        WHEN 'youtube' THEN 4
      END
    `, [taskId]) as any[];
    return rows.map(row => this.rowToTask(row));
  }

  /**
   * 파이프라인 현재 단계 조회
   */
  async getCurrentStage(taskId: string): Promise<{ promptFormat: PromptFormat; state: TaskState } | null> {
    const pipeline = await this.getPipeline(taskId);
    // processing 중인 단계가 있으면 반환
    const processing = pipeline.find(t => t.state === 'processing');
    if (processing) return { promptFormat: processing.promptFormat, state: processing.state };

    // 실패한 단계가 있으면 반환
    const failed = pipeline.find(t => t.state === 'failed');
    if (failed) return { promptFormat: failed.promptFormat, state: failed.state };

    // 다음 대기 중인 단계 반환
    const waiting = pipeline.find(t => t.state === 'waiting');
    if (waiting) return { promptFormat: waiting.promptFormat, state: waiting.state };

    // 모두 완료
    const lastCompleted = pipeline.filter(t => t.state === 'completed').pop();
    if (lastCompleted) return { promptFormat: lastCompleted.promptFormat, state: lastCompleted.state };

    return null;
  }

  /**
   * 작업 상태 업데이트
   */
  async updateTask(taskId: string, promptFormat: PromptFormat, updates: Partial<QueueTask>): Promise<void> {
    const fields: string[] = [];
    const values: any[] = [];

    if (updates.state !== undefined) {
      fields.push('status = ?');
      values.push(updates.state);
    }

    // v6: startedAt, completedAt은 task_time_log에 기록
    if (updates.startedAt !== undefined) {
      // task_time_log에 start_time 기록은 acquireNextTask에서 처리됨
    }

    if (updates.completedAt !== undefined) {
      // task_time_log의 end_time 업데이트
      await run(`
        UPDATE task_time_log
        SET end_time = ?
        WHERE task_id = ? AND type = ? AND end_time IS NULL
        ORDER BY retry_cnt DESC LIMIT 1
      `, [updates.completedAt, taskId, promptFormat]);
    }

    if (updates.error !== undefined) {
      fields.push('error = ?');
      values.push(updates.error);
    }

    if (updates.logs !== undefined) {
      fields.push('logs = ?');
      values.push(JSON.stringify(updates.logs));
    }

    if (updates.metadata !== undefined) {
      fields.push('metadata = ?');
      values.push(JSON.stringify(updates.metadata));
    }

    if (fields.length === 0) {
      return;
    }

    values.push(taskId, promptFormat);

    await run(`
      UPDATE task_queue
      SET ${fields.join(', ')}
      WHERE task_id = ? AND type = ?
    `, values);

    // 완료/실패 시 락 해제
    if (updates.state === 'completed' || updates.state === 'failed') {
      await this.releaseTask(taskId, promptFormat);
    }
  }

  /**
   * 로그 추가
   */
  async appendLog(taskId: string, promptFormat: PromptFormat, log: string): Promise<void> {
    // ⭐ 파일 기반 로그로 전환 - tasks/{taskId}/{type}.log
    if (!taskId) {
      console.warn('[QueueManager] appendLog: taskId is undefined, skipping');
      return;
    }
    const { addContentLog } = require('./content');
    const logType = promptFormat === 'script' ? 'script'
      : promptFormat === 'image' ? 'image'
      : promptFormat === 'video' ? 'video'
      : promptFormat === 'youtube' ? 'youtube'
      : 'script';
    addContentLog(taskId, log, logType);
  }

  /**
   * 큐 요약 정보
   */
  async getSummary(): Promise<QueueSummary> {
    const summary: QueueSummary = {
      schedule: { waiting: 0, processing: 0, completed: 0, failed: 0 },
      script: { waiting: 0, processing: 0, completed: 0, failed: 0 },
      image: { waiting: 0, processing: 0, completed: 0, failed: 0 },
      video: { waiting: 0, processing: 0, completed: 0, failed: 0 },
      youtube: { waiting: 0, processing: 0, completed: 0, failed: 0 }
    };

    const rows = await getAll(`
      SELECT type, status, COUNT(*) as count
      FROM task_queue
      GROUP BY type, status
    `, []) as Array<{ type: PromptFormat; status: TaskState; count: number }>;

    for (const row of rows) {
      if (row.status === 'cancelled') continue; // cancelled는 집계에서 제외
      summary[row.type][row.status] = row.count;
    }

    return summary;
  }

  /**
   * 큐 내 위치 계산
   */
  async getPosition(taskId: string, promptFormat: PromptFormat): Promise<number | null> {
    const task = await this.getTask(taskId, promptFormat);
    if (!task || task.state !== 'waiting') {
      return null;
    }

    const result = await getOne(`
      SELECT COUNT(*) as position
      FROM task_queue
      WHERE type = ?
        AND status = 'waiting'
        AND created_at < ?
    `, [task.promptFormat, task.createdAt]) as { position: number };

    return result.position;
  }

  /**
   * 오래된 완료/실패 작업 정리
   */
  async cleanup(daysOld: number = 30): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    const result = await run(`
      DELETE FROM task_queue
      WHERE status IN ('completed', 'failed')
        AND completed_at < ?
    `, [formatDateToLocal(cutoffDate)]) as any;

    console.log(`🗑️  Cleaned up ${result.affectedRows} old tasks (older than ${daysOld} days)`);
    return result.affectedRows;
  }

  /**
   * 큐의 모든 작업 삭제 (초기화)
   */
  async clearAll(): Promise<number> {
    const result = await run(`DELETE FROM task_queue`, []) as any;

    console.log(`🗑️  Cleared all ${result.affectedRows} tasks from queue`);
    return result.affectedRows;
  }

  /**
   * 헬스 체크: stuck tasks 감지
   */
  async getHealthStatus(): Promise<{
    healthy: boolean;
    stuckTasks: Array<{ taskId: string; promptFormat: PromptFormat; startedAt: string }>;
  }> {
    const tenMinutesAgo = new Date();
    tenMinutesAgo.setMinutes(tenMinutesAgo.getMinutes() - 10);

    const stuckTasksRaw = await getAll(`
      SELECT task_id, type, started_at
      FROM task_queue
      WHERE status = 'processing'
        AND started_at < ?
    `, [formatDateToLocal(tenMinutesAgo)]) as Array<{ task_id: string; type: PromptFormat; started_at: string }>;

    const stuckTasks = stuckTasksRaw.map(task => ({
      taskId: task.task_id,
      promptFormat: task.type,
      startedAt: task.started_at
    }));

    return {
      healthy: stuckTasks.length === 0,
      stuckTasks
    };
  }

  /**
   * DB row를 QueueTask 객체로 변환
   */
  private rowToTask(row: any): QueueTask {
    return {
      taskId: row.task_id,
      promptFormat: row.type,
      state: row.status,
      createdAt: row.created_at,
      startedAt: row.started_at || undefined,
      completedAt: row.completed_at || undefined,
      userId: row.user_id,
      error: row.error || undefined,
      metadata: row.metadata ? JSON.parse(row.metadata) : {},
      logs: row.logs ? JSON.parse(row.logs) : [],
      // ⭐ 각 단계별 완료 시간
      scriptCompletedAt: row.script_completed_at || undefined,
      imageCompletedAt: row.image_completed_at || undefined,
      videoCompletedAt: row.video_completed_at || undefined,
      youtubeCompletedAt: row.youtube_completed_at || undefined,
    };
  }

  /**
   * 연결 종료
   */
  close() {
    // MySQL: pool manages connections - no explicit close needed
  }
}
