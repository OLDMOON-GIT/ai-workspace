#!/usr/bin/env node
/**
 * Bug resolved marker
 * Usage: node resolve-bug.cjs <bug_id> <resolution_note>
 */

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

const dbConfig = {
  host: 'localhost',
  user: 'root',
  password: 'trend2024',
  database: 'trend_video'
};

async function resolveBug(rawBugId, note) {
  const numericBugId = parseBugId(rawBugId);
  if (!numericBugId) {
    console.error('Invalid bug_id format. Use BTS-XXXX or a numeric id.');
    process.exit(1);
  }

  let connection;
  try {
    connection = await mysql.createConnection(dbConfig);

    await connection.execute(
      `
        UPDATE bugs
        SET status = 'resolved',
            resolution_note = ?,
            updated_at = NOW()
        WHERE id = ?
      `,
      [note, numericBugId]
    );

    console.log(`??${formatBugId(numericBugId)} resolved: ${note}`);
  } catch (error) {
    console.error('???낅뜲?댄듃 ?ㅽ뙣:', error.message);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

const bugId = process.argv[2];
const note = process.argv[3] || 'Fixed';

if (!bugId) {
  console.error('Usage: node resolve-bug.cjs <bug_id> <resolution_note>');
  process.exit(1);
}

resolveBug(bugId, note);
