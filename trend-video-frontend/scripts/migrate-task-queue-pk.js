/**
 * task_queue 테이블 PK 마이그레이션
 *
 * 변경사항:
 * - PRIMARY KEY (task_id, type) → PRIMARY KEY (task_id)
 * - 하나의 task는 하나의 row만 가짐
 * - type과 status가 phase에 따라 변경됨
 */

const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(process.cwd(), 'data', 'database.sqlite');

function migrateTaskQueue() {
  const db = new Database(dbPath);

  try {
    console.log('🚀 task_queue 마이그레이션 시작');

    // 1. 기존 데이터 백업
    console.log('📦 기존 데이터 백업 중...');
    db.exec(`
      CREATE TABLE IF NOT EXISTS task_queue_backup AS
      SELECT * FROM task_queue;
    `);
    const backupCount = db.prepare('SELECT COUNT(*) as count FROM task_queue_backup').get().count;
    console.log(`✅ ${backupCount}개 row 백업 완료`);

    // 2. 기존 테이블 삭제
    console.log('🗑️ 기존 task_queue 테이블 삭제 중...');
    db.exec('DROP TABLE IF EXISTS task_queue');

    // 3. 새 스키마로 테이블 재생성 (PK: task_id만)
    console.log('📝 새 스키마로 task_queue 테이블 생성 중...');
    db.exec(`
      CREATE TABLE task_queue (
        task_id TEXT PRIMARY KEY NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('schedule', 'script', 'image', 'video', 'youtube')),
        status TEXT NOT NULL CHECK(status IN ('waiting', 'processing', 'completed', 'failed', 'cancelled')),
        priority INTEGER DEFAULT 0,
        created_at TEXT NOT NULL,
        started_at TEXT,
        completed_at TEXT,
        user_id TEXT NOT NULL,
        error TEXT
      );
    `);

    // 4. 인덱스 재생성
    console.log('🔍 인덱스 생성 중...');
    db.exec(`
      CREATE INDEX idx_task_queue_type_status_priority ON task_queue(type, status, priority DESC, created_at ASC);
      CREATE INDEX idx_task_queue_user_status ON task_queue(user_id, status);
    `);

    // 5. 백업 데이터 복원 (task_id별로 최신 row만)
    console.log('📥 데이터 복원 중 (task_id별 최신 row만)...');

    // task_id별로 가장 최근 created_at을 가진 row만 복원
    const result = db.exec(`
      INSERT INTO task_queue (
        task_id, type, status, priority, created_at, started_at, completed_at,
        user_id, error
      )
      SELECT
        task_id, type, status, priority, created_at, started_at, completed_at,
        user_id, error
      FROM task_queue_backup
      WHERE (task_id, created_at) IN (
        SELECT task_id, MAX(created_at)
        FROM task_queue_backup
        GROUP BY task_id
      );
    `);

    const restoredCount = db.prepare('SELECT COUNT(*) as count FROM task_queue').get().count;
    console.log(`✅ ${restoredCount}개 row 복원 완료`);

    // 6. 백업 테이블 유지 (안전을 위해)
    console.log('💾 백업 테이블 유지 (task_queue_backup)');

    console.log('\n✅ 마이그레이션 완료!');
    console.log('📊 결과:');
    console.log(`   - 백업: ${backupCount}개 row`);
    console.log(`   - 복원: ${restoredCount}개 row`);
    console.log(`   - PK 변경: (task_id, type) → task_id`);
    console.log('\n⚠️ 백업 테이블(task_queue_backup)은 안전을 위해 유지됩니다.');
    console.log('   문제 없으면 나중에 삭제하세요: DROP TABLE task_queue_backup;');

  } catch (error) {
    console.error('❌ 마이그레이션 실패:', error);

    // 롤백 시도
    console.log('🔄 롤백 시도 중...');
    try {
      db.exec('DROP TABLE IF EXISTS task_queue');
      db.exec('ALTER TABLE task_queue_backup RENAME TO task_queue');
      console.log('✅ 롤백 완료');
    } catch (rollbackError) {
      console.error('❌ 롤백 실패:', rollbackError);
      console.error('⚠️ 수동으로 task_queue_backup을 확인하세요!');
    }

    throw error;
  } finally {
    db.close();
  }
}

// 실행
if (require.main === module) {
  migrateTaskQueue();
}

module.exports = { migrateTaskQueue };
