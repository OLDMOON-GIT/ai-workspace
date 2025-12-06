/**
 * SQL Mapper 사용 예제
 */

import { getSql, reloadSql, getSqlMapper } from '@/lib/sql-mapper';
import db from '@/lib/sqlite';

// ============================================================
// 예제 1: 기본 사용법
// ============================================================
export async function example1_basic() {
  // SQL 조회 및 실행
  const sql = getSql('automation', 'getPendingSchedules');
  const schedules = await db.prepare(sql).all(new Date());

  console.log('Pending schedules:', schedules);
}

// ============================================================
// 예제 2: 여러 파라미터 사용
// ============================================================
export async function example2_multipleParams() {
  // 대기 중인 작업 조회 (type, limit)
  const sql = getSql('automation', 'getWaitingTasks');
  const tasks = await db.prepare(sql).all('script', 10);

  console.log('Waiting tasks:', tasks);
}

// ============================================================
// 예제 3: 트랜잭션과 함께 사용
// ============================================================
export async function example3_transaction(taskId: string) {
  const insertSql = getSql('automation', 'insertTaskQueue');
  const updateSql = getSql('automation', 'updateTaskQueueStatus');

  try {
    // 삽입
    await db.prepare(insertSql).run(taskId, 'script', 'waiting', 'user-123');

    // 상태 업데이트
    await db.prepare(updateSql).run('processing', null, taskId, 'script');

    console.log('Transaction completed');
  } catch (error) {
    console.error('Transaction failed:', error);
    throw error;
  }
}

// ============================================================
// 예제 4: 조건부 SQL 실행
// ============================================================
export async function example4_conditional(productId: string) {
  // 상품 존재 확인
  const checkSql = getSql('coupang', 'checkDuplicateProduct');
  const { count } = await db.prepare(checkSql).get(productId) as { count: number };

  if (count > 0) {
    // 이미 존재하면 업데이트
    const updateSql = getSql('coupang', 'updateProductRegistered');
    await db.prepare(updateSql).run(productId);
  } else {
    // 없으면 삽입
    const insertSql = getSql('coupang', 'insertCoupangProduct');
    await db.prepare(insertSql).run(
      productId,
      'Sample Product',
      19900,
      'https://example.com/image.jpg',
      'https://link.coupang.com/a/xxxxx',
      '상품'
    );
  }
}

// ============================================================
// 예제 5: 페이지네이션
// ============================================================
export async function example5_pagination(page: number, pageSize: number) {
  const sql = getSql('coupang', 'getAllProducts');
  const offset = (page - 1) * pageSize;

  const products = await db.prepare(sql).all(pageSize, offset);

  return {
    page,
    pageSize,
    data: products
  };
}

// ============================================================
// 예제 6: 통계 조회
// ============================================================
export async function example6_statistics() {
  const sql = getSql('coupang', 'getProductStats');
  const stats = await db.prepare(sql).get();

  console.log('Product Statistics:', stats);
  // { total: 150, registered: 120, unregistered: 30 }
}

// ============================================================
// 예제 7: SQL 디버깅
// ============================================================
export function example7_debug() {
  const mapper = getSqlMapper();

  // 모든 네임스페이스 조회
  console.log('Namespaces:', mapper.getNamespaces());

  // automation 네임스페이스의 SQL ID 목록
  console.log('Automation SQL IDs:', mapper.getSqlIds('automation'));

  // 특정 SQL 내용 확인
  const sql = getSql('automation', 'getPendingSchedules');
  console.log('SQL Content:', sql);
}

// ============================================================
// 예제 8: SQL 재로드 (개발 중)
// ============================================================
export function example8_reload() {
  // SQL 파일 수정 후 재로드
  reloadSql();
  console.log('SQL reloaded!');
}

// ============================================================
// 예제 9: 에러 핸들링
// ============================================================
export async function example9_errorHandling() {
  try {
    // 존재하지 않는 SQL ID
    const sql = getSql('automation', 'nonExistentSqlId');
  } catch (error) {
    console.error('SQL not found:', error);
    // Error: ❌ SQL not found: automation.nonExistentSqlId
  }

  try {
    // 존재하지 않는 네임스페이스
    const sql = getSql('nonExistent', 'someSqlId');
  } catch (error) {
    console.error('Namespace not found:', error);
    // Error: ❌ SQL not found: nonExistent.someSqlId
  }
}

// ============================================================
// 예제 10: 실전 - Automation Scheduler에서 사용
// ============================================================
export async function example10_realWorld() {
  const now = new Date();

  // 1. 예약 시간이 된 작업 조회
  const scheduleSql = getSql('automation', 'getPendingSchedules');
  const schedules = await db.prepare(scheduleSql).all(now);

  for (const schedule of schedules) {
    const { task_id, user_id } = schedule;

    // 2. 큐에 이미 등록되었는지 확인
    const queueSql = getSql('automation', 'getTaskQueue');
    const existing = await db.prepare(queueSql).get(task_id, 'script');

    if (!existing) {
      // 3. 큐에 등록
      const insertSql = getSql('automation', 'insertTaskQueue');
      await db.prepare(insertSql).run(task_id, 'script', 'waiting', user_id);

      // 4. scheduled_time 제거
      const updateTimeSql = getSql('automation', 'updateTaskScheduledTime');
      await db.prepare(updateTimeSql).run(task_id);

      console.log(`✅ Task ${task_id} queued for processing`);
    }
  }
}
