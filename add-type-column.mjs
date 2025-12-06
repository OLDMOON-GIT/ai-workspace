#!/usr/bin/env node
import mysql from 'mysql2/promise';

const conn = await mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: 'trend2024',
  database: 'trend_video'
});

try {
  console.log('Adding type column to bugs table...');

  await conn.execute(`
    ALTER TABLE bugs
    ADD COLUMN type ENUM('bug', 'spec') DEFAULT 'bug' AFTER id
  `);

  console.log('✅ type 컬럼 추가 완료!');
  console.log('   - ENUM("bug", "spec")');
  console.log('   - DEFAULT "bug"');
} catch (error) {
  if (error.code === 'ER_DUP_FIELDNAME') {
    console.log('⚠️  type 컬럼이 이미 존재합니다.');
  } else {
    console.error('❌ Error:', error.message);
    throw error;
  }
}

await conn.end();
