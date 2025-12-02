#!/usr/bin/env node
import mysql from 'mysql2/promise';

const conn = await mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: 'trend2024',
  database: 'trend_video'
});

const [rows] = await conn.execute(`
  SELECT id, title, status, log_path, screenshot_path, video_path, trace_path, created_at
  FROM bugs
  WHERE id = 'BTS-0000044'
`);

if (rows.length > 0) {
  console.log('✅ BTS-0000044 found in MySQL:');
  console.log(JSON.stringify(rows[0], null, 2));
} else {
  console.log('❌ BTS-0000044 not found in MySQL');
}

await conn.end();
