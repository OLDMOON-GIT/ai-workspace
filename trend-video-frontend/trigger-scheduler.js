#!/usr/bin/env node
/**
 * 수동으로 스케줄러를 트리거하는 스크립트
 * 막힌 스케줄을 강제로 실행합니다.
 */

const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'data', 'database.sqlite');
const db = new Database(dbPath);

console.log('🔍 Checking pending schedules...');

// 현재 시간
const now = new Date();
const nowStr = now.toISOString().slice(0, 19);
console.log(`📅 Current time: ${nowStr}`);

// 대기 중인 스케줄 확인
const pendingSchedules = db.prepare(`
  SELECT
    s.id as schedule_id,
    s.title_id,
    s.scheduled_time,
    s.status as schedule_status,
    t.title,
    t.status as title_status
  FROM task_schedules s
  JOIN video_titles t ON s.title_id = t.id
  WHERE s.status = 'pending'
    AND datetime(s.scheduled_time) <= datetime('now', '+9 hours')
  ORDER BY s.scheduled_time ASC
  LIMIT 5
`).all();

if (pendingSchedules.length === 0) {
  console.log('✅ No pending schedules found');
  db.close();
  process.exit(0);
}

console.log(`\n📋 Found ${pendingSchedules.length} pending schedule(s):\n`);
pendingSchedules.forEach((schedule, index) => {
  console.log(`${index + 1}. Schedule ID: ${schedule.schedule_id}`);
  console.log(`   Title: ${schedule.title}`);
  console.log(`   Scheduled Time: ${schedule.scheduled_time}`);
  console.log(`   Schedule Status: ${schedule.schedule_status}`);
  console.log(`   Title Status: ${schedule.title_status}`);
  console.log('');
});

// video_titles 상태가 'scheduled'인 것을 'pending'으로 변경
const updateCount = db.prepare(`
  UPDATE video_titles
  SET status = 'pending', updated_at = CURRENT_TIMESTAMP
  WHERE id IN (
    SELECT title_id
    FROM task_schedules
    WHERE status = 'pending'
      AND datetime(scheduled_time) <= datetime('now', '+9 hours')
  )
  AND status = 'scheduled'
`).run();

if (updateCount.changes > 0) {
  console.log(`✅ Updated ${updateCount.changes} video_titles from 'scheduled' to 'pending'`);
} else {
  console.log('⚠️ No video_titles needed updating');
}

// 스케줄러가 실행 중인지 확인
console.log('\n🔍 Checking if scheduler is running...');
console.log('⚠️ Please ensure the automation scheduler is enabled in the admin panel');
console.log('📝 The scheduler should pick up these tasks in the next cycle (runs every minute)');

db.close();

console.log('\n✅ Done! The scheduler should process these tasks shortly.');
console.log('💡 If tasks are not processing, check:');
console.log('   1. Is the Next.js server running?');
console.log('   2. Is automation enabled in admin settings?');
console.log('   3. Check server logs for any errors');