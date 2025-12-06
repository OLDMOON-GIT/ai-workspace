import mysql from 'mysql2/promise';

const connection = await mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: 'trend2024',
  database: 'trend_video'
});

try {
  console.log('\n🔧 Adding \'waiting\' to content.status ENUM...\n');

  await connection.execute(`
    ALTER TABLE content
    MODIFY COLUMN status ENUM('draft', 'pending', 'processing', 'waiting', 'completed', 'failed') DEFAULT 'pending'
  `);

  console.log('✅ Schema migration completed!\n');
  console.log('📊 Updated ENUM values:');
  console.log('   - draft      ← 기존 데이터 유지');
  console.log('   - pending');
  console.log('   - processing');
  console.log('   - waiting    ← 새로 추가됨!');
  console.log('   - completed');
  console.log('   - failed\n');

} catch (error) {
  console.error('❌ Migration error:', error.message);
} finally {
  await connection.end();
}
