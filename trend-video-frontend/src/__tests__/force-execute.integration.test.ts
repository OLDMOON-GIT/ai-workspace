/**
 * 즉시실행 (force-execute) API 통합 테스트
 *
 * 테스트 범위:
 * 1. video_titles에서 직접 조회하여 실행
 * 2. 중복 실행 방지 (processing 상태)
 * 3. 존재하지 않는 title 처리
 * 4. 스케줄 자동 생성
 */

import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.join(process.cwd(), 'data', 'database.sqlite');

const tableExists = (db: Database.Database, name: string) => {
  const row = db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`).get(name);
  return !!row;
};

const hasColumn = (db: Database.Database, table: string, column: string) => {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as any[];
  return cols.some(col => col.name === column);
};

describe('Force Execute API - video_titles 기반 실행', () => {
  let db: Database.Database;
  let testTitleId: string;

  beforeAll(() => {
    db = new Database(dbPath);
  });

  afterAll(() => {
    // 테스트 데이터 정리
    if (testTitleId) {
      if (tableExists(db, 'task_schedule')) {
        db.prepare('DELETE FROM task_schedule WHERE title_id = ?').run(testTitleId);
      }
      db.prepare('DELETE FROM video_titles WHERE id = ?').run(testTitleId);
    }
    db.close();
  });

  describe('video_titles 테이블 직접 사용', () => {
    test('video_titles에 데이터가 있으면 조회 가능해야 함', () => {
      // 테스트용 title 생성
      testTitleId = `test_title_${Date.now()}`;

      db.prepare(`
        INSERT INTO video_titles (id, title, type, status, user_id)
        VALUES (?, ?, ?, ?, ?)
      `).run(testTitleId, '테스트 제목', 'shortform', 'pending', 'test_user');

      // 조회 테스트
      const title = db.prepare('SELECT * FROM video_titles WHERE id = ?').get(testTitleId) as any;

      expect(title).toBeDefined();
      expect(title.id).toBe(testTitleId);
      expect(title.title).toBe('테스트 제목');
      expect(title.status).toBe('pending');
    });

    test('automation_tasks 테이블 없이도 title 조회 가능해야 함', () => {
      // automation_tasks에는 데이터가 없어야 함
      const task = db.prepare('SELECT * FROM automation_tasks WHERE title_id = ?').get(testTitleId);
      expect(task).toBeUndefined();

      // video_titles에서는 조회 가능
      const title = db.prepare('SELECT * FROM video_titles WHERE id = ?').get(testTitleId);
      expect(title).toBeDefined();
    });

    test('상태 업데이트가 video_titles에서 동작해야 함', () => {
      // processing으로 상태 변경
      const result = db.prepare(`
        UPDATE video_titles
        SET status = 'processing', updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND status = 'pending'
      `).run(testTitleId);

      expect(result.changes).toBe(1);

      // 상태 확인
      const title = db.prepare('SELECT status FROM video_titles WHERE id = ?').get(testTitleId) as any;
      expect(title.status).toBe('processing');
    });

    test('중복 실행 방지 - 이미 processing이면 업데이트 안됨', () => {
      // 이미 processing 상태이므로 다시 업데이트 시도
      const result = db.prepare(`
        UPDATE video_titles
        SET status = 'processing', updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND status = 'pending'
      `).run(testTitleId);

      // 변경 없어야 함 (이미 processing)
      expect(result.changes).toBe(0);
    });
  });

  describe('스케줄 생성', () => {
    test('task_schedule에 title_id로 스케줄 생성 가능해야 함', () => {
      if (!tableExists(db, 'task_schedule')) {
        // v6 스펙: task_schedule 제거, scheduled_time 컬럼 확인
        const hasScheduledTime =
          hasColumn(db, 'video_titles', 'scheduled_time') || hasColumn(db, 'task', 'scheduled_time');
        expect(hasScheduledTime).toBe(true);
        return;
      }

      const scheduleId = `schedule_test_${Date.now()}`;
      const pastTime = new Date(Date.now() - 1000).toISOString();

      db.prepare(`
        INSERT INTO task_schedule (id, title_id, scheduled_time, youtube_privacy)
        VALUES (?, ?, ?, 'public')
      `).run(scheduleId, testTitleId, pastTime);

      // 조회 확인
      const schedule = db.prepare('SELECT * FROM task_schedule WHERE title_id = ?').get(testTitleId) as any;
      expect(schedule).toBeDefined();
      expect(schedule.title_id).toBe(testTitleId);
    });

    test('video_titles와 task_schedule JOIN 가능해야 함', () => {
      if (!tableExists(db, 'task_schedule')) {
        // task_schedule 제거 시 video_titles에서 직접 scheduled_time 관리
        const hasScheduledTime =
          hasColumn(db, 'video_titles', 'scheduled_time') || hasColumn(db, 'task', 'scheduled_time');
        expect(hasScheduledTime).toBe(true);
        return;
      }

      const result = db.prepare(`
        SELECT
          t.id as title_id,
          t.title,
          t.type,
          t.status,
          s.id as schedule_id,
          s.scheduled_time
        FROM video_titles t
        JOIN task_schedule s ON t.id = s.title_id
        WHERE t.id = ?
      `).get(testTitleId) as any;

      expect(result).toBeDefined();
      expect(result.title_id).toBe(testTitleId);
      expect(result.schedule_id).toBeDefined();
    });
  });

  describe('getPendingSchedules 쿼리 검증', () => {
    let pendingTitleId: string;

    beforeAll(() => {
      // pending 상태의 테스트 title 생성
      pendingTitleId = `pending_title_${Date.now()}`;

      db.prepare(`
        INSERT INTO video_titles (id, title, type, status, user_id)
        VALUES (?, ?, ?, ?, ?)
      `).run(pendingTitleId, '대기 중인 제목', 'shortform', 'pending', 'test_user');

      if (!tableExists(db, 'task_schedule')) {
        // task_schedule이 없으면 video_titles에 scheduled_time 컬럼이 있는지 확인하고 설정
        const hasScheduledTime = hasColumn(db, 'video_titles', 'scheduled_time');
        if (hasScheduledTime) {
          const pastTime = new Date(Date.now() - 60000).toISOString(); // 1분 전
          db.prepare(`
            UPDATE video_titles SET scheduled_time = ? WHERE id = ?
          `).run(pastTime, pendingTitleId);
        }
        return;
      }

      // 과거 시간으로 스케줄 생성
      const pastTime = new Date(Date.now() - 60000).toISOString(); // 1분 전
      db.prepare(`
        INSERT INTO task_schedule (id, title_id, scheduled_time, youtube_privacy)
        VALUES (?, ?, ?, 'public')
      `).run(`schedule_pending_${Date.now()}`, pendingTitleId, pastTime);
    });

    afterAll(() => {
      if (tableExists(db, 'task_schedule')) {
        db.prepare('DELETE FROM task_schedule WHERE title_id = ?').run(pendingTitleId);
      }
      db.prepare('DELETE FROM video_titles WHERE id = ?').run(pendingTitleId);
    });

    test('pending 상태이고 예약시간 지난 스케줄 조회', () => {
      if (!tableExists(db, 'task_schedule')) {
        const hasScheduledTime = hasColumn(db, 'video_titles', 'scheduled_time');
        // 스케줄 컬럼이 없으면 이 검증은 스킵(스펙상 task_schedule 제거)
        expect(hasScheduledTime).toBe(true);
        return;
      }

      const now = new Date();
      const nowLocal = now.toISOString().slice(0, 19);

      const schedules = db.prepare(`
        SELECT
          t.id as title_id,
          t.title,
          t.type,
          t.status,
          s.id as schedule_id,
          s.scheduled_time
        FROM video_titles t
        JOIN task_schedule s ON t.id = s.title_id
        WHERE t.status = 'pending'
          AND s.scheduled_time <= ?
        ORDER BY s.scheduled_time ASC
      `).all(nowLocal);

      expect(schedules.length).toBeGreaterThan(0);

      // 우리가 생성한 pending title이 포함되어야 함
      const found = schedules.find((s: any) => s.title_id === pendingTitleId);
      expect(found).toBeDefined();
    });
  });
});

describe('automation_tasks 제거 확인', () => {
  test('코드에서 automation_tasks 참조가 없어야 함', async () => {
    const fs = await import('fs');

    const forceExecuteCode = fs.readFileSync(
      path.join(process.cwd(), 'src/app/api/automation/force-execute/route.ts'),
      'utf-8'
    );

    const automationCode = fs.readFileSync(
      path.join(process.cwd(), 'src/lib/automation.ts'),
      'utf-8'
    );

    const schedulerCode = fs.readFileSync(
      path.join(process.cwd(), 'src/lib/automation-scheduler.ts'),
      'utf-8'
    );

    // automation_tasks 참조가 없어야 함
    expect(forceExecuteCode).not.toContain('automation_tasks');
    expect(automationCode).not.toContain('automation_tasks');
    expect(schedulerCode).not.toContain('automation_tasks');

    // video_titles를 사용해야 함
    expect(forceExecuteCode).toContain('video_titles');
    expect(automationCode).toContain('video_titles');
    expect(schedulerCode).toContain('video_titles');
  });
});
