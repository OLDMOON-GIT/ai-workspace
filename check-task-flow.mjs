import mysql from 'mysql2/promise';

const taskId = '77fb7660-56a7-47d9-bd46-cd35b4180b64';

const connection = await mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: 'trend2024',
  database: 'trend_video'
});

try {
  console.log(`\n📊 Task Queue 진행 상황: ${taskId}\n`);
  console.log('='.repeat(80) + '\n');

  // 1. task_queue 모든 레코드 조회 (진행 이력)
  const [queues] = await connection.execute(`
    SELECT task_id, type, status, created_at, error
    FROM task_queue
    WHERE task_id = ?
    ORDER BY created_at ASC
  `, [taskId]);

  if (queues.length === 0) {
    console.log('❌ task_queue에 레코드가 없습니다.');
    console.log('   → 아직 시작되지 않은 task (scheduled_time 대기 중일 수 있음)\n');
  } else {
    console.log(`📋 Task Queue 진행 이력 (${queues.length}개 단계):\n`);
    console.table(queues);
  }

  // 2. content 상태 확인
  const [content] = await connection.execute(`
    SELECT content_id, title, status, prompt_format, youtube_url, error
    FROM content
    WHERE content_id = ?
  `, [taskId]);

  if (content.length > 0) {
    console.log('\n📄 Content 상태:\n');
    console.table(content);
  }

  // 3. task 스케줄 정보
  const [task] = await connection.execute(`
    SELECT task_id, scheduled_time, created_at
    FROM task
    WHERE task_id = ?
  `, [taskId]);

  if (task.length > 0) {
    console.log('\n⏰ Task 스케줄 정보:\n');
    console.table(task);
  }

  // 4. task_time_log 조회 (각 단계별 소요 시간)
  const [timeLogs] = await connection.execute(`
    SELECT type, retry_cnt, start_time, end_time,
           TIMESTAMPDIFF(SECOND, start_time, end_time) as elapsed_seconds
    FROM task_time_log
    WHERE task_id = ?
    ORDER BY start_time ASC
  `, [taskId]);

  if (timeLogs.length > 0) {
    console.log('\n⏱️  각 단계별 소요 시간:\n');
    console.table(timeLogs);
  }

  console.log('\n' + '='.repeat(80));
  console.log('\n📖 Task Queue 동작 원리:\n');
  console.log('1️⃣  script waiting → processing → completed → (INSERT) image waiting');
  console.log('2️⃣  image waiting → processing → completed → (INSERT) video waiting');
  console.log('3️⃣  video waiting → processing → completed → (INSERT) youtube waiting');
  console.log('4️⃣  youtube waiting → processing → completed (최종 완료)\n');
  console.log('✅ 각 단계는 독립된 task_queue 레코드로 존재합니다!');
  console.log('✅ 이전 단계가 completed되면 다음 단계 큐가 자동 생성됩니다.\n');

} catch (error) {
  console.error('❌ 에러:', error.message);
} finally {
  await connection.end();
}
