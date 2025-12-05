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
  if (!rawBugId) {
    console.error('Usage: node get-bug-detail.cjs <bug_id>');
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

  const [rows] = await conn.execute('SELECT * FROM bugs WHERE id = ?', [numericBugId]);

  if (rows.length === 0) {
    console.log('Bug not found.');
  } else {
    const bug = rows[0];
    console.log(`\nBug ID: ${formatBugId(bug.id)}`);
    console.log(`Title: ${bug.title}`);
    console.log(`Status: ${bug.status}`);
    console.log(`Created: ${bug.created_at}`);
    console.log(`Updated: ${bug.updated_at}`);
    if (bug.assigned_to) console.log(`Assignee: ${bug.assigned_to}`);
    console.log(`\nSummary:\n${bug.summary}`);
    if (bug.metadata) {
      console.log(`\nMetadata:\n${JSON.stringify(bug.metadata, null, 2)}`);
    }
    if (bug.log_path) console.log(`\nLog: ${bug.log_path}`);
    if (bug.resolution_note) console.log(`\nResolution: ${bug.resolution_note}`);
  }

  await conn.end();
})();