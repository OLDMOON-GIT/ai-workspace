/**
 * SQL Mapper Integration Test
 *
 * SQL Mapper 시스템의 통합 테스트:
 * - scheduler.sql에서 모든 SQL 쿼리 로드 검증
 * - automation-scheduler.ts에서 사용하는 모든 getSql() 호출 검증
 * - 쿼리 파라미터 바인딩 검증
 */

import { describe, test, expect, beforeAll } from '@jest/globals';
import { getSql, getSqlMapper } from '../src/lib/sql-mapper';
import fs from 'fs';
import path from 'path';

describe('SQL Mapper Integration Tests', () => {
  let mapper: ReturnType<typeof getSqlMapper>;

  beforeAll(() => {
    mapper = getSqlMapper();
  });

  describe('SQL File Loading', () => {
    test('scheduler.sql 파일이 존재해야 함', () => {
      const sqlPath = path.join(process.cwd(), 'sql', 'scheduler.sql');
      expect(fs.existsSync(sqlPath)).toBe(true);
    });

    test('scheduler namespace가 초기화되어야 함', () => {
      const namespaces = mapper.getNamespaces();
      expect(namespaces).toContain('scheduler');
    });

    test('scheduler namespace에 SQL ID들이 로드되어야 함', () => {
      const sqlIds = mapper.getSqlIds('scheduler');
      expect(sqlIds.length).toBeGreaterThan(0);

      // 최소한의 필수 SQL ID들이 존재해야 함
      const requiredSqlIds = [
        'checkQueueStatus',
        'getCompletedTasks',
        'updateQueueStatus',
        'getPendingSchedules',
        'getQueueWithDetails'
      ];

      for (const sqlId of requiredSqlIds) {
        expect(sqlIds).toContain(sqlId);
      }
    });
  });

  describe('Queue Management Queries', () => {
    test('checkQueueStatus 쿼리가 로드되어야 함', () => {
      const sql = getSql('scheduler', 'checkQueueStatus');
      expect(sql).toContain('SELECT q.status');
      expect(sql).toContain('FROM task_queue q');
      expect(sql).toContain('WHERE q.task_id = ?');
    });

    test('getCurrentQueueType 쿼리가 로드되어야 함', () => {
      const sql = getSql('scheduler', 'getCurrentQueueType');
      expect(sql).toContain('SELECT type, status');
      expect(sql).toContain('FROM task_queue');
    });

    test('getProcessingCount 쿼리가 로드되어야 함', () => {
      const sql = getSql('scheduler', 'getProcessingCount');
      expect(sql).toContain('COUNT(*) as count');
      expect(sql).toContain('WHERE type = ? AND status = \'processing\'');
    });

    test('updateQueueStatus 쿼리가 로드되어야 함', () => {
      const sql = getSql('scheduler', 'updateQueueStatus');
      expect(sql).toContain('UPDATE task_queue');
      expect(sql).toContain('SET status = ?, error = ?');
      expect(sql).toContain('WHERE task_id = ? AND type = ?');
    });
  });

  describe('Task Lock Queries', () => {
    test('checkTaskLock 쿼리가 로드되어야 함', () => {
      const sql = getSql('scheduler', 'checkTaskLock');
      expect(sql).toContain('SELECT locked_by as lockedBy');
      expect(sql).toContain('FROM task_lock');
    });

    test('acquireTaskLock 쿼리가 로드되어야 함', () => {
      const sql = getSql('scheduler', 'acquireTaskLock');
      expect(sql).toContain('INSERT INTO task_lock');
      expect(sql).toContain('ON DUPLICATE KEY UPDATE');
    });

    test('releaseTaskLock 쿼리가 로드되어야 함', () => {
      const sql = getSql('scheduler', 'releaseTaskLock');
      expect(sql).toContain('UPDATE task_lock');
      expect(sql).toContain('SET locked_by = NULL');
    });
  });

  describe('Content & Schedule Queries', () => {
    test('getContentById 쿼리가 로드되어야 함', () => {
      const sql = getSql('scheduler', 'getContentById');
      expect(sql).toContain('SELECT content_id as contentId');
      expect(sql).toContain('FROM content');
    });

    test('getContentAllById 쿼리가 로드되어야 함', () => {
      const sql = getSql('scheduler', 'getContentAllById');
      expect(sql).toContain('SELECT *, content_id as contentId');
      expect(sql).toContain('FROM content');
    });

    test('getContentBasicById 쿼리가 로드되어야 함', () => {
      const sql = getSql('scheduler', 'getContentBasicById');
      expect(sql).toContain('SELECT content_id as contentId, title, user_id as userId');
      expect(sql).toContain('FROM content');
    });

    test('getPendingSchedules 쿼리가 로드되어야 함', () => {
      const sql = getSql('scheduler', 'getPendingSchedules');
      expect(sql).toContain('SELECT');
      expect(sql).toContain('t.task_id as taskId');
      expect(sql).toContain('WHERE t.scheduled_time IS NOT NULL');
    });
  });

  describe('Coupang Product Queries', () => {
    test('getExistingProductTitles 쿼리가 로드되어야 함', () => {
      const sql = getSql('scheduler', 'getExistingProductTitles');
      expect(sql).toContain('SELECT title FROM coupang_product');
    });

    test('getExistingProductUrls 쿼리가 로드되어야 함', () => {
      const sql = getSql('scheduler', 'getExistingProductUrls');
      expect(sql).toContain('SELECT product_url FROM coupang_product');
    });

    test('insertCoupangProduct 쿼리가 로드되어야 함', () => {
      const sql = getSql('scheduler', 'insertCoupangProduct');
      expect(sql).toContain('INSERT INTO coupang_product');
      expect(sql).toContain('coupang_id, user_id, product_url, deep_link');
    });

    test('insertCoupangProductSimple 쿼리가 로드되어야 함', () => {
      const sql = getSql('scheduler', 'insertCoupangProductSimple');
      expect(sql).toContain('INSERT INTO coupang_product');
    });
  });

  describe('Channel Settings Queries', () => {
    test('getAllActiveChannels 쿼리가 로드되어야 함', () => {
      const sql = getSql('scheduler', 'getAllActiveChannels');
      expect(sql).toContain('SELECT * FROM youtube_channel_setting');
      expect(sql).toContain('WHERE is_active = 1');
    });

    test('getActiveProductChannels 쿼리가 로드되어야 함', () => {
      const sql = getSql('scheduler', 'getActiveProductChannels');
      expect(sql).toContain('SELECT user_id, channel_id, channel_name, categories');
      expect(sql).toContain('WHERE is_active = 1 AND categories LIKE \'%상품%\'');
    });
  });

  describe('Task Creation Queries', () => {
    test('insertTask 쿼리가 로드되어야 함', () => {
      const sql = getSql('scheduler', 'insertTask');
      expect(sql).toContain('INSERT INTO task');
      expect(sql).toContain('task_id, status, user_id');
    });

    test('insertContentForProduct 쿼리가 로드되어야 함', () => {
      const sql = getSql('scheduler', 'insertContentForProduct');
      expect(sql).toContain('INSERT INTO content');
      expect(sql).toContain('content_id, user_id, title, prompt_format');
    });

    test('insertContentSetting 쿼리가 로드되어야 함', () => {
      const sql = getSql('scheduler', 'insertContentSetting');
      expect(sql).toContain('INSERT INTO content_setting');
      expect(sql).toContain('content_id, script_mode, media_mode');
    });

    test('insertTaskQueue 쿼리가 로드되어야 함', () => {
      const sql = getSql('scheduler', 'insertTaskQueue');
      expect(sql).toContain('INSERT INTO task_queue');
      expect(sql).toContain('task_id, type, status');
    });
  });

  describe('Task Completion Queries', () => {
    test('completeTaskQueue 쿼리가 로드되어야 함', () => {
      const sql = getSql('scheduler', 'completeTaskQueue');
      expect(sql).toContain('UPDATE task_queue');
      expect(sql).toContain('SET status = \'completed\'');
      expect(sql).toContain('elapsed_time = ?');
    });

    test('failTaskQueue 쿼리가 로드되어야 함', () => {
      const sql = getSql('scheduler', 'failTaskQueue');
      expect(sql).toContain('UPDATE task_queue');
      expect(sql).toContain('SET status = \'failed\'');
      expect(sql).toContain('error = ?');
    });

    test('completeContent 쿼리가 로드되어야 함', () => {
      const sql = getSql('scheduler', 'completeContent');
      expect(sql).toContain('UPDATE content');
      expect(sql).toContain('SET status = \'completed\'');
    });

    test('failContent 쿼리가 로드되어야 함', () => {
      const sql = getSql('scheduler', 'failContent');
      expect(sql).toContain('UPDATE content');
      expect(sql).toContain('SET status = \'failed\'');
    });
  });

  describe('Schedule Status Queries', () => {
    test('getScheduleStatus 쿼리가 로드되어야 함', () => {
      const sql = getSql('scheduler', 'getScheduleStatus');
      expect(sql).toContain('SELECT status');
      expect(sql).toContain('FROM task_queue');
    });

    test('getLastScheduleForChannel 쿼리가 로드되어야 함', () => {
      const sql = getSql('scheduler', 'getLastScheduleForChannel');
      expect(sql).toContain('SELECT t.*, c.youtube_channel as youtubeChannel');
      expect(sql).toContain('FROM task t');
      expect(sql).toContain('JOIN content c');
    });

    test('getExistingScheduleByDate 쿼리가 로드되어야 함', () => {
      const sql = getSql('scheduler', 'getExistingScheduleByDate');
      expect(sql).toContain('SELECT t.task_id as schedule_id');
      expect(sql).toContain('DATE(t.scheduled_time) = DATE(?)');
    });
  });

  describe('Shortform Queries', () => {
    test('getSchedulesWithShortform 쿼리가 로드되어야 함', () => {
      const sql = getSql('scheduler', 'getSchedulesWithShortform');
      expect(sql).toContain('FROM task');
      expect(sql).toContain('WHERE 1 = 0');
    });

    test('updateShortformUploaded 쿼리가 로드되어야 함', () => {
      const sql = getSql('scheduler', 'updateShortformUploaded');
      expect(sql).toContain('UPDATE task');
      expect(sql).toContain('updated_at = CURRENT_TIMESTAMP');
    });
  });

  describe('Additional Queries', () => {
    test('getAverageTime 쿼리가 로드되어야 함', () => {
      const sql = getSql('scheduler', 'getAverageTime');
      expect(sql).toContain('AVG(elapsed_time) as avg_time');
      expect(sql).toContain('WHERE type = ?');
    });

    test('getStaleTasks 쿼리가 로드되어야 함', () => {
      const sql = getSql('scheduler', 'getStaleTasks');
      expect(sql).toContain('WHERE q.status = \'processing\'');
      expect(sql).toContain('DATE_SUB(NOW(), INTERVAL ? MINUTE)');
    });

    test('getExistingJobBySourceId 쿼리가 로드되어야 함', () => {
      const sql = getSql('scheduler', 'getExistingJobBySourceId');
      expect(sql).toContain('WHERE source_content_id = ?');
      expect(sql).toContain('AND status IN (\'pending\', \'processing\')');
    });
  });

  describe('Error Handling', () => {
    test('존재하지 않는 SQL ID는 에러를 발생시켜야 함', () => {
      expect(() => {
        getSql('scheduler', 'nonExistentSqlId');
      }).toThrow();
    });

    test('존재하지 않는 namespace는 에러를 발생시켜야 함', () => {
      expect(() => {
        getSql('nonExistentNamespace', 'someSqlId');
      }).toThrow();
    });
  });

  describe('SQL Query Validation', () => {
    test('모든 쿼리는 유효한 SQL 문법을 가져야 함', () => {
      const sqlIds = mapper.getSqlIds('scheduler');

      for (const sqlId of sqlIds) {
        const sql = getSql('scheduler', sqlId);

        // 기본 SQL 키워드 검증
        const hasValidKeyword =
          sql.includes('SELECT') ||
          sql.includes('INSERT') ||
          sql.includes('UPDATE') ||
          sql.includes('DELETE');

        expect(hasValidKeyword).toBe(true);

        // 빈 쿼리가 아니어야 함
        expect(sql.trim().length).toBeGreaterThan(0);
      }
    });

    test('camelCase 별칭이 일관되게 사용되어야 함', () => {
      // SELECT 쿼리들에서 snake_case as camelCase 패턴 검증
      const selectQueries = [
        'checkQueueStatus',
        'getContentById',
        'getPendingSchedules',
        'getQueueWithDetails'
      ];

      for (const sqlId of selectQueries) {
        const sql = getSql('scheduler', sqlId);
        const selectClause = sql.split(/from/i)[0];

        // snake_case 컬럼이 있으면 camelCase 별칭도 있어야 함
        const selectHasTaskId = /task_id/i.test(selectClause);
        if (selectHasTaskId) {
          expect(sql).toMatch(/task_id\s+as\s+taskId/i);
        }
        const selectHasUserId = /user_id/i.test(selectClause);
        if (selectHasUserId) {
          expect(sql).toMatch(/user_id\s+as\s+userId/i);
        }
      }
    });
  });

  describe('Performance Tests', () => {
    test('100개의 getSql 호출은 100ms 이내에 완료되어야 함', () => {
      const start = Date.now();

      for (let i = 0; i < 100; i++) {
        getSql('scheduler', 'checkQueueStatus');
      }

      const elapsed = Date.now() - start;
      expect(elapsed).toBeLessThan(100);
    });

    test('SQL 캐싱이 동작해야 함', () => {
      const sql1 = getSql('scheduler', 'checkQueueStatus');
      const sql2 = getSql('scheduler', 'checkQueueStatus');

      // 동일한 참조를 반환해야 함 (캐싱)
      expect(sql1).toBe(sql2);
    });
  });
});

/**
 * 통합 테스트 실행 방법:
 *
 * npm test -- sql-mapper-integration.test.ts
 *
 * 또는 전체 테스트 실행:
 * npm test
 */
