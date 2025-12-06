import { getAll } from './trend-video-frontend/src/lib/mysql.js';

try {
  const results = await getAll(`
    SELECT
      tq.task_id,
      tq.type,
      tq.status,
      tq.error,
      c.title,
      c.youtube_url
    FROM task_queue tq
    LEFT JOIN content c ON tq.task_id = c.content_id
    WHERE tq.type = 'youtube'
    ORDER BY tq.updated_at DESC
    LIMIT 5
  `, []);

  console.log('\n최근 YouTube 태스크 상태:\n');
  results.forEach(r => {
    console.log(`Task: ${r.task_id}`);
    console.log(`  Title: ${r.title || 'N/A'}`);
    console.log(`  Status: ${r.status}`);
    console.log(`  Error: ${r.error || 'N/A'}`);
    console.log(`  YouTube URL: ${r.youtube_url || 'N/A'}`);
    console.log('');
  });
} catch (error) {
  console.error('Error:', error);
}
