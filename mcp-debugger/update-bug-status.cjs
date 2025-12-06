#!/usr/bin/env node
const mysql = require('mysql2/promise');

function parseBugId(input) {
  if (!input) return null;
  const cleaned = String(input).trim().replace(/^BTS-/i, '');
  const num = parseInt(cleaned, 10);
  return Number.isNaN(num) ? null : num;
}

function formatBugId(num) {
  return `BTS-${String(num).padStart(7, '0')}`;
}

(async () => {
  const rawBugId = process.argv[2];
  const status = process.argv[3];
  const note = process.argv[4];

  if (!rawBugId || !status) {
    console.error('Usage: node update-bug-status.cjs <bug_id> <status> [note]');
    process.exit(1);
  }

  const numericBugId = parseBugId(rawBugId);
  if (!numericBugId) {
    console.error('Invalid bug_id format. Use BTS-XXXX or a numeric id.');
    process.exit(1);
  }

  const conn = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'trend2024',
    database: 'trend_video'
  });

  await conn.execute(
    `
      UPDATE bugs
      SET status = ?,
          resolution_note = ?,
          updated_at = NOW()
      WHERE id = ?
    `,
    [status, note || null, numericBugId]
  );

  console.log(`??${formatBugId(numericBugId)} updated: status=${status}`);
  if (note) {
    console.log(`   Note: ${note}`);
  }

  await conn.end();
})();
