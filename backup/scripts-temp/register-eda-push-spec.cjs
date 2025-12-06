const mysql = require('mysql2/promise');

async function main() {
  const conn = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'trend2024',
    database: 'trend_video'
  });

  try {
    const title = 'EDA 기반 푸시 시스템으로 전환 (폴링 → 이벤트)';
    const summary = `현재 폴링 기반 시스템을 EDA(Event-Driven Architecture) 기반
푸시 시스템으로 전환하여 역제어(Inversion of Control) 구현.

현재 상태:
- notification-worker.cjs: 10초 폴링으로 버그 감지
- spawning-pool.py: 폴링으로 open 버그 조회

변경 사항:
1. 메시지 큐 도입
   - Redis Pub/Sub 또는 Bull Queue 사용
   - 이벤트: bug.created, bug.updated, spec.created, test.failed

2. 이벤트 발행자 (Publishers)
   - monitor.ts: 에러 감지 시 이벤트 발행
   - test-reporter.ts: 테스트 실패 시 이벤트 발행
   - bug-db.js: 버그 생성/수정 시 이벤트 발행

3. 이벤트 구독자 (Subscribers)
   - notification-worker → bug.created 구독
   - spawning-pool → spec.created, bug.created 구독
   - deploy-pipeline → test.passed 구독

4. 역제어 플로우
   버그 생성 → 이벤트 발행 → 큐 → 워커 자동 할당
   테스트 통과 → 이벤트 발행 → 큐 → 배포 트리거

장점:
- 실시간 반응 (폴링 지연 제거)
- 느슨한 결합 (Loose Coupling)
- 확장성 (새 구독자 쉽게 추가)
- 리소스 효율 (불필요한 폴링 제거)

관련 파일:
- mcp-debugger/notification-worker.cjs (폴링 → 구독)
- mcp-debugger/spawning-pool.py (폴링 → 구독)
- automation/bug-db.js (이벤트 발행 추가)
- mcp-debugger/src/monitor.ts (이벤트 발행 추가)`;

    const metadata = JSON.stringify({
      feature: 'eda-push-system',
      current: 'polling',
      target: 'event-driven',
      components: [
        'redis-pubsub or bull-queue',
        'event-publisher',
        'event-subscriber',
        'notification-worker',
        'spawning-pool'
      ],
      events: [
        'bug.created',
        'bug.updated',
        'spec.created',
        'test.failed',
        'test.passed',
        'deploy.triggered'
      ]
    });

    const result = await conn.query(
      `INSERT INTO bugs (title, summary, type, priority, status, metadata, created_at, updated_at)
       VALUES (?, ?, 'spec', 'P1', 'open', ?, NOW(), NOW())`,
      [title, summary, metadata]
    );

    console.log(`✅ SPEC 등록 완료: BTS-${result[0].insertId}`);
    console.log('Title:', title);

  } finally {
    await conn.end();
  }
}

main().catch(console.error);
