#!/usr/bin/env node
/**
 * 알림 워커
 * 10초마다 MySQL bugs 테이블을 확인하고 알림
 */

const mysql = require('mysql2/promise');

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'trend2024',
  database: process.env.DB_NAME || 'trend_video'
};

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function getBugs() {
  let connection;
  try {
    connection = await mysql.createConnection(dbConfig);
    const [rows] = await connection.execute(`
      SELECT id, title, summary, status, log_path, screenshot_path,
             created_at, updated_at, assigned_to, metadata
      FROM bugs
      WHERE status != 'resolved' AND status != 'closed'
      ORDER BY created_at DESC
      LIMIT 20
    `);
    return rows;
  } catch (error) {
    throw error;
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

async function notificationWorker() {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║           🔔 버그 알림 워커 (10초마다 체크)                  ║');
  console.log('║           DB: MySQL trend_video.bugs                         ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log('  Ctrl+C로 종료');
  console.log('');
  console.log('────────────────────────────────────────────────────────────────');
  console.log('');

  let lastBugCount = 0;

  while (true) {
    try {
      const bugs = await getBugs();
      const currentCount = bugs.length;

      if (currentCount > 0) {
        // 개수가 변경되었거나, 버그가 있으면 알림
        if (currentCount !== lastBugCount) {
          console.log(`\n[${new Date().toLocaleTimeString()}] 🚨 미해결 버그: ${currentCount}건`);
          console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

          bugs.slice(0, 5).forEach((bug) => {
            const statusIcon = bug.status === 'open' ? '🔴' :
                             bug.status === 'in-progress' ? '🟡' : '⚪';

            console.log(`${statusIcon} ${bug.id}`);
            console.log(`   📝 ${bug.title}`);
            if (bug.summary) {
              console.log(`   💬 ${bug.summary.substring(0, 80)}...`);
            }
            if (bug.log_path) {
              console.log(`   📄 ${bug.log_path}`);
            }
            if (bug.screenshot_path) {
              console.log(`   📸 ${bug.screenshot_path}`);
            }
            if (bug.assigned_to) {
              console.log(`   👤 담당: ${bug.assigned_to}`);
            }
            console.log('');
          });

          if (currentCount > 5) {
            console.log(`   ... 외 ${currentCount - 5}건 더 있음`);
            console.log('');
          }

          console.log('💡 확인: http://localhost:2000/admin/bugs');
          console.log('');
        } else {
          // 개수가 같으면 조용히 대기
          process.stdout.write(`\r[${new Date().toLocaleTimeString()}] 🔄 모니터링 중... (${currentCount}건 대기)`);
        }
      } else {
        if (lastBugCount > 0) {
          console.log(`\n[${new Date().toLocaleTimeString()}] ✅ 모든 버그 처리 완료!`);
        } else {
          process.stdout.write(`\r[${new Date().toLocaleTimeString()}] ✅ 대기 중 (버그 없음)`);
        }
      }

      lastBugCount = currentCount;

    } catch (error) {
      console.error(`\n[${new Date().toLocaleTimeString()}] ❌ DB 조회 실패:`, error.message);
    }

    // 10초 대기
    await sleep(10000);
  }
}

notificationWorker().catch(console.error);
