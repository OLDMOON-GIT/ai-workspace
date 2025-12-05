#!/usr/bin/env node
const mysql = require('mysql2/promise');

(async () => {
  const conn = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'trend2024',
    database: 'trend_video'
  });

  const [rows] = await conn.execute(`
    SELECT id, title, summary, type, priority, status, assigned_to
    FROM bugs
    WHERE status != 'resolved' AND status != 'closed'
    ORDER BY priority ASC, created_at ASC
    LIMIT 20
  `);

  console.log(`\n미해결 버그/SPEC ${rows.length}건:\n`);
  rows.forEach((b, idx) => {
    const typeIcon = b.type === 'spec' ? '📋' : '🐛';
    const statusIcon = b.assigned_to ? '🔒' : '⭕';
    const assignedInfo = b.assigned_to ? ` [${b.assigned_to}]` : '';
    console.log(`${statusIcon} ${typeIcon} [${b.priority}] ${b.id}: ${b.title}${assignedInfo}`);
  });

  console.log(`\n⭕ = 미할당 (작업 가능), 🔒 = 작업 중`);

  await conn.end();
})();
