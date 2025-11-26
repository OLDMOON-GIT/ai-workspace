# 자동화 큐 시스템 스펙 v3

## 1. 핵심 원칙

- **tasks**: 모든 메타데이터를 보관하는 메인 엔티티
- **task_schedules**: 스케줄 정보만 보관 (tasks와 1:N 관계)
- **task_queue**: 단계별 상태 관리 (type + status)
- **각 큐에서 동시에 처리되는 작업은 단 하나**
- **경로는 룰 베이스**: `tasks/{task_id}/` 하위에 파일 규칙으로 저장, DB에는 저장 안 함
- **원자적 연산**: SELECT + UPDATE를 단일 쿼리로 처리

### ID 규칙
- **task_id 통일**: 모든 테이블에서 `task_id` 사용 (기존 `title_id` 폐기)
- **UUID 형식**: `tasks.id`는 UUID
- **폴더 구조**: `tasks/{task_id}/story.json`

- **트랜잭션**: 완료 + 다음큐 INSERT는 반드시 트랜잭션으로

---

## 2. 테이블 구조

### 2.1 tasks (메인 엔티티)

```sql
CREATE TABLE tasks (
  id TEXT PRIMARY KEY,  -- UUID
  title TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('shortform', 'longform', 'product')),
  user_id TEXT,

  -- 메타데이터
  product_info TEXT,      -- JSON: 상품 정보
  settings TEXT,          -- JSON: { mediaMode, format, ... }

  -- 결과물 (경로는 룰 베이스로 생성, DB 저장 안 함)
  -- script:    tasks/{id}/story.json
  -- video:     tasks/{id}/output.mp4
  -- thumbnail: tasks/{id}/thumbnail.jpg
  -- images:    tasks/{id}/scene_*.png
  youtube_url TEXT,  -- 유튜브 URL만 저장

  -- 에러 정보
  last_error TEXT,

  -- 타임스탬프
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### 2.2 task_schedules (스케줄 정보만)

```sql
CREATE TABLE task_schedules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id TEXT NOT NULL REFERENCES tasks(id),

  -- 스케줄 정보
  scheduled_time DATETIME,  -- NULL = 즉시실행
  repeat_type TEXT CHECK(repeat_type IN ('once', 'daily', 'weekly', 'monthly')),
  repeat_config TEXT,       -- JSON: 반복 설정
  next_run_at DATETIME,     -- 다음 실행 시간 (반복 스케줄용)
  is_active INTEGER DEFAULT 1,  -- 활성화 여부

  -- 유튜브 설정
  channel_setting_id TEXT,
  youtube_privacy TEXT DEFAULT 'public',
  youtube_publish_time DATETIME,

  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (task_id) REFERENCES tasks(id)
);
```

### 2.3 task_queue (상태 관리)

```sql
CREATE TABLE task_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id TEXT NOT NULL REFERENCES tasks(id),
  schedule_id INTEGER REFERENCES task_schedules(id),

  queue_type TEXT NOT NULL CHECK(queue_type IN (
    'schedule', 'script', 'image', 'video', 'youtube'
  )),

  status TEXT NOT NULL CHECK(status IN (
    'waiting', 'processing', 'completed', 'failed'
  )),

  -- 재시도 정책
  retry_count INTEGER DEFAULT 0,
  max_retry INTEGER DEFAULT 3,
  next_retry_at DATETIME,  -- 재시도 대기 시간

  -- 에러 정보
  error_message TEXT,

  -- 타임스탬프
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME,

  FOREIGN KEY (task_id) REFERENCES tasks(id)
);

CREATE INDEX idx_task_queue_status ON task_queue(queue_type, status);
CREATE INDEX idx_task_queue_task_id ON task_queue(task_id);
CREATE INDEX idx_task_queue_retry ON task_queue(status, next_retry_at);
```

### 2.4 task_logs (로그)

```sql
CREATE TABLE task_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id TEXT NOT NULL REFERENCES tasks(id),
  queue_id INTEGER REFERENCES task_queue(id),
  level TEXT CHECK(level IN ('info', 'warn', 'error')),
  message TEXT NOT NULL,
  metadata TEXT,  -- JSON
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_task_logs_task_id ON task_logs(task_id);
```

### 2.5 scheduler_lock (동시성 제어)

```sql
CREATE TABLE scheduler_lock (
  lock_name TEXT PRIMARY KEY,
  locked_at DATETIME,
  locked_by TEXT,  -- 프로세스 ID
  expires_at DATETIME  -- 만료 시간 (크래시 대비)
);
```

---

## 3. 파이프라인 흐름

### 3.1 전체 흐름

```
[schedule] -> [script] -> [image?] -> [video] -> [youtube]
                            ^
                            |
                     mediaMode에 따라 스킵
```

### 3.2 mediaMode 분기 로직

| mediaMode | script 완료 후 | 설명 |
|-----------|---------------|------|
| `upload` | → video 큐 | 이미지 직접 업로드 (이미 있음) |
| `crawl` | → image 큐 → video 큐 | 이미지 크롤링 필요 |
| `dalle3` | → video 큐 | AI 이미지 생성 (video 단계에서 처리) |
| `imagen3` | → video 큐 | AI 이미지 생성 (video 단계에서 처리) |
| `sora2` | → video 큐 | AI 영상 생성 (video 단계에서 처리) |

---

## 4. 원자적 Dequeue 연산

### 4.1 작업 가져오기 (Race Condition 방지)

```sql
-- SELECT와 UPDATE를 하나의 쿼리로 (SQLite용)
UPDATE task_queue
SET status = 'processing',
    updated_at = CURRENT_TIMESTAMP
WHERE id = (
  SELECT id FROM task_queue
  WHERE queue_type = ?
    AND status = 'waiting'
    AND (next_retry_at IS NULL OR next_retry_at <= CURRENT_TIMESTAMP)
  ORDER BY created_at
  LIMIT 1
)
RETURNING *;
```

### 4.2 완료 + 다음 큐 INSERT (트랜잭션)

```typescript
db.transaction(() => {
  // 1. 현재 큐 완료 처리
  db.prepare(`
    UPDATE task_queue
    SET status = 'completed',
        completed_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(queueItemId);

  // 2. 다음 큐에 INSERT
  if (nextQueueType) {
    db.prepare(`
      INSERT INTO task_queue (task_id, schedule_id, queue_type, status)
      VALUES (?, ?, ?, 'waiting')
    `).run(taskId, scheduleId, nextQueueType);
  }

  // 3. 로그 기록
  db.prepare(`
    INSERT INTO task_logs (task_id, queue_id, level, message)
    VALUES (?, ?, 'info', ?)
  `).run(taskId, queueItemId, `${currentQueueType} 완료 → ${nextQueueType} 대기`);
})();
```

---

## 5. 재시도 정책

### 5.1 재시도 간격 (지수 백오프)

```typescript
function getRetryDelay(retryCount: number): number {
  // 5초, 10초, 30초 (점점 늘어남)
  const delays = [5, 10, 30];
  return delays[Math.min(retryCount, delays.length - 1)];
}
```

### 5.2 실패 처리

```typescript
function handleFailure(queueItem: TaskQueueItem, error: Error) {
  db.transaction(() => {
    if (queueItem.retry_count < queueItem.max_retry) {
      // 재시도 대기
      const delay = getRetryDelay(queueItem.retry_count);
      db.prepare(`
        UPDATE task_queue
        SET status = 'waiting',
            retry_count = retry_count + 1,
            next_retry_at = datetime('now', '+' || ? || ' seconds'),
            error_message = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(delay, error.message, queueItem.id);

      addLog(queueItem.task_id, 'warn',
        `실패 (시도 ${queueItem.retry_count + 1}/${queueItem.max_retry}): ${error.message}`);
    } else {
      // 영구 실패
      db.prepare(`
        UPDATE task_queue
        SET status = 'failed',
            error_message = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(error.message, queueItem.id);

      db.prepare(`
        UPDATE tasks
        SET last_error = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(error.message, queueItem.task_id);

      addLog(queueItem.task_id, 'error',
        `영구 실패 (최대 재시도 초과): ${error.message}`);
    }
  })();
}
```

---

## 6. 반복 스케줄 처리

### 6.1 다음 실행 시간 계산

```typescript
function calculateNextRunTime(schedule: TaskSchedule): Date | null {
  if (schedule.repeat_type === 'once') return null;

  const now = new Date();
  const current = new Date(schedule.next_run_at || schedule.scheduled_time);

  switch (schedule.repeat_type) {
    case 'daily':
      current.setDate(current.getDate() + 1);
      break;
    case 'weekly':
      current.setDate(current.getDate() + 7);
      break;
    case 'monthly':
      current.setMonth(current.getMonth() + 1);
      break;
  }

  return current > now ? current : null;
}
```

### 6.2 스케줄 완료 후 다음 실행 설정

```typescript
// youtube 큐 완료 시
if (schedule.repeat_type !== 'once') {
  const nextRun = calculateNextRunTime(schedule);
  if (nextRun) {
    db.prepare(`
      UPDATE task_schedules
      SET next_run_at = ?
      WHERE id = ?
    `).run(nextRun.toISOString(), schedule.id);
  } else {
    db.prepare(`
      UPDATE task_schedules
      SET is_active = 0
      WHERE id = ?
    `).run(schedule.id);
  }
}
```

---

## 7. 레코드 정리 정책

### 7.1 정책: 히스토리 보관

완료된 task_queue 레코드는 삭제하지 않고 보관 (히스토리 추적용)

### 7.2 정기 정리 (선택적)

```sql
-- 30일 이상 된 completed 레코드 삭제 (필요시)
DELETE FROM task_queue
WHERE status = 'completed'
  AND completed_at < datetime('now', '-30 days');
```

---

## 8. UI 탭 구조

| 탭 이름 | 쿼리 조건 |
|---------|-----------|
| 예약큐 | queue_type='schedule' AND status IN ('waiting', 'processing') |
| 대본큐 | queue_type='script' AND status IN ('waiting', 'processing') |
| 이미지큐 | queue_type='image' AND status IN ('waiting', 'processing') |
| 영상큐 | queue_type='video' AND status IN ('waiting', 'processing') |
| 유튜브큐 | queue_type='youtube' AND status IN ('waiting', 'processing') |
| 실패 | status='failed' (모든 queue_type) |
| 완료 | queue_type='youtube' AND status='completed' |

---

## 9. TypeScript 타입

```typescript
type QueueType = 'schedule' | 'script' | 'image' | 'video' | 'youtube';
type QueueStatus = 'waiting' | 'processing' | 'completed' | 'failed';
type TaskType = 'shortform' | 'longform' | 'product';
type MediaMode = 'upload' | 'crawl' | 'dalle3' | 'imagen3' | 'sora2';
type RepeatType = 'once' | 'daily' | 'weekly' | 'monthly';

interface Task {
  id: string;
  title: string;
  type: TaskType;
  user_id?: string;
  product_info?: object;
  settings?: { mediaMode: MediaMode; [key: string]: any };
  script_path?: string;
  video_path?: string;
  thumbnail_path?: string;
  youtube_url?: string;
  last_error?: string;
  created_at: string;
  updated_at: string;
}

interface TaskSchedule {
  id: number;
  task_id: string;
  scheduled_time?: string;
  repeat_type?: RepeatType;
  repeat_config?: object;
  next_run_at?: string;
  is_active: boolean;
  channel_setting_id?: string;
  youtube_privacy: string;
  youtube_publish_time?: string;
  created_at: string;
}

interface TaskQueueItem {
  id: number;
  task_id: string;
  schedule_id?: number;
  queue_type: QueueType;
  status: QueueStatus;
  retry_count: number;
  max_retry: number;
  next_retry_at?: string;
  error_message?: string;
  created_at: string;
  updated_at: string;
  completed_at?: string;
}

interface TaskLog {
  id: number;
  task_id: string;
  queue_id?: number;
  level: 'info' | 'warn' | 'error';
  message: string;
  metadata?: object;
  created_at: string;
}
```

---

## 10. 스케줄러 로직 (최종)

```typescript
async function runScheduler() {
  // 1. 스케줄러 락 획득
  if (!acquireLock('main_scheduler')) return;

  try {
    // 2. 예약 시간 된 스케줄을 schedule 큐에 추가
    await enqueueScheduledTasks();

    // 3. 각 큐 처리
    const queueTypes: QueueType[] = ['schedule', 'script', 'image', 'video', 'youtube'];

    for (const queueType of queueTypes) {
      // 원자적 dequeue
      const item = dequeueItem(queueType);
      if (!item) continue;

      try {
        await processQueueItem(item);

        // 트랜잭션으로 완료 + 다음큐 INSERT
        const nextQueue = getNextQueue(queueType, item);
        completeAndEnqueueNext(item, nextQueue);

      } catch (error) {
        handleFailure(item, error);
      }
    }
  } finally {
    releaseLock('main_scheduler');
  }
}

function getNextQueue(currentQueue: QueueType, item: TaskQueueItem): QueueType | null {
  if (currentQueue === 'youtube') return null;
  if (currentQueue === 'video') return 'youtube';
  if (currentQueue === 'image') return 'video';

  if (currentQueue === 'script') {
    const task = getTask(item.task_id);
    const mediaMode = task.settings?.mediaMode || 'upload';
    return mediaMode === 'crawl' ? 'image' : 'video';
  }

  if (currentQueue === 'schedule') return 'script';
  return null;
}
```

---

## 11. 구현 체크리스트

### DB
- [x] tasks 테이블 생성
- [x] task_schedules 테이블 생성
- [x] task_queue 테이블 생성
- [ ] task_logs 테이블 생성
- [ ] scheduler_lock 테이블 생성
- [ ] 인덱스 추가

### 백엔드
- [ ] 원자적 dequeue 함수
- [ ] 트랜잭션 처리 함수
- [ ] 재시도 로직 구현
- [ ] 반복 스케줄 로직
- [ ] 스케줄러 락 구현

### 프론트엔드
- [ ] 큐 탭 UI
- [ ] 재시도 버튼
- [ ] 로그 뷰어

---

## 12. 중지(Stop) 처리

### 12.1 중지 가능한 상태

| 상태 | 처리 방법 |
|------|-----------|
| `waiting` | task_queue에서 삭제 |
| `processing` | 외부 프로세스 종료 후 `failed` 처리 |

### 12.2 중지 흐름

```typescript
async function stopTask(taskId: string): Promise<StopResult> {
  return db.transaction(() => {
    // 1. processing 중인 항목 → failed
    const processingResult = db.prepare(`
      UPDATE task_queue
      SET status = 'failed',
          error_message = '사용자가 작업을 중지했습니다',
          updated_at = CURRENT_TIMESTAMP
      WHERE task_id = ? AND status = 'processing'
    `).run(taskId);

    // 2. waiting 중인 항목 삭제
    const waitingResult = db.prepare(`
      DELETE FROM task_queue
      WHERE task_id = ? AND status = 'waiting'
    `).run(taskId);

    // 3. tasks에 last_error 기록
    db.prepare(`
      UPDATE tasks
      SET last_error = '사용자가 작업을 중지했습니다',
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(taskId);

    // 4. 스케줄 비활성화
    db.prepare(`
      UPDATE task_schedules
      SET is_active = 0
      WHERE task_id = ?
    `).run(taskId);

    // 5. 로그 기록
    db.prepare(`
      INSERT INTO task_logs (task_id, level, action_type, message, metadata)
      VALUES (?, 'warn', 'stop', '🛑 사용자에 의해 작업이 중지되었습니다', ?)
    `).run(taskId, JSON.stringify({
      stopped_processing: processingResult.changes,
      deleted_waiting: waitingResult.changes
    }));

    return {
      stoppedProcessing: processingResult.changes,
      deletedWaiting: waitingResult.changes
    };
  })();
}
```

### 12.3 외부 프로세스 종료

```typescript
async function killExternalProcesses(taskId: string): Promise<string[]> {
  const killed: string[] = [];

  if (process.platform === 'win32') {
    // Windows: PowerShell
    try {
      await execAsync(`powershell -Command "Get-Process python -ErrorAction SilentlyContinue | Where-Object {$_.CommandLine -like '*image_crawler*'} | Stop-Process -Force"`);
      killed.push('python:image_crawler');
    } catch (e) { /* ignore */ }

    try {
      await execAsync(`powershell -Command "Get-Process chrome -ErrorAction SilentlyContinue | Stop-Process -Force"`);
      killed.push('chrome');
    } catch (e) { /* ignore */ }

    try {
      await execAsync(`powershell -Command "Get-Process ffmpeg -ErrorAction SilentlyContinue | Stop-Process -Force"`);
      killed.push('ffmpeg');
    } catch (e) { /* ignore */ }
  } else {
    // Linux/Mac: pkill
    try { await execAsync('pkill -f image_crawler'); killed.push('image_crawler'); } catch (e) { /* ignore */ }
    try { await execAsync('pkill -f chrome'); killed.push('chrome'); } catch (e) { /* ignore */ }
    try { await execAsync('pkill -f ffmpeg'); killed.push('ffmpeg'); } catch (e) { /* ignore */ }
  }

  return killed;
}
```

### 12.4 전체 중지 API

```typescript
// POST /api/automation/stop
export async function POST(request: NextRequest) {
  const { taskId } = await request.json();

  // 1. DB 상태 업데이트
  const dbResult = await stopTask(taskId);

  // 2. 외부 프로세스 종료
  const killedProcesses = await killExternalProcesses(taskId);

  // 3. 결과 반환
  return NextResponse.json({
    success: true,
    stoppedProcessing: dbResult.stoppedProcessing,
    deletedWaiting: dbResult.deletedWaiting,
    killedProcesses
  });
}
```

---

## 13. 내 콘텐츠(contents) 연동

### 13.1 관계 구조

```
tasks (자동화 작업)          contents (내 콘텐츠)
├── id ◄────────────────────── task_id (역참조)
├── title                    ├── id
├── type                     ├── type ('script' | 'video')
├── script_path ─────────────► content (대본 내용)
├── video_path ──────────────► video_path
└── thumbnail_path ──────────► thumbnail_path
```

### 13.2 tasks 테이블 확장

```sql
ALTER TABLE tasks ADD COLUMN content_id TEXT REFERENCES contents(id);
```

### 13.3 동기화 시점

| 이벤트 | 동작 | contents 필드 |
|--------|------|---------------|
| script 큐 완료 | INSERT | type='script', content=대본JSON |
| video 큐 완료 | UPDATE | type='video', video_path, thumbnail_path |
| youtube 큐 완료 | UPDATE | published=1, youtube_url |
| task 중지/실패 | UPDATE | status='failed', error |

### 13.4 script 완료 시 contents 생성

```typescript
function onScriptComplete(task: Task, scriptContent: string) {
  db.transaction(() => {
    // 1. contents에 대본 저장
    const contentId = crypto.randomUUID();
    db.prepare(`
      INSERT INTO contents (
        id, user_id, type, format, title, content,
        status, progress, task_id, created_at, updated_at
      ) VALUES (?, ?, 'script', ?, ?, ?, 'completed', 100, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run(contentId, task.user_id, task.type, task.title, scriptContent, task.id);

    // 2. tasks에 content_id 연결
    db.prepare(`
      UPDATE tasks SET content_id = ?, script_path = ? WHERE id = ?
    `).run(contentId, `tasks/${task.id}/story.json`, task.id);

    // 3. 로그
    addLog(task.id, 'info', `📝 대본 저장 완료 → contents.${contentId}`);
  })();
}
```

### 13.5 video 완료 시 contents 업데이트

```typescript
function onVideoComplete(task: Task, videoPath: string, thumbnailPath: string) {
  db.transaction(() => {
    // contents 업데이트 (type을 video로 변경하거나 새 레코드 생성)
    if (task.content_id) {
      db.prepare(`
        UPDATE contents
        SET type = 'video',
            video_path = ?,
            thumbnail_path = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(videoPath, thumbnailPath, task.content_id);
    }

    // tasks 업데이트
    db.prepare(`
      UPDATE tasks SET video_path = ?, thumbnail_path = ? WHERE id = ?
    `).run(videoPath, thumbnailPath, task.id);

    addLog(task.id, 'info', `🎬 영상 저장 완료 → ${videoPath}`);
  })();
}
```

### 13.6 삭제 정책

| 삭제 대상 | 동작 |
|-----------|------|
| task 삭제 | contents도 CASCADE 삭제 (또는 orphan 유지) |
| contents 삭제 | task는 유지, content_id만 NULL로 |

```sql
-- Option A: CASCADE 삭제
ALTER TABLE contents ADD CONSTRAINT fk_task
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE;

-- Option B: SET NULL
ALTER TABLE contents ADD CONSTRAINT fk_task
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL;
```

---

## 14. 로그 설계 개선

### 14.1 확장된 task_logs 스키마

```sql
CREATE TABLE task_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id TEXT NOT NULL REFERENCES tasks(id),
  queue_id INTEGER REFERENCES task_queue(id),

  -- 기본 정보
  level TEXT CHECK(level IN ('info', 'warn', 'error')),
  message TEXT NOT NULL,

  -- 확장 정보
  action_type TEXT CHECK(action_type IN (
    'start', 'progress', 'complete', 'fail', 'retry', 'stop', 'skip'
  )),
  queue_type TEXT CHECK(queue_type IN (
    'schedule', 'script', 'image', 'video', 'youtube'
  )),

  -- 프로세스 정보 (디버깅용)
  pid INTEGER,
  process_name TEXT,

  -- 추가 데이터
  metadata TEXT,  -- JSON

  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_task_logs_task_id ON task_logs(task_id);
CREATE INDEX idx_task_logs_action ON task_logs(task_id, action_type);
CREATE INDEX idx_task_logs_queue_type ON task_logs(task_id, queue_type);
```

### 14.2 로그 헬퍼 함수

```typescript
interface LogOptions {
  queueId?: number;
  queueType?: QueueType;
  actionType?: 'start' | 'progress' | 'complete' | 'fail' | 'retry' | 'stop' | 'skip';
  pid?: number;
  processName?: string;
  metadata?: Record<string, any>;
}

function addLog(
  taskId: string,
  level: 'info' | 'warn' | 'error',
  message: string,
  options?: LogOptions
) {
  db.prepare(`
    INSERT INTO task_logs (
      task_id, queue_id, level, message,
      action_type, queue_type, pid, process_name, metadata, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `).run(
    taskId,
    options?.queueId || null,
    level,
    message,
    options?.actionType || null,
    options?.queueType || null,
    options?.pid || null,
    options?.processName || null,
    options?.metadata ? JSON.stringify(options.metadata) : null
  );
}
```

### 14.3 로그 사용 예시

```typescript
// 단계 시작
addLog(taskId, 'info', '🖼️ 이미지 크롤링 시작', {
  queueType: 'image',
  actionType: 'start',
  metadata: { sceneCount: 8, useImageFX: true }
});

// 진행 상황
addLog(taskId, 'info', '📸 씬 3/8 이미지 생성 완료', {
  queueType: 'image',
  actionType: 'progress',
  metadata: { current: 3, total: 8, sceneName: 'scene_02' }
});

// 재시도
addLog(taskId, 'warn', '⚠️ 실패, 재시도 중 (2/3)', {
  queueType: 'video',
  actionType: 'retry',
  metadata: { retryCount: 2, maxRetry: 3, error: 'FFmpeg timeout' }
});

// 중지
addLog(taskId, 'warn', '🛑 사용자에 의해 중지됨', {
  actionType: 'stop',
  metadata: { killedProcesses: ['python', 'chrome'], reason: 'user_request' }
});

// 완료
addLog(taskId, 'info', '✅ 유튜브 업로드 완료', {
  queueType: 'youtube',
  actionType: 'complete',
  metadata: { youtubeUrl: 'https://youtube.com/watch?v=xxx', videoId: 'xxx' }
});
```

### 14.4 로그 조회 API

```typescript
// GET /api/automation/logs?taskId=xxx&level=error&queueType=video
function getTaskLogs(taskId: string, filters?: {
  level?: string;
  queueType?: string;
  actionType?: string;
  limit?: number;
}) {
  let query = 'SELECT * FROM task_logs WHERE task_id = ?';
  const params: any[] = [taskId];

  if (filters?.level) {
    query += ' AND level = ?';
    params.push(filters.level);
  }
  if (filters?.queueType) {
    query += ' AND queue_type = ?';
    params.push(filters.queueType);
  }
  if (filters?.actionType) {
    query += ' AND action_type = ?';
    params.push(filters.actionType);
  }

  query += ' ORDER BY created_at DESC';

  if (filters?.limit) {
    query += ' LIMIT ?';
    params.push(filters.limit);
  }

  return db.prepare(query).all(...params);
}
```

---

## 15. 업데이트된 구현 체크리스트

### DB
- [x] tasks 테이블 생성
- [x] task_schedules 테이블 생성
- [x] task_queue 테이블 생성
- [ ] task_logs 테이블 생성 (확장 스키마)
- [ ] scheduler_lock 테이블 생성
- [ ] tasks.content_id 컬럼 추가
- [ ] contents.task_id 컬럼 추가
- [ ] 인덱스 추가

### 백엔드
- [ ] 원자적 dequeue 함수
- [ ] 트랜잭션 처리 함수
- [ ] 재시도 로직 구현
- [ ] 반복 스케줄 로직
- [ ] 스케줄러 락 구현
- [ ] **stopTask() 함수**
- [ ] **killExternalProcesses() 함수**
- [ ] **onScriptComplete() → contents 연동**
- [ ] **onVideoComplete() → contents 연동**
- [ ] **addLog() 확장 헬퍼**

### 프론트엔드
- [ ] 큐 탭 UI
- [ ] 재시도 버튼
- [ ] 로그 뷰어 (필터링 지원)
- [ ] 중지 버튼 (프로세스 종료 피드백)
