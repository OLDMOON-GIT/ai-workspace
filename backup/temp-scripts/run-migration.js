const mysql = require('mysql2/promise');

(async () => {
  const conn = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'trend2024',
    database: 'trend_video'
  });

  console.log('🔄 Starting database migration...');

  // Add youtube_channel column
  try {
    await conn.execute('ALTER TABLE content ADD COLUMN youtube_channel VARCHAR(255) AFTER youtube_url');
    console.log('✅ Added youtube_channel column to content table');
  } catch (e) {
    if (e.errno === 1060) {
      console.log('ℹ️  youtube_channel column already exists');
    } else {
      throw e;
    }
  }

  // Add media_mode column
  try {
    await conn.execute("ALTER TABLE content_setting ADD COLUMN media_mode VARCHAR(100) DEFAULT 'crawl' AFTER script_mode");
    console.log('✅ Added media_mode column to content_setting table');
  } catch (e) {
    if (e.errno === 1060) {
      console.log('ℹ️  media_mode column already exists');
    } else {
      throw e;
    }
  }

  await conn.end();
  console.log('✅ Migration completed successfully!');
})().catch(err => {
  console.error('❌ Migration failed:', err);
  process.exit(1);
});
