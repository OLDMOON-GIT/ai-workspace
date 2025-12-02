# Queue Processing Spec v4 (FINAL)

## 개요

**핵심 원칙**: 한 task당 task_queue에 **하나의 row만 존재**하며, Phase 전환 시 **type을 UPDATE**합니다.

## 테이블 구조

### task_queue 테이블
```sql
CREATE TABLE task_queue (
  task_id TEXT PRIMARY KEY,           -- ⭐ task.task_id (하나의 task당 하나의 row)
  type TEXT NOT NULL,                 -- 'schedule' | 'script' | 'image' | 'video' | 'youtube'
  status TEXT NOT NULL,               -- 'waiting' | 'processing' | 'completed' | 'failed' | 'cancelled'
  user_id TEXT NOT NULL,
  priority INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  started_at TEXT,                    -- processing 시작 시간
  completed_at TEXT,                  -- completed/failed 시간
  elapsed_time INTEGER,               -- 각 Phase 실행 시간 (ms)
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  error TEXT,
  metadata TEXT,                      -- JSON (추가 정보)
  logs TEXT                           -- JSON (로그)
);
```

## 5 Phase Pipeline

```
schedule → script → image → video → youtube
   (0)       (1)      (2)     (3)      (4)
```

**Phase 전환 방식**:
- ❌ INSERT 새 row
- ✅ UPDATE type='next_phase', status='waiting'

## 5 Status

```
waiting     → processing → completed → (다음 Phase)
                        ↓
                      failed (재시도 가능)
                        ↓
                    cancelled (최종)
```

## Phase 전환 로직

### getNextPhase Helper
```typescript
function getNextPhase(currentType: 'schedule' | 'script' | 'image' | 'video' | 'youtube'): 'script' | 'image' | 'video' | 'youtube' | null {
  const phaseMap: Record<string, 'script' | 'image' | 'video' | 'youtube' | null> = {
    'schedule': 'script',
    'script': 'image',
    'image': 'video',
    'video': 'youtube',
    'youtube': null       // 마지막 Phase
  };
  return phaseMap[currentType] || null;
}
```

## Generic Queue Processor

**모든 Phase는 동일한 processQueue 함수 사용**:

```typescript
async function processQueue(
  type: 'schedule' | 'script' | 'image' | 'video' | 'youtube',
  executor: (queue: any) => Promise<void>
) {
  const TIMEOUT = 15 * 60 * 1000; // 15분

  try {
    const db = new Database(dbPath);
    let queue: any = null;

    // ============================================================
    // ⭐ 트랜잭션으로 원자적 lock 획득
    // ============================================================
    db.transaction(() => {
      // 1. processing 중인지 확인 (동시 1개 제한)
      const processingCount = db.prepare(`
        SELECT COUNT(*) as count FROM task_queue
        WHERE type = ? AND status = 'processing'
      `).get(type) as { count: number };

      if (processingCount.count > 0) {
        return; // 이미 처리 중이면 skip
      }

      // 2. waiting 큐 조회
      const waitingQueue = db.prepare(`
        SELECT task_id FROM task_queue
        WHERE type = ? AND status = 'waiting'
        LIMIT 1
      `).get(type) as { task_id: string } | undefined;

      if (!waitingQueue) {
        return; // waiting 없음
      }

      // 3. 즉시 processing으로 변경 (lock 획득)
      db.prepare(`
        UPDATE task_queue
        SET status = 'processing', started_at = CURRENT_TIMESTAMP
        WHERE task_id = ? AND status = 'waiting'
      `).run(waitingQueue.task_id);

      // 4. task 정보 조회
      queue = db.prepare(`
        SELECT t.*, q.status, q.type
        FROM task t
        JOIN task_queue q ON t.task_id = q.task_id
        WHERE t.task_id = ?
      `).get(waitingQueue.task_id);
    })();

    db.close();

    if (!queue) return; // 처리할 큐 없음

    const taskId = queue.task_id;
    const startTime = Date.now();

    try {
      // ============================================================
      // executor 실행 (15분 타임아웃)
      // ============================================================
      await Promise.race([
        executor(queue),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`Timeout: ${type} 작업이 15분을 초과했습니다`)), TIMEOUT)
        )
      ]);

      // ============================================================
      // ⭐ 성공: type을 다음 Phase로 UPDATE
      // ============================================================
      const elapsedTime = Date.now() - startTime;
      const dbUpdate = new Database(dbPath);
      const nextType = getNextPhase(type);

      if (nextType) {
        // 다음 Phase로 전환
        dbUpdate.prepare(`
          UPDATE task_queue
          SET type = ?,
              status = 'waiting',
              started_at = NULL,
              completed_at = NULL,
              elapsed_time = ?,
              retry_count = 0,
              error = NULL
          WHERE task_id = ?
        `).run(nextType, elapsedTime, taskId);
        console.log(`✅ [${type}] ${taskId} → ${nextType}`);
      } else {
        // 마지막 Phase 완료
        dbUpdate.prepare(`
          UPDATE task_queue
          SET status = 'completed',
              completed_at = datetime('now'),
              elapsed_time = ?
          WHERE task_id = ?
        `).run(elapsedTime, taskId);
        console.log(`✅ [${type}] ${taskId} FINAL completed`);
      }

      dbUpdate.close();

    } catch (error: any) {
      // ============================================================
      // 실패: status = 'failed' (type은 유지)
      // ============================================================
      const elapsedTime = Date.now() - startTime;
      const dbUpdate = new Database(dbPath);
      dbUpdate.prepare(`
        UPDATE task_queue
        SET status = 'failed',
            completed_at = datetime('now'),
            elapsed_time = ?,
            error = ?
        WHERE task_id = ?
      `).run(elapsedTime, error.message, taskId);
      dbUpdate.close();
    }
  } catch (error) {
    console.error(`[processQueue] Error:`, error);
  }
}
```

## Phase별 처리

### Phase 0: Schedule
```typescript
setInterval(() => {
  processQueue('schedule', async (queue) => {
    // 스케줄 시간 도달했는지 확인
    const now = new Date();
    const scheduled = new Date(queue.scheduled_time);

    if (now < scheduled) {
      // 아직 시간 안됨 - waiting 상태 유지
      return;
    }

    // 즉시 완료 (다음 Phase로 전환)
    console.log(`[Schedule] ${queue.task_id} 시작`);
  });
}, 1000);
```

### Phase 1: Script
```typescript
setInterval(() => {
  processQueue('script', async (queue) => {
    // 대본 생성
    const result = await generateScript(queue);
    console.log(`[Script] ${queue.task_id} 대본 생성 완료`);
  });
}, 1000);
```

### Phase 2: Image
```typescript
setInterval(() => {
  processQueue('image', async (queue) => {
    // 이미지 처리 대기 (사용자 업로드 or 크롤링)
    // 외부 이벤트에 의해 완료됨
    const result = await waitForImages(queue);
    console.log(`[Image] ${queue.task_id} 이미지 준비 완료`);
  });
}, 1000);
```

### Phase 3: Video
```typescript
setInterval(() => {
  processQueue('video', async (queue) => {
    // 영상 생성
    const result = await generateVideo(queue);
    console.log(`[Video] ${queue.task_id} 영상 생성 완료`);
  });
}, 1000);
```

### Phase 4: YouTube
```typescript
setInterval(() => {
  processQueue('youtube', async (queue) => {
    // 유튜브 업로드
    const result = await uploadToYoutube(queue);
    console.log(`[YouTube] ${queue.task_id} 업로드 완료`);
  });
}, 1000);
```

## 동시 실행 제한

**각 Phase별로 동시에 1개씩만 처리**:

```typescript
// ✅ 허용
schedule(task1) + script(task2) + video(task3) = 3개 동시 (각 Phase별 1개씩)

// ❌ 불가
script(task1) + script(task2) = 2개 동시 (같은 Phase 중복)
```

**구현**:
```typescript
// processQueue 내부에서 체크
const processingCount = db.prepare(`
  SELECT COUNT(*) as count FROM task_queue
  WHERE type = ? AND status = 'processing'
`).get(type);

if (processingCount.count > 0) {
  return; // 이미 처리 중이면 skip
}
```

## Race Condition 방지

**db.transaction()으로 원자적 처리**:

```typescript
db.transaction(() => {
  // 1. 상태 확인
  // 2. waiting 큐 조회
  // 3. processing으로 변경 (lock 획득)
  // 4. task 정보 조회
})();
// ⭐ 트랜잭션 종료 후 다른 프로세스가 접근 가능
```

## 상태 전환 다이어그램

```
[생성]
  ↓
task_queue (task_id=1, type='schedule', status='waiting')
  ↓ (스케줄 시간 도달)
UPDATE SET type='script', status='waiting'
  ↓ (대본 생성 완료)
UPDATE SET type='image', status='waiting'
  ↓ (이미지 준비 완료)
UPDATE SET type='video', status='waiting'
  ↓ (영상 생성 완료)
UPDATE SET type='youtube', status='waiting'
  ↓ (업로드 완료)
UPDATE SET status='completed'
  ↓
[완료]
```

## 실패 처리

### 실패 시
```typescript
// type은 유지, status만 failed로
UPDATE task_queue SET status = 'failed', error = '에러 메시지' WHERE task_id = ?
```

### 재시도
```typescript
// failed → waiting으로 변경 (type은 유지)
UPDATE task_queue SET status = 'waiting', retry_count = retry_count + 1, error = NULL WHERE task_id = ?
```

### 취소
```typescript
// cancelled (최종 상태, 재시도 불가)
UPDATE task_queue SET status = 'cancelled' WHERE task_id = ?
```

## 타임아웃 처리

**15분 초과 시 자동 실패**:
```typescript
await Promise.race([
  executor(queue),
  new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Timeout: 15분 초과')), 15 * 60 * 1000)
  )
]);
```

## elapsed_time 추적

**각 Phase별 실행 시간 기록**:
```typescript
const startTime = Date.now();
// ... executor 실행
const elapsedTime = Date.now() - startTime;

UPDATE task_queue SET elapsed_time = ? WHERE task_id = ?
```

## Helper 함수

### updateQueueStatus
```typescript
export function updateQueueStatus(
  taskId: string,
  type: 'schedule' | 'script' | 'image' | 'video' | 'youtube',  // deprecated (backward compatibility)
  status: 'waiting' | 'processing' | 'completed' | 'failed' | 'cancelled',
  options?: { errorMessage?: string; retryCount?: number; metadata?: any }
) {
  const db = new Database(dbPath);

  // task_queue에서 task_id로 조회 (한 task당 하나의 row)
  const existingQueue = db.prepare(`
    SELECT task_id, type FROM task_queue WHERE task_id = ? LIMIT 1
  `).get(taskId);

  if (existingQueue) {
    // 기존 큐 업데이트 (task_id로만!)
    db.prepare(`
      UPDATE task_queue
      SET status = ?, error = ?, retry_count = ?, ...
      WHERE task_id = ?
    `).run(status, errorMessage, retryCount, taskId);
  } else {
    // 큐가 없으면 새로 생성 (최초 schedule 생성 시에만)
    db.prepare(`
      INSERT INTO task_queue (task_id, type, status, user_id, created_at)
      VALUES (?, ?, ?, ?, datetime('now'))
    `).run(taskId, type, status, userId);
  }

  db.close();
}
```

## 주의사항

1. **한 task당 하나의 row**: task_queue는 task_id PRIMARY KEY
2. **Phase 전환은 UPDATE**: INSERT 새 row ❌
3. **동시 1개 제한**: 각 Phase별로 processing 중인 작업이 있으면 skip
4. **트랜잭션 Lock**: db.transaction()으로 Race Condition 방지
5. **15분 타임아웃**: Promise.race로 구현
6. **elapsed_time 추적**: 각 Phase 실행 시간 기록
7. **WHERE 조건**: `WHERE task_id = ?` (task_id만 사용, type은 불필요)

## 상태 조회

### 큐 탭별 조회
```typescript
export function getSchedulesByQueueTab(tab: string) {
  const db = new Database(dbPath);

  let statusFilter: string;
  switch (tab) {
    case 'scheduled':
      statusFilter = `q.type = 'schedule' AND q.status = 'waiting'`;
      break;
    case 'script':
      statusFilter = `q.type = 'script' AND q.status IN ('waiting', 'processing')`;
      break;
    case 'image':
      statusFilter = `q.type = 'image' AND q.status IN ('waiting', 'processing')`;
      break;
    case 'video':
      statusFilter = `q.type = 'video' AND q.status IN ('waiting', 'processing')`;
      break;
    case 'youtube':
      statusFilter = `q.type = 'youtube' AND q.status IN ('waiting', 'processing')`;
      break;
    case 'failed':
      statusFilter = `q.status = 'failed'`;
      break;
    case 'completed':
      statusFilter = `q.status = 'completed'`;
      break;
  }

  const schedules = db.prepare(`
    SELECT s.*, t.*, q.status, q.type, q.error
    FROM task_schedule s
    JOIN task t ON s.task_id = t.task_id
    LEFT JOIN task_queue q ON s.task_id = q.task_id
    WHERE ${statusFilter}
    ORDER BY s.scheduled_time DESC
  `).all();

  db.close();
  return schedules;
}
```

### 큐 카운트 조회
```typescript
export function getQueueCounts() {
  const db = new Database(dbPath);

  const counts = db.prepare(`
    SELECT
      SUM(CASE WHEN type = 'schedule' AND status = 'waiting' THEN 1 ELSE 0 END) as scheduled,
      SUM(CASE WHEN type = 'script' AND status IN ('waiting', 'processing') THEN 1 ELSE 0 END) as script,
      SUM(CASE WHEN type = 'image' AND status IN ('waiting', 'processing') THEN 1 ELSE 0 END) as image,
      SUM(CASE WHEN type = 'video' AND status IN ('waiting', 'processing') THEN 1 ELSE 0 END) as video,
      SUM(CASE WHEN type = 'youtube' AND status IN ('waiting', 'processing') THEN 1 ELSE 0 END) as youtube,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
      SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed
    FROM task_queue
  `).get();

  db.close();
  return counts;
}
```

## 요약

| 항목 | 설명 |
|------|------|
| **테이블** | task_queue (task_id PRIMARY KEY) |
| **Phase** | schedule → script → image → video → youtube |
| **Status** | waiting, processing, completed, failed, cancelled |
| **전환 방식** | UPDATE type='next_phase', status='waiting' |
| **동시 실행** | 각 Phase별 1개씩만 |
| **Lock** | db.transaction() |
| **타임아웃** | 15분 |
| **재시도** | failed → waiting (retry_count++) |
