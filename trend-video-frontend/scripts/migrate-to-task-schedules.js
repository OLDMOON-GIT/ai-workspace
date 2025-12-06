/**
 * video_schedules -> task_schedules 마이그레이션 스크립트
 *
 * 사용법: node scripts/migrate-to-task-schedules.js
 */

const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(process.cwd(), 'data', 'database.sqlite');
const db = new Database(dbPath);

console.log('🔄 Migrating video_schedules to task_schedules...');

// 1. task_schedules 테이블 생성
console.log('1. Creating task_schedules table...');
db.exec(`
  CREATE TABLE IF NOT EXISTS task_schedules (
    id TEXT PRIMARY KEY,
    task_id TEXT,
    title_id TEXT NOT NULL,
    user_id TEXT,
    scheduled_time DATETIME NOT NULL,
    youtube_publish_time DATETIME,
    youtube_privacy TEXT DEFAULT 'public',
    youtube_url TEXT,
    channel_setting_id TEXT,
    media_mode TEXT DEFAULT 'upload',
    status TEXT DEFAULT 'pending',
    script_id TEXT,
    video_id TEXT,
    youtube_upload_id TEXT,
    error TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// 2. 인덱스 생성
console.log('2. Creating indexes...');
try {
  db.exec(`CREATE INDEX IF NOT EXISTS idx_task_schedules_task_id ON task_schedules(task_id);`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_task_schedules_status ON task_schedules(status);`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_task_schedules_title_id ON task_schedules(title_id);`);
} catch (e) {
  // 이미 존재하면 무시
}

// 3. video_schedules에서 데이터 마이그레이션
console.log('3. Migrating data from video_schedules...');
const hasOldTable = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='video_schedules'`).get();

if (hasOldTable) {
  try {
    const migrated = db.exec(`
      INSERT OR IGNORE INTO task_schedules (
        id, task_id, title_id, user_id, scheduled_time, youtube_publish_time,
        youtube_privacy, youtube_url, channel_setting_id, media_mode,
        status, script_id, video_id, youtube_upload_id, created_at, updated_at
      )
      SELECT
        id, task_id, title_id, NULL, scheduled_time, youtube_publish_time,
        youtube_privacy, youtube_url, channel_setting_id, media_mode,
        status, script_id, video_id, youtube_upload_id, created_at, updated_at
      FROM video_schedules
    `);

    const count = db.prepare('SELECT COUNT(*) as cnt FROM task_schedules').get();
    console.log(`   ✅ Migrated ${count.cnt} records`);
  } catch (e) {
    console.log(`   ⚠️ Migration error (may have different columns): ${e.message}`);

    // 컬럼이 없는 경우 기본 컬럼만으로 마이그레이션
    try {
      db.exec(`
        INSERT OR IGNORE INTO task_schedules (
          id, title_id, scheduled_time, status, created_at, updated_at
        )
        SELECT
          id, title_id, scheduled_time, status, created_at, updated_at
        FROM video_schedules
      `);
      const count = db.prepare('SELECT COUNT(*) as cnt FROM task_schedules').get();
      console.log(`   ✅ Migrated ${count.cnt} records (basic columns only)`);
    } catch (e2) {
      console.error(`   ❌ Failed: ${e2.message}`);
    }
  }
} else {
  console.log('   ℹ️ video_schedules table not found, skipping migration');
}

// 4. tasks_queue 테이블 생성
console.log('4. Creating tasks_queue table...');
db.exec(`
  CREATE TABLE IF NOT EXISTS tasks_queue (
    task_id TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('script', 'image', 'video', 'youtube')),
    status TEXT NOT NULL CHECK(status IN ('waiting', 'processing', 'completed', 'failed')),
    priority INTEGER DEFAULT 0,
    created_at TEXT NOT NULL,
    started_at TEXT,
    completed_at TEXT,
    user_id TEXT,
    metadata TEXT,
    logs TEXT,
    error TEXT,
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    PRIMARY KEY (task_id, type)
  );
`);

// 5. tasks_locks 테이블 생성
console.log('5. Creating tasks_locks table...');
db.exec(`
  CREATE TABLE IF NOT EXISTS tasks_locks (
    task_type TEXT PRIMARY KEY CHECK(task_type IN ('script', 'image', 'video', 'youtube')),
    locked_by TEXT,
    locked_at TEXT,
    worker_pid INTEGER
  );

  INSERT OR IGNORE INTO tasks_locks (task_type, locked_by, locked_at, worker_pid)
  VALUES
    ('script', NULL, NULL, NULL),
    ('image', NULL, NULL, NULL),
    ('video', NULL, NULL, NULL),
    ('youtube', NULL, NULL, NULL);
`);

// 6. 결과 확인
console.log('\n📊 Migration Results:');
const taskSchedulesCount = db.prepare('SELECT COUNT(*) as cnt FROM task_schedules').get();
const tasksQueueCount = db.prepare('SELECT COUNT(*) as cnt FROM tasks_queue').get();
console.log(`   task_schedules: ${taskSchedulesCount.cnt} records`);
console.log(`   tasks_queue: ${tasksQueueCount.cnt} records`);

db.close();
console.log('\n✅ Migration complete!');
