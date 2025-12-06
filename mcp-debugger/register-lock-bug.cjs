const mysql = require('mysql2/promise');

(async () => {
  const conn = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'trend2024',
    database: 'trend_video'
  });

  // 다음 ID 가져오기
  const [maxRows] = await conn.query('SELECT MAX(id) as maxId FROM bugs');
  const nextId = (maxRows[0].maxId || 0) + 1;

  const title = 'task_lock 스크립트 락이 에러 발생 시 제대로 해제되지 않음';
  const summary = `## 문제
- 대본 생성 중 에러 발생 시 task_lock의 script 락이 해제되지 않음
- 후속 대본 생성 요청이 모두 409 에러로 실패 (30분 좀비 락 타임아웃 전까지)

## 원인
- scripts/generate/route.ts에서 락을 설정하지만, 에러 발생 시 해제 로직이 없음
- unified-worker.js에서는 성공 시에만 락 해제 (에러 시 락이 남음)
- 특히 백엔드 Python 프로세스 에러 시 락 해제 불가

## 해결 방안
1. scripts/generate/route.ts에서 try-finally로 에러 시에도 락 해제
2. 또는 좀비 락 타임아웃을 30분에서 5분으로 단축
3. unified-worker.js의 에러 핸들러에서도 락 해제 추가

## 관련
- BTS-2507에서 content.status 체크를 task_lock으로 변경했으나 불완전함
- 영향받은 task: f502591b-bd77-4e1f-bd39-17e4826b60d7`;

  const metadata = JSON.stringify({
    type: 'bug',
    related_bugs: ['BTS-2507'],
    affected_files: [
      'trend-video-frontend/src/app/api/scripts/generate/route.ts',
      'trend-video-frontend/src/workers/unified-worker.js',
      'trend-video-frontend/src/lib/task-lock.ts'
    ],
    root_cause: 'error-handling-missing-lock-release'
  });

  await conn.query(
    'INSERT INTO bugs (id, title, summary, status, type, priority, metadata, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())',
    [nextId, title, summary, 'open', 'bug', 'P2', metadata]
  );

  console.log('등록 완료: BTS-' + String(nextId).padStart(7, '0'));

  // BTS-2530은 중복이므로 closed 처리
  await conn.query(
    `UPDATE bugs SET status = 'closed', summary = CONCAT(summary, '\n\n## Closed\nBTS-${String(nextId).padStart(7, '0')}로 대체됨'), updated_at = NOW() WHERE id = 2530`
  );
  console.log('BTS-0002530 closed 처리 완료 (신규 버그로 대체)');

  await conn.end();
})();
