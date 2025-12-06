import mysql from 'mysql2/promise';

const connection = await mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: 'trend2024',
  database: 'trend_video'
});

try {
  console.log('\n🔄 PRIMARY KEY 롤백: (task_id, type) → task_id\n');
  console.log('='.repeat(80) + '\n');

  // 1. 현재 상태 확인
  console.log('1️⃣  현재 중복 레코드 확인 (같은 task_id에 여러 type):\n');
  const [duplicates] = await connection.execute(`
    SELECT task_id, GROUP_CONCAT(type ORDER BY type) as types, COUNT(*) as cnt
    FROM task_queue
    GROUP BY task_id
    HAVING cnt > 1
  `);

  if (duplicates.length > 0) {
    console.table(duplicates);

    // 2. 중복 레코드 정리 (최신 것만 남기고 삭제)
    console.log('\n2️⃣  중복 레코드 정리 (각 task_id당 최신 type만 유지)...\n');
    for (const dup of duplicates) {
      const taskId = dup.task_id;

      // 최신 레코드 확인
      const [latest] = await connection.execute(`
        SELECT type, status, created_at
        FROM task_queue
        WHERE task_id = ?
        ORDER BY created_at DESC
        LIMIT 1
      `, [taskId]);

      console.log(`   Task ${taskId}:`);
      console.log(`   - 유지: ${latest[0].type} (${latest[0].status})`);

      // 나머지 삭제
      await connection.execute(`
        DELETE FROM task_queue
        WHERE task_id = ? AND type != ?
      `, [taskId, latest[0].type]);

      console.log(`   - 삭제: 나머지 type 레코드\n`);
    }
  } else {
    console.log('   ℹ️  중복 레코드 없음\n');
  }

  // 3. PRIMARY KEY 제거
  console.log('3️⃣  기존 PRIMARY KEY (task_id, type) 제거...');
  await connection.execute(`
    ALTER TABLE task_queue
    DROP PRIMARY KEY
  `);
  console.log('   ✅ PRIMARY KEY 제거 완료\n');

  // 4. 새로운 PRIMARY KEY 추가 (task_id만)
  console.log('4️⃣  새로운 PRIMARY KEY (task_id) 추가...');
  await connection.execute(`
    ALTER TABLE task_queue
    ADD PRIMARY KEY (task_id)
  `);
  console.log('   ✅ PRIMARY KEY(task_id) 추가 완료\n');

  // 5. 변경 결과 확인
  console.log('5️⃣  변경 결과 확인:\n');
  const [keys] = await connection.execute(`
    SHOW KEYS FROM task_queue WHERE Key_name = 'PRIMARY'
  `);

  console.log('   새로운 PRIMARY KEY:');
  keys.forEach(key => {
    console.log(`   - ${key.Column_name}`);
  });

  console.log('\n✅ 롤백 완료!\n');

} catch (error) {
  console.error('❌ Rollback error:', error.message);
  console.error('   Code:', error.code);
} finally {
  await connection.end();
}
