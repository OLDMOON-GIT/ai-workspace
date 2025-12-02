// locked_by 컬럼 제거 마이그레이션
import mysql from 'mysql2/promise';

const connection = await mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: 'trend2024',
  database: 'trend_video'
});

try {
  console.log('🔧 Removing locked_by column from task_lock table...');

  // locked_by 컬럼 존재 확인
  const [columns] = await connection.execute(`
    SELECT COLUMN_NAME
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = 'trend_video'
      AND TABLE_NAME = 'task_lock'
      AND COLUMN_NAME = 'locked_by'
  `);

  if (columns.length > 0) {
    // locked_by 컬럼 제거
    await connection.execute('ALTER TABLE task_lock DROP COLUMN locked_by');
    console.log('✅ locked_by column removed successfully!');
  } else {
    console.log('✅ locked_by column does not exist (already removed)');
  }

  // 테이블 구조 확인
  console.log('\n📋 Current task_lock table structure:');
  const [desc] = await connection.execute('DESC task_lock');
  console.table(desc);

  // 모든 락 초기화 (서버 재시작처럼)
  console.log('\n🔄 Releasing all locks...');
  await connection.execute(`
    UPDATE task_lock
    SET lock_task_id = NULL, locked_at = NULL, worker_pid = NULL
  `);
  console.log('✅ All locks released!');

  console.log('\n✅ Migration completed successfully!');

} catch (error) {
  console.error('❌ Migration failed:', error.message);
  process.exit(1);
} finally {
  await connection.end();
}
