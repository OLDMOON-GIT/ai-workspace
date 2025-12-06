#!/usr/bin/env node
import mysql from 'mysql2/promise';

const conn = await mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: 'trend2024',
  database: 'trend_video'
});

const [rows] = await conn.execute(`
  SELECT id, type, title, status, created_at
  FROM bugs
  ORDER BY created_at DESC
  LIMIT 20
`);

console.log('최근 등록된 BTS 20개:\n');

rows.forEach(bug => {
  const statusText = bug.status === 'resolved' ? '[RESOLVED]' : bug.status === 'open' ? '[OPEN]' : '[IN_PROGRESS]';
  const typeText = bug.type === 'bug' ? '[BUG]' : '[SPEC]';
  console.log(`${statusText} ${bug.id} ${typeText}`);
  console.log(`  제목: ${bug.title}`);
  console.log(`  등록: ${bug.created_at}`);
  console.log('');
});

await conn.end();
