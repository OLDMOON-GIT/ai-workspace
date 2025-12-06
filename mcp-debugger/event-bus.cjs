/**
 * EDA 이벤트 버스 (BTS-3190) - CommonJS 버전
 *
 * Redis 기반 Bull Queue를 사용한 이벤트 발행/구독 시스템
 * 폴링 → 푸시 전환으로 역제어(IoC) 구현
 */

const Queue = require('bull');
const Redis = require('ioredis');

// Redis 연결 설정
const REDIS_CONFIG = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  maxRetriesPerRequest: null,
};

// 큐 인스턴스들
const queues = new Map();

// Redis 클라이언트
let redisClient = null;
let initialized = false;

// 이벤트 타입 목록
const EVENT_TYPES = [
  'bug.created',
  'bug.updated',
  'spec.created',
  'test.failed',
  'test.passed',
  'deploy.triggered',
];

/**
 * Redis 연결 초기화
 */
async function initEventBus() {
  if (initialized) return;

  try {
    redisClient = new Redis(REDIS_CONFIG);

    await new Promise((resolve, reject) => {
      redisClient.on('connect', () => {
        console.log('🔌 [EVENT-BUS] Redis 연결됨');
        resolve();
      });
      redisClient.on('error', (err) => {
        if (!initialized) {
          console.error('❌ [EVENT-BUS] Redis 연결 실패:', err.message);
          reject(err);
        }
      });
      // 2초 타임아웃
      setTimeout(() => reject(new Error('Redis connection timeout')), 2000);
    });

    // 각 이벤트 타입별 큐 생성
    for (const eventType of EVENT_TYPES) {
      const queue = new Queue(eventType, { redis: REDIS_CONFIG });
      queues.set(eventType, queue);
      console.log(`📫 [EVENT-BUS] 큐 생성: ${eventType}`);
    }

    initialized = true;
    console.log('✅ [EVENT-BUS] 초기화 완료');
  } catch (error) {
    console.error('❌ [EVENT-BUS] 초기화 실패:', error.message);
    // Redis 없어도 폴백으로 동작하도록
    initialized = false;
  }
}

/**
 * 이벤트 발행 (Publish)
 */
async function publishEvent(eventType, payload) {
  if (!initialized) {
    console.log(`⚠️ [EVENT-BUS] Redis 미연결, 이벤트 스킵: ${eventType}`);
    return;
  }

  const queue = queues.get(eventType);
  if (!queue) {
    console.error(`❌ [EVENT-BUS] 큐 없음: ${eventType}`);
    return;
  }

  try {
    await queue.add(payload, {
      removeOnComplete: 100,
      removeOnFail: 50,
    });
    console.log(`📤 [EVENT-BUS] 이벤트 발행: ${eventType}`, JSON.stringify(payload).substring(0, 100));
  } catch (error) {
    console.error(`❌ [EVENT-BUS] 발행 실패: ${eventType}`, error.message);
  }
}

/**
 * 이벤트 구독 (Subscribe)
 */
function subscribeEvent(eventType, handler) {
  if (!initialized) {
    console.log(`⚠️ [EVENT-BUS] Redis 미연결, 구독 스킵: ${eventType}`);
    return;
  }

  const queue = queues.get(eventType);
  if (!queue) {
    console.error(`❌ [EVENT-BUS] 큐 없음: ${eventType}`);
    return;
  }

  queue.process(async (job) => {
    console.log(`📥 [EVENT-BUS] 이벤트 수신: ${eventType}`, JSON.stringify(job.data).substring(0, 100));
    try {
      await handler(job.data);
    } catch (error) {
      console.error(`❌ [EVENT-BUS] 핸들러 에러: ${eventType}`, error.message);
      throw error;
    }
  });

  console.log(`👂 [EVENT-BUS] 구독 등록: ${eventType}`);
}

/**
 * 이벤트 버스 종료
 */
async function closeEventBus() {
  for (const [eventType, queue] of queues) {
    await queue.close();
  }
  if (redisClient) {
    await redisClient.quit();
  }
  initialized = false;
  console.log('🔌 [EVENT-BUS] 종료 완료');
}

/**
 * 초기화 상태 확인
 */
function isInitialized() {
  return initialized;
}

// 편의 함수들

async function emitBugCreated(bug) {
  await publishEvent('bug.created', {
    bugId: bug.id,
    title: bug.title,
    type: bug.type || 'bug',
    priority: bug.priority || 'P2',
    source: bug.source,
    timestamp: new Date().toISOString(),
  });
}

async function emitSpecCreated(spec) {
  await publishEvent('spec.created', {
    bugId: spec.id,
    title: spec.title,
    type: 'spec',
    priority: spec.priority || 'P2',
    source: spec.source,
    timestamp: new Date().toISOString(),
  });
}

async function emitBugUpdated(bug) {
  await publishEvent('bug.updated', {
    bugId: bug.id,
    title: bug.title,
    status: bug.status,
    assignedTo: bug.assigned_to,
    timestamp: new Date().toISOString(),
  });
}

async function emitTestFailed(test) {
  await publishEvent('test.failed', {
    testId: test.id,
    testName: test.name,
    status: 'failed',
    errorMessage: test.error,
    timestamp: new Date().toISOString(),
  });
}

async function emitTestPassed(test) {
  await publishEvent('test.passed', {
    testId: test.id,
    testName: test.name,
    status: 'passed',
    timestamp: new Date().toISOString(),
  });
}

async function emitDeployTriggered(deploy) {
  await publishEvent('deploy.triggered', {
    deployId: deploy.id,
    environment: deploy.environment,
    status: deploy.status,
    timestamp: new Date().toISOString(),
  });
}

module.exports = {
  initEventBus,
  closeEventBus,
  isInitialized,
  publishEvent,
  subscribeEvent,
  emitBugCreated,
  emitSpecCreated,
  emitBugUpdated,
  emitTestFailed,
  emitTestPassed,
  emitDeployTriggered,
  EVENT_TYPES,
};
