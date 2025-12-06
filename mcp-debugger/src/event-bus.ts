/**
 * EDA 이벤트 버스 (BTS-3190)
 *
 * Redis 기반 Bull Queue를 사용한 이벤트 발행/구독 시스템
 * 폴링 → 푸시 전환으로 역제어(IoC) 구현
 */

import Queue from 'bull';
import { Redis } from 'ioredis';

// Redis 연결 설정
const REDIS_CONFIG = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  maxRetriesPerRequest: null,
};

// 이벤트 타입 정의
export type EventType =
  | 'bug.created'
  | 'bug.updated'
  | 'spec.created'
  | 'test.failed'
  | 'test.passed'
  | 'deploy.triggered';

// 이벤트 페이로드 타입
export interface BugEvent {
  bugId: number;
  title: string;
  type: 'bug' | 'spec' | 'feature';
  priority: string;
  source?: string;
  timestamp: string;
}

export interface TestEvent {
  testId: string;
  testName: string;
  status: 'passed' | 'failed';
  errorMessage?: string;
  timestamp: string;
}

export interface DeployEvent {
  deployId: string;
  environment: string;
  status: 'started' | 'success' | 'failed';
  timestamp: string;
}

export type EventPayload = BugEvent | TestEvent | DeployEvent;

// 큐 인스턴스들
const queues: Map<EventType, Queue.Queue> = new Map();

// Redis 클라이언트 (Pub/Sub용)
let redisClient: Redis | null = null;
let redisSub: Redis | null = null;

/**
 * Redis 연결 초기화
 */
export async function initEventBus(): Promise<void> {
  try {
    redisClient = new Redis(REDIS_CONFIG);
    redisSub = new Redis(REDIS_CONFIG);

    redisClient.on('connect', () => {
      console.log('🔌 [EVENT-BUS] Redis 연결됨');
    });

    redisClient.on('error', (err: Error) => {
      console.error('❌ [EVENT-BUS] Redis 에러:', err.message);
    });

    // 각 이벤트 타입별 큐 생성
    const eventTypes: EventType[] = [
      'bug.created',
      'bug.updated',
      'spec.created',
      'test.failed',
      'test.passed',
      'deploy.triggered',
    ];

    for (const eventType of eventTypes) {
      const queue = new Queue(eventType, { redis: REDIS_CONFIG });
      queues.set(eventType, queue);
      console.log(`📫 [EVENT-BUS] 큐 생성: ${eventType}`);
    }

    console.log('✅ [EVENT-BUS] 초기화 완료');
  } catch (error: any) {
    console.error('❌ [EVENT-BUS] 초기화 실패:', error.message);
    throw error;
  }
}

/**
 * 이벤트 발행 (Publish)
 */
export async function publishEvent(
  eventType: EventType,
  payload: EventPayload
): Promise<void> {
  const queue = queues.get(eventType);
  if (!queue) {
    console.error(`❌ [EVENT-BUS] 큐 없음: ${eventType}`);
    return;
  }

  try {
    await queue.add(payload, {
      removeOnComplete: 100, // 완료된 작업 100개만 유지
      removeOnFail: 50, // 실패한 작업 50개만 유지
    });
    console.log(`📤 [EVENT-BUS] 이벤트 발행: ${eventType}`, payload);
  } catch (error: any) {
    console.error(`❌ [EVENT-BUS] 발행 실패: ${eventType}`, error.message);
  }
}

/**
 * 이벤트 구독 (Subscribe)
 */
export function subscribeEvent(
  eventType: EventType,
  handler: (payload: EventPayload) => Promise<void>
): void {
  const queue = queues.get(eventType);
  if (!queue) {
    console.error(`❌ [EVENT-BUS] 큐 없음: ${eventType}`);
    return;
  }

  queue.process(async (job) => {
    console.log(`📥 [EVENT-BUS] 이벤트 수신: ${eventType}`, job.data);
    try {
      await handler(job.data);
    } catch (error: any) {
      console.error(`❌ [EVENT-BUS] 핸들러 에러: ${eventType}`, error.message);
      throw error; // Bull이 재시도하도록
    }
  });

  console.log(`👂 [EVENT-BUS] 구독 등록: ${eventType}`);
}

/**
 * 이벤트 버스 종료
 */
export async function closeEventBus(): Promise<void> {
  for (const [eventType, queue] of queues) {
    await queue.close();
    console.log(`🔒 [EVENT-BUS] 큐 종료: ${eventType}`);
  }

  if (redisClient) {
    await redisClient.quit();
  }
  if (redisSub) {
    await redisSub.quit();
  }

  console.log('🔌 [EVENT-BUS] 종료 완료');
}

// 편의 함수들

/**
 * 버그 생성 이벤트 발행
 */
export async function emitBugCreated(bug: {
  id: number;
  title: string;
  type: 'bug' | 'spec' | 'feature';
  priority: string;
  source?: string;
}): Promise<void> {
  await publishEvent('bug.created', {
    bugId: bug.id,
    title: bug.title,
    type: bug.type,
    priority: bug.priority,
    source: bug.source,
    timestamp: new Date().toISOString(),
  });
}

/**
 * SPEC 생성 이벤트 발행
 */
export async function emitSpecCreated(spec: {
  id: number;
  title: string;
  priority: string;
  source?: string;
}): Promise<void> {
  await publishEvent('spec.created', {
    bugId: spec.id,
    title: spec.title,
    type: 'spec',
    priority: spec.priority,
    source: spec.source,
    timestamp: new Date().toISOString(),
  });
}

/**
 * 테스트 실패 이벤트 발행
 */
export async function emitTestFailed(test: {
  id: string;
  name: string;
  error: string;
}): Promise<void> {
  await publishEvent('test.failed', {
    testId: test.id,
    testName: test.name,
    status: 'failed',
    errorMessage: test.error,
    timestamp: new Date().toISOString(),
  });
}

/**
 * 테스트 통과 이벤트 발행
 */
export async function emitTestPassed(test: {
  id: string;
  name: string;
}): Promise<void> {
  await publishEvent('test.passed', {
    testId: test.id,
    testName: test.name,
    status: 'passed',
    timestamp: new Date().toISOString(),
  });
}

/**
 * 배포 트리거 이벤트 발행
 */
export async function emitDeployTriggered(deploy: {
  id: string;
  environment: string;
  status: 'started' | 'success' | 'failed';
}): Promise<void> {
  await publishEvent('deploy.triggered', {
    deployId: deploy.id,
    environment: deploy.environment,
    status: deploy.status,
    timestamp: new Date().toISOString(),
  });
}
