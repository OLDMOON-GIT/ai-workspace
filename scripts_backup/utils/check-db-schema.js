const Database = require('./trend-video-frontend/node_modules/better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, 'trend-video-frontend', 'data', 'app.db');

console.log('DB 경로:', DB_PATH);

try {
  const db = new Database(DB_PATH);

  const tables = db.prepare(`
    SELECT name FROM sqlite_master WHERE type='table' ORDER BY name
  `).all();

  console.log('\n📋 테이블 목록:');
  tables.forEach(t => console.log(`  - ${t.name}`));

  if (tables.some(t => t.name === 'jobs')) {
    console.log('\n📊 jobs 테이블 스키마:');
    const jobsSchema = db.prepare(`PRAGMA table_info(jobs)`).all();
    jobsSchema.forEach(col => {
      console.log(`  ${col.name} (${col.type}) ${col.notnull ? 'NOT NULL' : ''} ${col.pk ? 'PRIMARY KEY' : ''}`);
    });
  }

  db.close();
} catch (error) {
  console.error('에러:', error.message);
}
