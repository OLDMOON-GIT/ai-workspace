#!/usr/bin/env node
/**
 * 알림 워커 (EDA 버전) - BTS-3190
 *
 * 폴링 대신 이벤트 구독 방식으로 버그/SPEC 알림
 * Redis 미연결 시 기존 폴링 방식으로 폴백
 */

process.title = 'NotifyWorker-EDA';

const mysql = require('mysql2/promise');
const eventBus = require('./event-bus.cjs');

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'trend2024',
  database: process.env.DB_NAME || 'trend_video'
};

const MY_PID = process.pid;
const MY_WORKER_ID = `worker-${MY_PID}`;

// 알림 출력 함수
function notifyBug(bug) {
  const statusIcon = bug.type === 'spec' ? '📋' : '🐛';
  console.log(`\n[${new Date().toLocaleTimeString()}] ${statusIcon} 새 ${bug.type === 'spec' ? 'SPEC' : '버그'} 생성!`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  ID: BTS-${bug.bugId}`);
  console.log(`  제목: ${bug.title}`);
  console.log(`  우선순위: ${bug.priority}`);
  if (bug.source) console.log(`  출처: ${bug.source}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('💡 확인: http://localhost:2000/admin/bts');
  console.log('');
}

function notifyBugUpdate(bug) {
  const statusIcon =
    bug.status === 'resolved' ? '✅' :
    bug.status === 'in_progress' ? '🔄' :
    bug.status === 'wontfix' ? '🚫' : '📝';

  console.log(`\n[${new Date().toLocaleTimeString()}] ${statusIcon} 버그 상태 변경`);
  console.log(`  ID: BTS-${bug.bugId} → ${bug.status}`);
  if (bug.assignedTo) console.log(`  담당: ${bug.assignedTo}`);
  console.log('');
}

// 이벤트 구독 핸들러
async function handleBugCreated(payload) {
  notifyBug(payload);
}

async function handleSpecCreated(payload) {
  notifyBug({ ...payload, type: 'spec' });
}

async function handleBugUpdated(payload) {
  notifyBugUpdate(payload);
}

// 폴백: 폴링 방식
async function getBugs() {
  let connection;
  try {
    connection = await mysql.createConnection(dbConfig);
    const [rows] = await connection.execute(`
      SELECT id, title, summary, status, type, priority, log_path,
             created_at, updated_at, assigned_to
      FROM bugs
      WHERE status = 'open'
      ORDER BY priority ASC, created_at ASC
      LIMIT 20
    `);
    return rows;
  } finally {
    if (connection) await connection.end();
  }
}

async function pollingFallback() {
  console.log('⚠️  폴링 모드로 동작 (10초 간격)');
  let lastBugCount = 0;

  while (true) {
    try {
      const bugs = await getBugs();
      const currentCount = bugs.length;

      if (currentCount !== lastBugCount) {
        if (currentCount > 0) {
          console.log(`\n[${new Date().toLocaleTimeString()}] 🚨 미해결 버그: ${currentCount}건`);
          bugs.slice(0, 5).forEach(bug => {
            const icon = bug.type === 'spec' ? '📋' : '🐛';
            console.log(`  ${icon} BTS-${bug.id}: ${bug.title} (${bug.priority})`);
          });
        } else {
          console.log(`\n[${new Date().toLocaleTimeString()}] ✅ 모든 버그 처리 완료!`);
        }
      } else {
        process.stdout.write(`\r[${new Date().toLocaleTimeString()}] 🔄 모니터링 중... (${currentCount}건)`);
      }

      lastBugCount = currentCount;
    } catch (error) {
      console.error(`\n❌ DB 조회 실패:`, error.message);
    }

    await new Promise(r => setTimeout(r, 10000));
  }
}

// 메인
async function main() {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log(`║  🔔 버그 알림 워커 EDA (PID: ${MY_PID})`.padEnd(63) + '║');
  console.log('║           Mode: Event-Driven (Redis + Bull Queue)            ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('');

  try {
    // Redis 연결 시도
    await eventBus.initEventBus();

    if (eventBus.isInitialized()) {
      console.log('✅ Redis 연결됨 - 이벤트 구독 모드');
      console.log('');

      // 이벤트 구독
      eventBus.subscribeEvent('bug.created', handleBugCreated);
      eventBus.subscribeEvent('spec.created', handleSpecCreated);
      eventBus.subscribeEvent('bug.updated', handleBugUpdated);

      console.log('');
      console.log('👂 이벤트 대기 중... (Ctrl+C로 종료)');
      console.log('────────────────────────────────────────────────────────────────');
      console.log('');

      // 프로세스 유지
      await new Promise(() => {});
    } else {
      // Redis 없으면 폴링 폴백
      await pollingFallback();
    }
  } catch (error) {
    console.log('⚠️  Redis 연결 실패, 폴링 모드로 전환');
    await pollingFallback();
  }
}

// 종료 처리
process.on('SIGINT', async () => {
  console.log('\n\n🛑 종료 중...');
  await eventBus.closeEventBus();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await eventBus.closeEventBus();
  process.exit(0);
});

main().catch(console.error);
