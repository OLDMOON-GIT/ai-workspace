import mysql from 'mysql2/promise';

const connection = await mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: 'trend2024',
  database: 'trend_video'
});

try {
  console.log('\n🔄 content.status ENUM 업데이트: 단계 타입 추가\n');
  console.log('='.repeat(80) + '\n');

  console.log('✅ 추가될 값: script, image, video, youtube\n');

  await connection.execute(`
    ALTER TABLE content
    MODIFY COLUMN status ENUM(
      'draft',
      'pending',
      'processing',
      'waiting',
      'script',
      'image',
      'video',
      'youtube',
      'completed',
      'failed'
    ) DEFAULT 'pending'
  `);

  console.log('✅ content.status ENUM 업데이트 완료!\n');

  // 확인
  const [rows] = await connection.execute(`
    SHOW COLUMNS FROM content LIKE 'status'
  `);

  console.log('📋 업데이트된 ENUM:');
  console.table(rows);

  console.log('\n✅ 마이그레이션 완료!\n');

} catch (error) {
  console.error('❌ Migration error:', error.message);
  console.error('   Code:', error.code);
} finally {
  await connection.end();
}
