import mysql from 'mysql2/promise';

const connection = await mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: 'trend2024',
  database: 'trend_video'
});

console.log('\n🔍 Image 단계 task_queue 상태 확인\n');
console.log('='.repeat(80));

// 최근 image 타입 task_queue 조회 (completed 상태인 것들)
const [imageCompleted] = await connection.execute(`
  SELECT
    task_id,
    type,
    status,
    created_at,
    updated_at
  FROM task_queue
  WHERE type = 'image' AND status = 'completed'
  ORDER BY updated_at DESC
  LIMIT 10
`);

console.log(`\n📊 Image + Completed 상태 레코드: ${imageCompleted.length}개\n`);

if (imageCompleted.length > 0) {
  console.log('⚠️ 문제 발견! 아래 task들이 image + completed 상태입니다:\n');

  for (const row of imageCompleted) {
    console.log(`Task ID: ${row.task_id}`);
    console.log(`  Type: ${row.type}`);
    console.log(`  Status: ${row.status} ❌ (should be waiting for next stage)`);
    console.log(`  Updated: ${row.updated_at}`);

    // content.status도 확인
    const [content] = await connection.execute(`
      SELECT content_id, status FROM content WHERE content_id = ?
    `, [row.task_id]);

    if (content[0]) {
      console.log(`  Content Status: ${content[0].status}`);
    }
    console.log('');
  }
} else {
  console.log('✅ Image + Completed 상태 레코드 없음\n');
}

// 최근 모든 타입별 상태 확인
console.log('='.repeat(80));
console.log('\n📋 최근 task_queue 레코드 (타입별):\n');

const [recent] = await connection.execute(`
  SELECT
    task_id,
    type,
    status,
    updated_at
  FROM task_queue
  ORDER BY updated_at DESC
  LIMIT 20
`);

for (const row of recent) {
  const warning = (row.type !== 'youtube' && row.status === 'completed') ? ' ⚠️ 문제!' : '';
  console.log(`${row.task_id} | ${row.type.padEnd(7)} | ${row.status.padEnd(10)} | ${row.updated_at}${warning}`);
}

console.log('\n' + '='.repeat(80));

await connection.end();
