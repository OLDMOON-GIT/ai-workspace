#!/usr/bin/env node
/**
 * 다음 작업할 버그/SPEC을 조회하고 자동으로 assigned_to 마킹
 * - assigned_to가 NULL인 것만 선택
 * - 선택 시 자동으로 PID 기반 워커 ID로 마킹
 */
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');

// 워커 ID 생성 (PID 기반)
function getWorkerId() {
  const hostname = os.hostname();
  const username = os.userInfo().username;
  const pid = process.pid;
  const shortId = crypto.createHash('md5')
    .update(`${hostname}-${username}-${pid}`)
    .digest('hex').substring(0, 8);
  return `worker-${shortId}`;
}

// Hardcode the project's temporary directory for reliability
const tempOutputDir = 'C:\Users\USER\.gemini\tmp\7fb8ead84a2d2f064f3157e2cb452ab9bc92f01c65b672b94bc3acdef5326cad';
const outputFilePath = path.join(tempOutputDir, 'gemini_next_task.txt');

(async () => {
  let conn;
  let taskOutput = 'NO_TASK'; // Default if no task is found
  const workerId = getWorkerId();

  try {
    fs.writeFileSync(outputFilePath, ''); // Clear the output file before writing

    conn = await mysql.createConnection({
      host: 'localhost',
      user: 'root',
      password: 'trend2024',
      database: 'trend_video'
    });

    // 버그 먼저 조회 (assigned_to가 NULL인 것만)
    let [bugs] = await conn.execute(`
      SELECT id, title, type
      FROM bugs
      WHERE status NOT IN ('resolved', 'closed')
        AND type = 'bug'
        AND assigned_to IS NULL
      ORDER BY priority ASC, created_at ASC
      LIMIT 1
    `);

    if (bugs.length > 0) {
      const task = bugs[0];
      // 자동으로 assigned_to 마킹
      await conn.execute(
        'UPDATE bugs SET assigned_to = ?, status = ?, updated_at = NOW() WHERE id = ?',
        [workerId, 'in_progress', task.id]
      );
      taskOutput = `${task.type}:${task.id}:${task.title}`;
      console.log(`[${workerId}] 버그 ${task.id} 작업 시작: ${task.title}`);
    } else {
      // SPEC 조회 (assigned_to가 NULL인 것만)
      let [specs] = await conn.execute(`
        SELECT id, title, type
        FROM bugs
        WHERE status NOT IN ('resolved', 'closed')
          AND type = 'spec'
          AND assigned_to IS NULL
        ORDER BY priority ASC, created_at ASC
        LIMIT 1
      `);
      if (specs.length > 0) {
        const task = specs[0];
        // 자동으로 assigned_to 마킹
        await conn.execute(
          'UPDATE bugs SET assigned_to = ?, status = ?, updated_at = NOW() WHERE id = ?',
          [workerId, 'in_progress', task.id]
        );
        taskOutput = `${task.type}:${task.id}:${task.title}`;
        console.log(`[${workerId}] SPEC ${task.id} 작업 시작: ${task.title}`);
      }
    }
  } catch (error) {
    taskOutput = `ERROR: ${error.message}`;
  } finally {
    if (conn) {
      await conn.end();
    }
    fs.appendFileSync(outputFilePath, taskOutput); // Append to the cleared file
  }
})();
