# Global Queue Management System - Developer Guide

## 📋 개요

서버 전체에서 리소스를 효율적으로 관리하기 위한 글로벌 큐 시스템 설계 및 구현 가이드입니다.

### 목적
- **리소스 관리**: 서버 크래시 방지를 위한 동시 실행 제한
- **작업 격리**: 작업 유형별로 1개씩만 실행 (대본작성, 이미지크롤링, 영상제작)
- **전역 공유**: 모든 페이지/사용자가 동일한 큐 사용
- **가시성**: 관리자가 큐 상태를 실시간으로 모니터링

---

## 🏗️ 시스템 아키텍처

### 1. 큐 상태 관리 (Queue State Management)

#### 작업 상태 (Task Status)
```typescript
type TaskStatus = 'waiting' | 'processing' | 'completed' | 'failed';

interface QueueTask {
  id: string;                    // UUID
  type: 'script' | 'image' | 'video';  // 작업 타입
  status: TaskStatus;
  priority: number;               // 우선순위 (기본: 0, 높을수록 먼저)
  createdAt: string;              // ISO timestamp
  startedAt?: string;             // 처리 시작 시각
  completedAt?: string;           // 완료 시각
  userId: string;                 // 작업 생성 사용자
  projectId: string;              // 프로젝트 ID
  metadata: Record<string, any>;  // 추가 정보
  logs: string[];                 // 실시간 로그
  error?: string;                 // 에러 메시지
  retryCount: number;             // 재시도 횟수
  maxRetries: number;             // 최대 재시도
}
```

#### 큐 관리자 (Queue Manager)
```typescript
interface QueueManager {
  // 작업 추가
  enqueue(task: Omit<QueueTask, 'id' | 'status' | 'createdAt'>): Promise<QueueTask>;

  // 작업 취소
  cancel(taskId: string): Promise<boolean>;

  // 큐 상태 조회
  getQueue(type?: TaskType): Promise<QueueTask[]>;

  // 특정 작업 조회
  getTask(taskId: string): Promise<QueueTask | null>;

  // 다음 작업 가져오기 (워커용)
  dequeue(type: TaskType): Promise<QueueTask | null>;

  // 작업 상태 업데이트
  updateTask(taskId: string, updates: Partial<QueueTask>): Promise<void>;

  // 로그 추가
  appendLog(taskId: string, log: string): Promise<void>;
}
```

---

### 2. 저장소 설계 (Storage Design)

#### 옵션 A: SQLite (권장)
**장점:**
- 간단한 설정, 파일 기반
- ACID 트랜잭션 지원
- 빠른 읽기/쓰기
- 서버 재시작 시 상태 유지

**스키마:**
```sql
CREATE TABLE queue_tasks (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK(type IN ('script', 'image', 'video')),
  status TEXT NOT NULL CHECK(status IN ('waiting', 'processing', 'completed', 'failed')),
  priority INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  started_at TEXT,
  completed_at TEXT,
  user_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  metadata TEXT,  -- JSON string
  logs TEXT,      -- JSON array of strings
  error TEXT,
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,

  -- 인덱스
  INDEX idx_type_status ON queue_tasks(type, status),
  INDEX idx_created_at ON queue_tasks(created_at),
  INDEX idx_user_id ON queue_tasks(user_id)
);

CREATE TABLE queue_locks (
  task_type TEXT PRIMARY KEY CHECK(task_type IN ('script', 'image', 'video')),
  locked_by TEXT,           -- taskId currently processing
  locked_at TEXT,
  worker_pid INTEGER
);
```

#### 옵션 B: Redis
**장점:**
- 인메모리 속도
- pub/sub 기능 (실시간 업데이트)
- TTL 자동 만료

**단점:**
- 추가 서비스 필요
- 설정 복잡도 증가

---

### 3. 워커 프로세스 (Worker Process)

#### 워커 아키텍처
```
┌─────────────────────────────────────────────────────────────┐
│                     Queue Manager                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐          │
│  │  Script     │  │  Image      │  │  Video      │          │
│  │  Queue      │  │  Queue      │  │  Queue      │          │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘          │
│         │                │                │                  │
└─────────┼────────────────┼────────────────┼──────────────────┘
          │                │                │
          ▼                ▼                ▼
    ┌─────────┐      ┌─────────┐      ┌─────────┐
    │ Worker  │      │ Worker  │      │ Worker  │
    │ Script  │      │ Image   │      │ Video   │
    └─────────┘      └─────────┘      └─────────┘
         │                │                │
         ▼                ▼                ▼
    [대본 생성]      [이미지 크롤]      [영상 제작]
```

#### 워커 구현 예시
```typescript
// src/workers/queue-worker.ts
import { QueueManager } from '@/lib/queue-manager';
import { processScriptTask } from './processors/script-processor';
import { processImageTask } from './processors/image-processor';
import { processVideoTask } from './processors/video-processor';

export class QueueWorker {
  private type: TaskType;
  private manager: QueueManager;
  private running: boolean = false;
  private currentTask: QueueTask | null = null;

  constructor(type: TaskType) {
    this.type = type;
    this.manager = new QueueManager();
  }

  async start() {
    this.running = true;
    console.log(`🚀 ${this.type} worker started`);

    while (this.running) {
      try {
        // 1. 큐에서 다음 작업 가져오기
        this.currentTask = await this.manager.dequeue(this.type);

        if (!this.currentTask) {
          // 작업 없음, 5초 대기
          await this.sleep(5000);
          continue;
        }

        console.log(`▶️  Processing ${this.type} task: ${this.currentTask.id}`);

        // 2. 상태 업데이트: processing
        await this.manager.updateTask(this.currentTask.id, {
          status: 'processing',
          startedAt: new Date().toISOString()
        });

        // 3. 작업 실행
        let result;
        switch (this.type) {
          case 'script':
            result = await processScriptTask(this.currentTask, this.manager);
            break;
          case 'image':
            result = await processImageTask(this.currentTask, this.manager);
            break;
          case 'video':
            result = await processVideoTask(this.currentTask, this.manager);
            break;
        }

        // 4. 상태 업데이트: completed
        await this.manager.updateTask(this.currentTask.id, {
          status: 'completed',
          completedAt: new Date().toISOString()
        });

        console.log(`✅ ${this.type} task completed: ${this.currentTask.id}`);

      } catch (error: any) {
        console.error(`❌ ${this.type} task failed:`, error);

        if (this.currentTask) {
          const shouldRetry = this.currentTask.retryCount < this.currentTask.maxRetries;

          if (shouldRetry) {
            // 재시도: 큐에 다시 추가
            await this.manager.updateTask(this.currentTask.id, {
              status: 'waiting',
              retryCount: this.currentTask.retryCount + 1,
              error: error.message
            });
            await this.manager.appendLog(
              this.currentTask.id,
              `⚠️ 재시도 ${this.currentTask.retryCount + 1}/${this.currentTask.maxRetries}`
            );
          } else {
            // 최대 재시도 초과: 실패 처리
            await this.manager.updateTask(this.currentTask.id, {
              status: 'failed',
              completedAt: new Date().toISOString(),
              error: error.message
            });
          }
        }
      } finally {
        this.currentTask = null;
      }
    }

    console.log(`🛑 ${this.type} worker stopped`);
  }

  async stop() {
    this.running = false;
    if (this.currentTask) {
      // 현재 작업을 waiting으로 되돌림
      await this.manager.updateTask(this.currentTask.id, {
        status: 'waiting',
        startedAt: undefined
      });
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
```

---

### 4. API 엔드포인트

#### POST /api/queue/enqueue
작업을 큐에 추가합니다.

**Request:**
```typescript
{
  type: 'script' | 'image' | 'video';
  projectId: string;
  metadata: {
    // 작업별 추가 정보
    // script: { titleId, category, format }
    // image: { scenes, useImageFX }
    // video: { scriptId, duration }
  };
  priority?: number;  // 기본: 0
}
```

**Response:**
```typescript
{
  success: true;
  task: QueueTask;
  position: number;  // 큐 내 위치 (0-based)
  estimatedWaitTime?: number;  // 예상 대기 시간 (초)
}
```

#### GET /api/queue/status/:taskId
특정 작업의 상태를 조회합니다.

**Response:**
```typescript
{
  task: QueueTask;
  position?: number;  // waiting 상태일 때만
}
```

#### GET /api/queue/list
큐 전체 또는 특정 타입의 작업 목록을 조회합니다.

**Query Parameters:**
- `type?: 'script' | 'image' | 'video'`
- `status?: TaskStatus`
- `userId?: string`
- `limit?: number` (기본: 100)
- `offset?: number` (기본: 0)

**Response:**
```typescript
{
  tasks: QueueTask[];
  total: number;
  summary: {
    script: { waiting: number; processing: number; completed: number; failed: number; };
    image: { waiting: number; processing: number; completed: number; failed: number; };
    video: { waiting: number; processing: number; completed: number; failed: number; };
  };
}
```

#### DELETE /api/queue/cancel/:taskId
작업을 취소합니다 (waiting 상태만 가능).

**Response:**
```typescript
{
  success: boolean;
  message: string;
}
```

#### POST /api/queue/retry/:taskId
실패한 작업을 재시도합니다.

**Response:**
```typescript
{
  success: boolean;
  task: QueueTask;
}
```

---

### 5. 관리자 대시보드 (Admin Dashboard)

#### UI 구성
```
┌─────────────────────────────────────────────────────────────┐
│  큐 관리 대시보드                                    [새로고침] │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  📊 전체 현황                                                 │
│  ┌──────────────┬──────────────┬──────────────┐             │
│  │  대본 작성    │  이미지 크롤  │  영상 제작    │             │
│  │  대기: 3      │  대기: 1      │  대기: 0      │             │
│  │  처리중: 1    │  처리중: 1    │  처리중: 1    │             │
│  │  완료: 45     │  완료: 42     │  완료: 38     │             │
│  │  실패: 2      │  실패: 1      │  실패: 3      │             │
│  └──────────────┴──────────────┴──────────────┘             │
│                                                               │
│  🔄 실시간 작업 (자동 갱신: 5초)                              │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ [처리중] 대본작성 - project_abc123                   │    │
│  │   시작: 2분 전 | 사용자: user@example.com            │    │
│  │   로그: ✅ 제목 생성 완료 → 🔄 대본 생성 중...       │    │
│  ├─────────────────────────────────────────────────────┤    │
│  │ [처리중] 이미지크롤 - project_def456                 │    │
│  │   시작: 5분 전 | 사용자: admin@example.com           │    │
│  │   로그: 🚀 Whisk 자동화 시작 → ✅ 3/4 이미지 완료    │    │
│  ├─────────────────────────────────────────────────────┤    │
│  │ [처리중] 영상제작 - project_ghi789                   │    │
│  │   시작: 8분 전 | 사용자: creator@example.com         │    │
│  │   로그: 🎬 FFmpeg 인코딩 중... 67% 완료              │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                               │
│  ⏳ 대기 중인 작업 (4개)                                      │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ [대기] 대본작성 - project_jkl012 | 위치: 1          │    │
│  │   등록: 1분 전 | 예상 대기: ~3분                     │    │
│  │   [취소] [우선순위↑]                                  │    │
│  ├─────────────────────────────────────────────────────┤    │
│  │ [대기] 대본작성 - project_mno345 | 위치: 2          │    │
│  │   등록: 3분 전 | 예상 대기: ~6분                     │    │
│  │   [취소] [우선순위↑]                                  │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

#### React 컴포넌트 예시
```typescript
// src/app/admin/queue/page.tsx
'use client';

import { useEffect, useState } from 'react';

export default function QueueDashboard() {
  const [tasks, setTasks] = useState<QueueTask[]>([]);
  const [summary, setSummary] = useState<any>(null);

  useEffect(() => {
    // 초기 로드
    fetchQueue();

    // 5초마다 자동 갱신
    const interval = setInterval(fetchQueue, 5000);

    return () => clearInterval(interval);
  }, []);

  async function fetchQueue() {
    const response = await fetch('/api/queue/list');
    const data = await response.json();
    setTasks(data.tasks);
    setSummary(data.summary);
  }

  async function cancelTask(taskId: string) {
    if (!confirm('작업을 취소하시겠습니까?')) return;

    const response = await fetch(`/api/queue/cancel/${taskId}`, {
      method: 'DELETE'
    });

    if (response.ok) {
      alert('작업이 취소되었습니다.');
      fetchQueue();
    } else {
      alert('취소 실패: ' + (await response.json()).error);
    }
  }

  const processing = tasks.filter(t => t.status === 'processing');
  const waiting = tasks.filter(t => t.status === 'waiting');

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">큐 관리 대시보드</h1>

      {/* 전체 현황 */}
      {summary && (
        <div className="grid grid-cols-3 gap-4 mb-8">
          {['script', 'image', 'video'].map(type => (
            <div key={type} className="border rounded-lg p-4">
              <h3 className="font-semibold mb-2">
                {type === 'script' ? '대본작성' : type === 'image' ? '이미지크롤링' : '영상제작'}
              </h3>
              <div className="space-y-1 text-sm">
                <div>대기: {summary[type].waiting}</div>
                <div>처리중: {summary[type].processing}</div>
                <div>완료: {summary[type].completed}</div>
                <div>실패: {summary[type].failed}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 처리중 작업 */}
      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4">🔄 실시간 작업</h2>
        {processing.length === 0 ? (
          <p className="text-gray-500">처리 중인 작업이 없습니다.</p>
        ) : (
          <div className="space-y-4">
            {processing.map(task => (
              <div key={task.id} className="border rounded-lg p-4 bg-blue-50">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <span className="font-semibold">[처리중]</span>
                    <span className="ml-2">{task.type === 'script' ? '대본작성' : task.type === 'image' ? '이미지크롤링' : '영상제작'}</span>
                    <span className="ml-2 text-gray-600">{task.projectId}</span>
                  </div>
                  <span className="text-sm text-gray-500">
                    시작: {formatTimeAgo(task.startedAt)}
                  </span>
                </div>
                <div className="text-sm text-gray-600 mb-2">
                  사용자: {task.userId}
                </div>
                <div className="text-sm">
                  로그: {task.logs.slice(-3).join(' → ')}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 대기 작업 */}
      <section>
        <h2 className="text-xl font-semibold mb-4">⏳ 대기 중인 작업 ({waiting.length}개)</h2>
        {waiting.length === 0 ? (
          <p className="text-gray-500">대기 중인 작업이 없습니다.</p>
        ) : (
          <div className="space-y-2">
            {waiting.map((task, index) => (
              <div key={task.id} className="border rounded-lg p-4 flex justify-between items-center">
                <div>
                  <span className="font-semibold">[대기]</span>
                  <span className="ml-2">{task.type === 'script' ? '대본작성' : task.type === 'image' ? '이미지크롤링' : '영상제작'}</span>
                  <span className="ml-2 text-gray-600">{task.projectId}</span>
                  <span className="ml-4 text-sm text-gray-500">위치: {index + 1}</span>
                </div>
                <div className="space-x-2">
                  <button
                    onClick={() => cancelTask(task.id)}
                    className="px-3 py-1 text-sm border rounded hover:bg-gray-100"
                  >
                    취소
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function formatTimeAgo(timestamp?: string): string {
  if (!timestamp) return '-';
  const diff = Date.now() - new Date(timestamp).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return '방금 전';
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  return `${hours}시간 전`;
}
```

---

### 6. 기존 코드 통합

#### 자동화 페이지 수정 예시

**Before (직접 실행):**
```typescript
async function handleGenerateScript() {
  // 바로 대본 생성 API 호출
  const response = await fetch('/api/automation/generate-script', {
    method: 'POST',
    body: JSON.stringify({ titleId, category })
  });
  // ...
}
```

**After (큐 사용):**
```typescript
async function handleGenerateScript() {
  // 큐에 작업 추가
  const response = await fetch('/api/queue/enqueue', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'script',
      projectId,
      metadata: { titleId, category }
    })
  });

  const { task, position, estimatedWaitTime } = await response.json();

  alert(`대본 생성이 큐에 추가되었습니다!\n\n위치: ${position + 1}번째\n예상 대기: 약 ${Math.ceil(estimatedWaitTime / 60)}분`);

  // 폴링 시작
  startPolling(task.id);
}

async function startPolling(taskId: string) {
  const interval = setInterval(async () => {
    const response = await fetch(`/api/queue/status/${taskId}`);
    const { task } = await response.json();

    // UI 업데이트
    updateTaskStatus(task);

    if (task.status === 'completed' || task.status === 'failed') {
      clearInterval(interval);

      if (task.status === 'completed') {
        alert('대본 생성이 완료되었습니다!');
        refreshData();
      } else {
        alert(`대본 생성 실패: ${task.error}`);
      }
    }
  }, 5000);
}
```

---

### 7. 워커 프로세스 실행

#### 개발 환경 (npm script)
```json
// package.json
{
  "scripts": {
    "worker:script": "ts-node src/workers/script-worker.ts",
    "worker:image": "ts-node src/workers/image-worker.ts",
    "worker:video": "ts-node src/workers/video-worker.ts",
    "workers:all": "concurrently \"npm run worker:script\" \"npm run worker:image\" \"npm run worker:video\""
  }
}
```

#### 프로덕션 환경 (PM2)
```javascript
// ecosystem.config.js
module.exports = {
  apps: [
    {
      name: 'queue-worker-script',
      script: './dist/workers/script-worker.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
        WORKER_TYPE: 'script'
      }
    },
    {
      name: 'queue-worker-image',
      script: './dist/workers/image-worker.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        WORKER_TYPE: 'image'
      }
    },
    {
      name: 'queue-worker-video',
      script: './dist/workers/video-worker.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '2G',
      env: {
        NODE_ENV: 'production',
        WORKER_TYPE: 'video'
      }
    }
  ]
};
```

**실행:**
```bash
pm2 start ecosystem.config.js
pm2 logs
pm2 status
```

---

### 8. 에러 처리 및 모니터링

#### 데드 레터 큐 (Dead Letter Queue)
최대 재시도 후에도 실패한 작업을 별도 테이블에 보관:

```sql
CREATE TABLE dead_letter_queue (
  id TEXT PRIMARY KEY,
  original_task_id TEXT,
  type TEXT,
  failed_at TEXT,
  error_message TEXT,
  task_data TEXT,  -- JSON
  retry_history TEXT  -- JSON array
);
```

#### 로깅
```typescript
import winston from 'winston';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'queue-error.log', level: 'error' }),
    new winston.transports.File({ filename: 'queue-combined.log' }),
  ],
});

// 사용
logger.info('Task started', { taskId, type });
logger.error('Task failed', { taskId, error: error.message });
```

#### 헬스 체크
```typescript
// GET /api/queue/health
export async function GET() {
  const manager = new QueueManager();

  // 각 타입별 처리 중인 작업 확인
  const script = await manager.getQueue('script').filter(t => t.status === 'processing');
  const image = await manager.getQueue('image').filter(t => t.status === 'processing');
  const video = await manager.getQueue('video').filter(t => t.status === 'processing');

  // 10분 이상 처리 중인 작업 감지 (stuck task)
  const now = Date.now();
  const stuckTasks = [...script, ...image, ...video].filter(task => {
    const startedAt = new Date(task.startedAt!).getTime();
    return now - startedAt > 10 * 60 * 1000;
  });

  return NextResponse.json({
    healthy: stuckTasks.length === 0,
    workers: {
      script: { active: script.length > 0 },
      image: { active: image.length > 0 },
      video: { active: video.length > 0 }
    },
    stuckTasks: stuckTasks.map(t => ({ id: t.id, type: t.type, startedAt: t.startedAt }))
  });
}
```

---

### 9. 성능 최적화

#### 인덱스 최적화
```sql
-- 빈번한 쿼리에 대한 인덱스
CREATE INDEX idx_type_status_priority ON queue_tasks(type, status, priority DESC, created_at ASC);

-- 사용자별 조회
CREATE INDEX idx_user_status ON queue_tasks(user_id, status);

-- 완료/실패 작업 정리를 위한 인덱스
CREATE INDEX idx_completed_at ON queue_tasks(completed_at) WHERE status IN ('completed', 'failed');
```

#### 오래된 작업 자동 정리
```typescript
// Cron job: 매일 자정에 실행
async function cleanupOldTasks() {
  const db = await getDatabase();
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  // 30일 이상 된 완료/실패 작업 삭제
  await db.run(`
    DELETE FROM queue_tasks
    WHERE status IN ('completed', 'failed')
    AND completed_at < ?
  `, thirtyDaysAgo.toISOString());

  console.log('✅ Old tasks cleaned up');
}
```

---

### 10. 테스트

#### 단위 테스트
```typescript
// src/lib/__tests__/queue-manager.test.ts
import { QueueManager } from '../queue-manager';

describe('QueueManager', () => {
  let manager: QueueManager;

  beforeEach(async () => {
    manager = new QueueManager(':memory:');  // 인메모리 DB
  });

  test('should enqueue task', async () => {
    const task = await manager.enqueue({
      type: 'script',
      userId: 'test-user',
      projectId: 'test-project',
      metadata: {},
      priority: 0,
      retryCount: 0,
      maxRetries: 3,
      logs: []
    });

    expect(task.id).toBeDefined();
    expect(task.status).toBe('waiting');
  });

  test('should dequeue task by type', async () => {
    await manager.enqueue({ type: 'script', /* ... */ });
    await manager.enqueue({ type: 'image', /* ... */ });

    const scriptTask = await manager.dequeue('script');
    expect(scriptTask?.type).toBe('script');
    expect(scriptTask?.status).toBe('processing');
  });

  test('should respect priority', async () => {
    const low = await manager.enqueue({ type: 'script', priority: 0, /* ... */ });
    const high = await manager.enqueue({ type: 'script', priority: 10, /* ... */ });

    const dequeued = await manager.dequeue('script');
    expect(dequeued?.id).toBe(high.id);  // 높은 우선순위 먼저
  });
});
```

---

## 📌 구현 체크리스트

### Phase 1: 기본 인프라
- [ ] SQLite 스키마 생성
- [ ] QueueManager 클래스 구현
- [ ] API 엔드포인트 구현 (/api/queue/*)
- [ ] 단위 테스트 작성

### Phase 2: 워커 프로세스
- [ ] 각 타입별 워커 구현 (script, image, video)
- [ ] 로깅 시스템 통합
- [ ] 에러 처리 및 재시도 로직
- [ ] PM2 설정

### Phase 3: UI 통합
- [ ] 관리자 대시보드 구현
- [ ] 자동화 페이지 큐 통합
- [ ] 실시간 상태 폴링
- [ ] 사용자 알림 (완료/실패)

### Phase 4: 모니터링 및 최적화
- [ ] 헬스 체크 엔드포인트
- [ ] Stuck task 감지 및 복구
- [ ] 성능 인덱스 최적화
- [ ] 자동 정리 Cron job

### Phase 5: 문서화 및 배포
- [ ] API 문서 작성
- [ ] 운영 가이드 작성
- [ ] 프로덕션 배포
- [ ] 모니터링 대시보드 설정

---

## 🚀 빠른 시작

### 1. 저장소 설정
```bash
cd trend-video-frontend
npm install better-sqlite3  # 또는 ioredis
```

### 2. 데이터베이스 초기화
```bash
node scripts/init-queue-db.js
```

### 3. 워커 실행
```bash
npm run workers:all
```

### 4. 개발 서버 실행
```bash
npm run dev
```

### 5. 관리자 대시보드 접속
```
http://localhost:3000/admin/queue
```

---

Generated with [Claude Code](https://claude.com/claude-code)
