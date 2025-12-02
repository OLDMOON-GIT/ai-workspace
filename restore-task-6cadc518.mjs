import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const db = require('./trend-video-frontend/src/lib/sqlite.js').default;

const taskId = '6cadc518-f561-42bd-b60d-7b2b695e1bc3';

try {
  console.log('복구 시작:', taskId);

  // 1. task_queue: type='youtube', status='waiting'
  const queueResult = await db.prepare(`
    UPDATE task_queue
    SET type = ?, status = ?, error = NULL
    WHERE task_id = ?
  `).run('youtube', 'waiting', taskId);

  console.log('task_queue 업데이트:', queueResult);

  // 2. content: status='video'
  const contentResult = await db.prepare(`
    UPDATE content
    SET status = ?
    WHERE content_id = ?
  `).run('video', taskId);

  console.log('content 업데이트:', contentResult);

  // 3. 확인
  const check = await db.prepare(`
    SELECT tq.type, tq.status, c.status as content_status
    FROM task_queue tq
    JOIN content c ON tq.task_id = c.content_id
    WHERE tq.task_id = ?
  `).get(taskId);

  console.log('복구 완료:', check);
  console.log('\n✅ Task 6cadc518 복구 성공!');
  console.log('- task_queue: type=youtube, status=waiting');
  console.log('- content: status=video');

} catch (error) {
  console.error('복구 실패:', error);
  process.exit(1);
}
