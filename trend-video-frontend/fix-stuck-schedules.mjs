import mysql from 'mysql2/promise';

const pool = mysql.createPool({
  host: 'localhost',
  user: 'root',
  password: 'trend2024',
  database: 'trend_video',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

async function fixStuckSchedules() {
  try {
    console.log('=== 막힌 schedule 큐 확인 ===\n');

    // 1. 시간이 지난 schedule 큐 조회
    const [schedules] = await pool.query(`
      SELECT q.task_id, q.type, q.status, t.scheduled_time,
             c.title, c.youtube_channel
      FROM task_queue q
      JOIN task t ON q.task_id = t.task_id
      LEFT JOIN content c ON q.task_id = c.content_id
      WHERE q.type = 'schedule'
        AND q.status = 'waiting'
        AND t.scheduled_time <= NOW()
      ORDER BY t.scheduled_time ASC
    `);

    if (schedules.length === 0) {
      console.log('✅ 시간이 지난 schedule 큐가 없습니다.');
      return;
    }

    console.log(`⚠️ ${schedules.length}개의 시간 지난 schedule 큐 발견:\n`);
    console.table(schedules);

    console.log('\n=== schedule → script 전환 시작 ===\n');

    // 2. schedule → script로 변경
    for (const schedule of schedules) {
      try {
        await pool.query(`
          UPDATE task_queue
          SET type = 'script', status = 'waiting'
          WHERE task_id = ?
        `, [schedule.task_id]);

        console.log(`✅ ${schedule.task_id}: "${schedule.title}" → script 전환 완료`);
      } catch (error) {
        console.error(`❌ ${schedule.task_id} 전환 실패:`, error.message);
      }
    }

    console.log(`\n✅ 총 ${schedules.length}개의 schedule → script 전환 완료`);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

fixStuckSchedules();
