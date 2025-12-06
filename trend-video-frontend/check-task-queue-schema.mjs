import mysql from 'mysql2/promise';

const connection = await mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: 'trend2024',
  database: 'trend_video'
});

try {
  console.log('\n📊 task_queue 테이블 현황 분석\n');
  console.log('='.repeat(80) + '\n');

  // 1. 현재 스키마 확인
  console.log('1️⃣  현재 PRIMARY KEY 확인:\n');
  const [keys] = await connection.execute(`
    SHOW KEYS FROM task_queue WHERE Key_name = 'PRIMARY'
  `);
  console.table(keys);

  // 2. 현재 데이터 확인 - task_id별 type 개수
  console.log('\n2️⃣  task_id별 type 개수 (같은 task_id에 여러 type이 있는지?):\n');
  const [typeCounts] = await connection.execute(`
    SELECT task_id, COUNT(DISTINCT type) as type_count, GROUP_CONCAT(type ORDER BY type) as types
    FROM task_queue
    GROUP BY task_id
    HAVING type_count > 1
    ORDER BY type_count DESC
    LIMIT 10
  `);

  if (typeCounts.length > 0) {
    console.log('⚠️  같은 task_id에 여러 type이 있는 레코드들:');
    console.table(typeCounts);
    console.log('\n❌ 현재 PRIMARY KEY(task_id)로는 이런 데이터를 저장할 수 없습니다!');
  } else {
    console.log('✅ 현재는 각 task_id당 하나의 type만 존재합니다.');
    console.log('   (이것은 버그! 각 task는 script→image→video→youtube 4단계를 가져야 함)\n');
  }

  // 3. 전체 task_queue 레코드 수
  const [counts] = await connection.execute(`
    SELECT type, status, COUNT(*) as count
    FROM task_queue
    GROUP BY type, status
    ORDER BY type, status
  `);

  console.log('\n3️⃣  task_queue 현황 (type별, status별):\n');
  console.table(counts);

  // 4. 스키마 변경이 필요한 이유
  console.log('\n📖 문제점:\n');
  console.log('❌ 현재: task_id만 PRIMARY KEY');
  console.log('   → 같은 task_id로 script, image, video, youtube 큐를 각각 만들 수 없음!');
  console.log('\n✅ 필요: (task_id, type)를 PRIMARY KEY로 변경');
  console.log('   → 한 task가 script→image→video→youtube 단계별로 진행 가능\n');

  console.log('🔧 해결 방법:');
  console.log('   1. PRIMARY KEY를 task_id에서 (task_id, type)로 변경');
  console.log('   2. 기존 INDEX idx_task_queue_task_id는 불필요 (PRIMARY KEY에 포함됨)\n');

} catch (error) {
  console.error('❌ 에러:', error.message);
} finally {
  await connection.end();
}
