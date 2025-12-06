/**
 * ⛔⛔⛔ DEPRECATED - DO NOT USE ⛔⛔⛔
 *
 * 이 스크립트는 SQLite 시절의 마이그레이션입니다.
 * MySQL로 전환 후 더 이상 사용하지 않습니다.
 *
 * Original description:
 * Task 중심 구조로 마이그레이션
 *
 * 기존: video_titles → task_schedules (1:1)
 * 신규: automation_tasks (메인) → task_schedules (1:N)
 *
 * 사용법: node scripts/migrate-to-task-centric.js
 */

throw new Error('⛔ DEPRECATED: This SQLite migration script is no longer used. Use schema-mysql.sql instead.');

const Database = require('better-sqlite3');
const path = require('path');

// 스크립트가 scripts/ 폴더에 있으므로 상위 디렉토리로 이동
const dbPath = path.join(__dirname, '..', 'data', 'database.sqlite');
const db = new Database(dbPath);

console.log('🔄 Migrating to task-centric structure...');

// 1. automation_tasks 테이블 생성 (메인)
console.log('1. Creating automation_tasks table...');
db.exec(`
  CREATE TABLE IF NOT EXISTS automation_tasks (
    task_id TEXT PRIMARY KEY,
    user_id TEXT,
    title_id TEXT,
    title TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('shortform', 'longform', 'product', 'product-info', 'sora2')),
    category TEXT,
    tags TEXT,
    product_url TEXT,
    product_data TEXT,
    channel TEXT,
    script_mode TEXT DEFAULT 'chrome',
    media_mode TEXT DEFAULT 'upload',
    model TEXT DEFAULT 'claude',
    youtube_schedule TEXT DEFAULT 'immediate',
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'processing', 'completed', 'failed', 'cancelled', 'waiting_for_upload')),
    script_id TEXT,
    video_id TEXT,
    error TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// 인덱스 생성
try {
  db.exec(`CREATE INDEX IF NOT EXISTS idx_automation_tasks_status ON automation_tasks(status);`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_automation_tasks_user_id ON automation_tasks(user_id);`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_automation_tasks_title_id ON automation_tasks(title_id);`);
} catch (e) {
  // 이미 존재하면 무시
}

// 2. 새로운 task_schedules 테이블 (task에 종속, 1:N)
console.log('2. Creating new task_schedules table...');

// 기존 task_schedules를 백업
const hasOldSchedules = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='task_schedules'`).get();
if (hasOldSchedules) {
  console.log('   Backing up old task_schedules...');
  db.exec(`ALTER TABLE task_schedules RENAME TO task_schedules_old;`);
}

// 새 task_schedules 생성
db.exec(`
  CREATE TABLE IF NOT EXISTS task_schedules (
    task_id TEXT NOT NULL,
    schedule_id TEXT NOT NULL,
    scheduled_time DATETIME NOT NULL,
    youtube_publish_time DATETIME,
    youtube_privacy TEXT DEFAULT 'public',
    youtube_url TEXT,
    channel_setting_id TEXT,
    youtube_upload_id TEXT,
    shortform_task_id TEXT,
    shortform_uploaded INTEGER DEFAULT 0,
    parent_youtube_url TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (task_id, schedule_id),
    FOREIGN KEY (task_id) REFERENCES automation_tasks(task_id) ON DELETE CASCADE
  );
`);

// 인덱스 생성
try {
  db.exec(`CREATE INDEX IF NOT EXISTS idx_task_schedules_scheduled_time ON task_schedules(scheduled_time);`);
} catch (e) {
  // 이미 존재하면 무시
}

// 3. 데이터 마이그레이션: video_titles + task_schedules_old → automation_tasks + task_schedules
console.log('3. Migrating data from video_titles and task_schedules_old...');

if (hasOldSchedules) {
  try {
    // video_titles에서 tasks로 마이그레이션
    const videoTitles = db.prepare(`SELECT * FROM video_titles`).all();

    console.log(`   Found ${videoTitles.length} video titles to migrate`);

    for (const title of videoTitles) {
      // task_id 생성
      const taskId = `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // tasks에 삽입
      db.prepare(`
        INSERT OR IGNORE INTO automation_tasks (
          task_id, user_id, title_id, title, type, category, tags,
          product_url, product_data, channel, script_mode, media_mode,
          model, youtube_schedule, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        taskId,
        title.user_id,
        title.id, // title_id (레거시 호환)
        title.title,
        title.type,
        title.category,
        title.tags,
        title.product_url,
        title.product_data,
        title.channel,
        title.script_mode || 'chrome',
        title.media_mode || 'upload',
        title.model || 'claude',
        title.youtube_schedule || 'immediate',
        title.status || 'pending',
        title.created_at,
        title.updated_at
      );

      // 해당 title의 스케줄들을 찾아서 task_schedules에 삽입
      const oldSchedules = db.prepare(`SELECT * FROM task_schedules_old WHERE title_id = ?`).all(title.id);

      for (const oldSchedule of oldSchedules) {
        db.prepare(`
          INSERT OR IGNORE INTO task_schedules (
            task_id, schedule_id, scheduled_time, youtube_publish_time,
            youtube_privacy, youtube_url, channel_setting_id, youtube_upload_id,
            shortform_task_id, shortform_uploaded, parent_youtube_url,
            created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          taskId,
          oldSchedule.id, // schedule_id
          oldSchedule.scheduled_time,
          oldSchedule.youtube_publish_time,
          oldSchedule.youtube_privacy || 'public',
          oldSchedule.youtube_url,
          oldSchedule.channel_setting_id,
          oldSchedule.youtube_upload_id,
          oldSchedule.shortform_task_id,
          oldSchedule.shortform_uploaded || 0,
          oldSchedule.parent_youtube_url,
          oldSchedule.created_at,
          oldSchedule.updated_at
        );

        // automation_tasks 테이블에 script_id, video_id 업데이트 (스케줄에서 가져옴)
        if (oldSchedule.script_id) {
          db.prepare(`UPDATE automation_tasks SET script_id = ? WHERE task_id = ?`).run(oldSchedule.script_id, taskId);
        }
        if (oldSchedule.video_id) {
          db.prepare(`UPDATE automation_tasks SET video_id = ? WHERE task_id = ?`).run(oldSchedule.video_id, taskId);
        }
      }

      // 스케줄이 없는 경우 기본 스케줄 생성
      if (oldSchedules.length === 0) {
        const scheduleId = `schedule_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const now = new Date().toISOString().replace('T', ' ').slice(0, 19);

        db.prepare(`
          INSERT OR IGNORE INTO task_schedules (
            task_id, schedule_id, scheduled_time, youtube_privacy, created_at, updated_at
          ) VALUES (?, ?, ?, 'public', ?, ?)
        `).run(taskId, scheduleId, now, now, now);
      }
    }

    console.log(`   ✅ Migrated ${videoTitles.length} tasks`);
  } catch (e) {
    console.error(`   ❌ Migration error: ${e.message}`);
  }
}

// 4. tasks_queue는 이미 올바른 구조 (task_id + type 복합키)
console.log('4. tasks_queue table is already correct (task_id + type)');

// 5. 결과 확인
console.log('\n📊 Migration Results:');
const tasksCount = db.prepare('SELECT COUNT(*) as cnt FROM automation_tasks').get();
const schedulesCount = db.prepare('SELECT COUNT(*) as cnt FROM task_schedules').get();
const queueCount = db.prepare('SELECT COUNT(*) as cnt FROM tasks_queue').get();

console.log(`   automation_tasks: ${tasksCount.cnt} records`);
console.log(`   task_schedules: ${schedulesCount.cnt} records`);
console.log(`   tasks_queue: ${queueCount.cnt} records`);

db.close();
console.log('\n✅ Migration complete!');
console.log('\n⚠️  Old tables backed up as:');
console.log('   - task_schedules_old');
console.log('   - video_titles (kept for reference)');
console.log('\n💡 After verification, you can drop old tables with:');
console.log('   DROP TABLE task_schedules_old;');
console.log('   DROP TABLE video_titles;');
