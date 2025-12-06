import mysql from 'mysql2/promise';

const pool = mysql.createPool({
  host: '127.0.0.1',
  port: 3306,
  user: 'root',
  password: 'trend2024',
  database: 'trend_video',
});

try {
  console.log('\n🔧 task.status 제거 작업 시작...\n');

  // 현재 상태 확인
  const [columns] = await pool.query(`
    SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = 'trend_video' AND TABLE_NAME = 'task'
  `);

  console.log('현재 task 테이블 컬럼:');
  columns.forEach(c => console.log(`  - ${c.COLUMN_NAME}`));

  const hasStatus = columns.some(c => c.COLUMN_NAME === 'status');

  if (hasStatus) {
    console.log('\n✅ status 컬럼 발견 - 제거 시작...');

    // status 컬럼 삭제
    await pool.query('ALTER TABLE task DROP COLUMN status');
    console.log('  ✓ status 컬럼 제거 완료');

    // 인덱스 삭제
    try {
      await pool.query('ALTER TABLE task DROP INDEX idx_task_status');
      console.log('  ✓ idx_task_status 인덱스 제거 완료');
    } catch (err) {
      console.log('  - idx_task_status 인덱스 없음 (스킵)');
    }
  } else {
    console.log('\n✅ status 컬럼이 이미 없습니다.');
  }

  // 최종 확인
  const [finalColumns] = await pool.query(`
    SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = 'trend_video' AND TABLE_NAME = 'task'
    ORDER BY ORDINAL_POSITION
  `);

  console.log('\n최종 task 테이블 컬럼:');
  finalColumns.forEach(c => console.log(`  - ${c.COLUMN_NAME}`));

  await pool.end();
  console.log('\n✅ 완료!\n');
} catch (error) {
  console.error('❌ Error:', error.message);
  process.exit(1);
}
