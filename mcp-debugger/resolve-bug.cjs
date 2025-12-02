#!/usr/bin/env node
/**
 * 버그 해결 스크립트
 * Usage: node resolve-bug.cjs <bug_id> <resolution_note>
 */

const mysql = require('mysql2/promise');

const dbConfig = {
  host: 'localhost',
  user: 'root',
  password: 'trend2024',
  database: 'trend_video'
};

async function resolveBug(bugId, note) {
  let connection;
  try {
    connection = await mysql.createConnection(dbConfig);

    await connection.execute(`
      UPDATE bugs
      SET status = 'resolved',
          resolution_note = ?,
          updated_at = NOW()
      WHERE id = ?
    `, [note, bugId]);

    console.log(`✅ ${bugId} resolved: ${note}`);

  } catch (error) {
    console.error('❌ 실패:', error.message);
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
