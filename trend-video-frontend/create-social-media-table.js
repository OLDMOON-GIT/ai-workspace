const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'data', 'database.sqlite');
const db = new Database(dbPath);

console.log('📝 Creating social_media_accounts table...');

db.exec(`
  CREATE TABLE IF NOT EXISTS social_media_accounts (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    platform TEXT NOT NULL,
    account_id TEXT NOT NULL,
    username TEXT,
    display_name TEXT,
    profile_picture TEXT,
    follower_count INTEGER,
    access_token TEXT,
    refresh_token TEXT,
    token_expires_at TEXT,
    is_default INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_social_media_user_platform
    ON social_media_accounts(user_id, platform);
`);

console.log('✅ social_media_accounts 테이블 생성 완료');

// 테이블 정보 확인
const tableInfo = db.prepare('PRAGMA table_info(social_media_accounts)').all();
console.log('\n=== social_media_accounts 테이블 구조 ===');
tableInfo.forEach(col => {
  console.log(`${col.name} (${col.type})`);
});

db.close();
