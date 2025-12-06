import mysql from 'mysql2/promise';

const connection = await mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: 'trend2024',
  database: 'trend_video'
});

try {
  console.log('\n🔧 task_queue PRIMARY KEY 변경: task_id → (task_id, type)\n');
  console.log('='.repeat(80) + '\n');

  // 1. 현재 PRIMARY KEY 제거
  console.log('1️⃣  기존 PRIMARY KEY 제거...');
  await connection.execute(`
    ALTER TABLE task_queue
    DROP PRIMARY KEY
  `);
  console.log('   ✅ PRIMARY KEY(task_id) 제거 완료\n');

  // 2. 새로운 PRIMARY KEY 생성 (task_id, type)
  console.log('2️⃣  새로운 PRIMARY KEY (task_id, type) 추가...');
  await connection.execute(`
    ALTER TABLE task_queue
    ADD PRIMARY KEY (task_id, type)
  `);
  console.log('   ✅ PRIMARY KEY(task_id, type) 추가 완료\n');

  // 3. 불필요한 INDEX 제거 (task_id는 이제 PRIMARY KEY에 포함됨)
  console.log('3️⃣  불필요한 INDEX 제거...');
  try {
    await connection.execute(`
      ALTER TABLE task_queue
      DROP INDEX idx_task_queue_task_id
    `);
    console.log('   ✅ idx_task_queue_task_id 제거 완료\n');
  } catch (err) {
    if (err.code === 'ER_CANT_DROP_FIELD_OR_KEY') {
      console.log('   ℹ️  idx_task_queue_task_id가 이미 없습니다.\n');
    } else {
      throw err;
    }
  }

  // 4. 변경 결과 확인
  console.log('4️⃣  변경 결과 확인:\n');
  const [keys] = await connection.execute(`
    SHOW KEYS FROM task_queue WHERE Key_name = 'PRIMARY'
  `);

  console.log('   새로운 PRIMARY KEY:');
  keys.forEach(key => {
    console.log(`   - ${key.Column_name} (Seq: ${key.Seq_in_index})`);
  });

  console.log('\n✅ 마이그레이션 완료!\n');
  console.log('📖 이제 한 task_id에 여러 type (script, image, video, youtube) 큐를 생성할 수 있습니다.\n');

} catch (error) {
  console.error('❌ Migration error:', error.message);
  console.error('   Code:', error.code);
} finally {
  await connection.end();
}
