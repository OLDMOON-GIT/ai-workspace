# 자동화 테이블 관계도 (Development Guide)

## 핵심 규칙

```
⭐ ID 통일: task.id = content.content_id = task_queue.task_id = task_schedule.task_id
⭐ 파일 경로: tasks/{task_id}/story.json, output.mp4, thumbnail.png
```

## 테이블 관계도

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           테이블 관계도                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│    task (작업 설정)                                                          │
│    ├── id (PK)                       ⭐ 모든 테이블의 기준 ID                  │
│    ├── title                         제목                                   │
│    ├── type                          shortform/longform/product/sora2       │
│    ├── status                        draft/active/completed/archived        │
│    │                                 ⚠️ 작업 자체의 라이프사이클 상태          │
│    ├── category                      카테고리 (상품이면 "상품")               │
│    ├── channel                       YouTube 채널                           │
│    ├── model                         AI 모델 (claude)                       │
│    ├── product_info (JSON)           상품 정보 (URL, 썸네일, 설명)           │
│    ├── ❌ product_url                 DEPRECATED - product_info 사용!        │
│    └── user_id (FK → user)           소유자                                 │
│         │                                                                   │
│         ├──────────────────────┬────────────────────┐                       │
│         │                      │                    │                       │
│         ▼                      ▼                    ▼                       │
│    task_schedule          task_queue            content                     │
│    (스케줄 정보만!)       (상태 관리!)          (생성물)                     │
│    ├── task_id (FK)       ├── task_id (FK)      ├── content_id = task_id    │
│    ├── scheduled_time     ├── type              │   (PK의 일부)             │
│    ├── youtube_publish    │   (schedule/        ├── type (script/video)     │
│    ├── youtube_privacy    │    script/image/    │   (PK의 일부)             │
│    │                      │    video/youtube)   ├── task_id (FK)            │
│    │  ⚠️ status 없음!     ├── status            ├── product_info (JSON)     │
│    │  task_queue 사용!    │   (waiting/         ├── category                │
│    │                      │    processing/      └── ...                     │
│    │                      │    completed/                                   │
│    │                      │    failed/                                      │
│    │                      │    cancelled)                                   │
│    │                      ├── error                                         │
│    │                      └── retry_count                                   │
│    │                                                                        │
│    └── ⚠️ task_schedule.status는 DB에 있지만 사용하지 않음!                  │
│        → task_queue.status 사용!                                            │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## 역할 분리 (⭐ 중요!)

### 1. task (작업 설정)
- **역할**: 작업의 기본 정보와 설정 저장
- **저장 항목**: title, type, category, channel, model, product_info
- **status**: `draft` → `active` → `completed` → `archived` (작업 자체의 라이프사이클)
  - ⚠️ 처리 상태가 아님! 처리 상태는 task_queue에서 관리

### 2. task_schedule (스케줄 정보)
- **역할**: 언제 실행할지에 대한 스케줄 정보만!
- **저장 항목**: scheduled_time, youtube_publish_time, youtube_privacy
- **status 컬럼 존재하지만**: ❌ 사용하지 않음! task_queue.status 사용

### 3. task_queue (⭐ 상태 관리의 핵심)
- **역할**: 각 단계별 실행 상태 관리
- **PK**: (task_id, type)
- **단계 (type)**:
  - `schedule` - 스케줄 전체 상태
  - `script` - 대본 생성 단계
  - `image` - 이미지 생성 단계
  - `video` - 영상 생성 단계
  - `youtube` - YouTube 업로드 단계
- **상태 (status)**:
  - `waiting` - 대기 중
  - `processing` - 처리 중
  - `completed` - 완료
  - `failed` - 실패
  - `cancelled` - 취소됨

### 4. content (생성물)
- **역할**: 생성된 대본/영상 저장
- **PK**: (content_id, type)
- **ID 규칙**: content_id = task_id (동일!)
- **저장 항목**: 대본 내용, 진행률, product_info (task에서 전달)

## ❌ 사용하지 말 것 (Deprecated)

| 컬럼/테이블 | 위치 | 대신 사용할 것 |
|------------|------|----------------|
| `task.product_url` | task | `task.product_info.product_link` (JSON) |
| `task_schedule.status` | task_schedule | `task_queue.status` (type='schedule') |
| `tasks` (복수형) | - | `task` (단수형) |
| `contents` (복수형) | - | `content` (단수형) |
| `content.video_path` | content | `tasks/{content_id}/output.mp4` 경로 계산 |
| `content.thumbnail_path` | content | `tasks/{content_id}/thumbnail.png` 경로 계산 |

## ❌ 흔한 실수들

### 1. 잘못된 상태 조회
```typescript
// ❌ 잘못됨 - task_schedule.status는 사용하지 않음!
db.prepare(`SELECT * FROM task_schedule WHERE status = 'waiting'`)

// ✅ 올바름 - task_queue.status 사용
db.prepare(`
  SELECT s.* FROM task_schedule s
  JOIN task_queue q ON s.task_id = q.task_id AND q.type = 'schedule'
  WHERE q.status = 'waiting'
`)
```

### 2. 잘못된 테이블명
```typescript
// ❌ 잘못됨 - tasks (복수형)
db.prepare(`SELECT * FROM tasks`)

// ✅ 올바름 - task (단수형)
db.prepare(`SELECT * FROM task`)
```

### 3. 잘못된 product_url 사용
```typescript
// ❌ 잘못됨 - product_url 컬럼 직접 사용
INSERT INTO task (id, product_url) VALUES (?, ?)

// ✅ 올바름 - product_info JSON 사용
INSERT INTO task (id, product_info) VALUES (?, json(?))
// product_info = { product_link: '...', thumbnail: '...', description: '...' }
```

### 4. 파일 경로 하드코딩
```typescript
// ❌ 잘못됨 - DB 컬럼에서 경로 읽기
const videoPath = row.video_path;

// ✅ 올바름 - content_id로 경로 계산
const videoPath = `tasks/${contentId}/output.mp4`;
```

### 5. ⭐ task_ prefix 붙이기 (절대 금지!)
```typescript
// ❌ 잘못됨 - task_ prefix 붙이기
const taskId = `task_${Date.now()}_${Math.random()}`;
const folderPath = path.join('tasks', `task_${schedule.task_id}`);

// ✅ 올바름 - UUID만 사용 (prefix 없음!)
const taskId = crypto.randomUUID();
const folderPath = path.join('tasks', schedule.task_id);
```

### 6. prefix 처리 시 올바른 방법
```typescript
// ❌ 잘못됨 - prefix 붙이기
if (!contentId.startsWith('task_')) {
  taskId = `task_${contentId}`;
}

// ✅ 올바름 - prefix 제거하기
let cleanId = contentId;
if (contentId.startsWith('project_')) {
  cleanId = contentId.replace('project_', '');
} else if (contentId.startsWith('task_')) {
  cleanId = contentId.replace('task_', '');
}
// cleanId는 순수 UUID
```

## 데이터 흐름

### 스케줄 생성
```
1. task 생성 (설정 저장)
   INSERT INTO task (id, title, type, product_info, ...)
   ↓
2. task_schedule 생성 (스케줄 정보)
   INSERT INTO task_schedule (task_id, scheduled_time, ...)
   ↓
3. task_queue 생성 (상태 관리)
   INSERT INTO task_queue (task_id, type='schedule', status='waiting', ...)
```

### 대본 생성 처리
```
1. task_queue 상태 변경
   UPDATE task_queue SET status='processing' WHERE task_id=? AND type='script'
   ↓
2. content 생성
   INSERT INTO content (content_id=task_id, type='script', product_info, ...)
   ↓
3. story.json 파일 생성
   tasks/{task_id}/story.json
   ↓
4. task_queue 완료
   UPDATE task_queue SET status='completed' WHERE task_id=? AND type='script'
```

### 영상 생성 처리
```
1. task_queue 상태 변경 (type='video')
   ↓
2. content 생성 (type='video', content_id=task_id)
   ↓
3. 파일 생성
   - tasks/{task_id}/output.mp4
   - tasks/{task_id}/thumbnail.png
   ↓
4. task_queue 완료
```

## 주요 함수 매핑

| 함수 | 테이블 | 설명 |
|------|--------|------|
| `addVideoTitle()` | task | 작업 생성 |
| `addSchedule()` | task_schedule + task_queue | 스케줄 + 큐 생성 |
| `updateScheduleStatus()` | task_queue | 상태 업데이트 (⚠️ task_schedule이 아님!) |
| `getQueueCounts()` | task_queue | 상태별 카운트 |
| `getAllSchedules()` | task + task_schedule + task_queue | 스케줄 목록 조회 |
| `createContent()` | content | 콘텐츠 생성 |
| `retryFailedSchedule()` | task_queue | 재시도 |
| `cancelSchedule()` | task_queue | 취소 |

## 테이블 스키마 요약

### task
```sql
CREATE TABLE task (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('shortform', 'longform', 'product', 'product-info', 'sora2')),
  status TEXT DEFAULT 'draft' CHECK(status IN ('draft', 'active', 'completed', 'archived')),
  user_id TEXT,
  product_info TEXT,  -- ⭐ JSON: { product_link, thumbnail, description }
  category TEXT,
  channel TEXT,
  model TEXT,
  -- product_url TEXT,  -- ❌ DEPRECATED - product_info 사용!
  created_at DATETIME,
  updated_at DATETIME
);
```

### task_schedule
```sql
CREATE TABLE task_schedule (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  scheduled_time DATETIME NOT NULL,
  youtube_publish_time DATETIME,
  youtube_privacy TEXT DEFAULT 'public',
  -- status TEXT,  -- ❌ 사용하지 않음! task_queue.status 사용
  FOREIGN KEY (task_id) REFERENCES task(id)
);
```

### task_queue
```sql
CREATE TABLE task_queue (
  task_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('schedule', 'script', 'image', 'video', 'youtube')),
  status TEXT NOT NULL CHECK(status IN ('waiting', 'processing', 'completed', 'failed', 'cancelled')),
  user_id TEXT NOT NULL,
  error TEXT,
  retry_count INTEGER DEFAULT 0,
  PRIMARY KEY (task_id, type)
);
```

### content
```sql
CREATE TABLE content (
  content_id TEXT NOT NULL,  -- ⭐ = task_id
  type TEXT NOT NULL CHECK(type IN ('script', 'video')),
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  progress INTEGER DEFAULT 0,
  product_info TEXT,  -- ⭐ task에서 전달받음
  category TEXT,
  -- video_path TEXT,  -- ❌ DEPRECATED - 경로 계산 사용
  -- thumbnail_path TEXT,  -- ❌ DEPRECATED - 경로 계산 사용
  PRIMARY KEY (content_id, type)
);
```

## 테스트

통합 테스트 실행:
```bash
node scripts/test-table-relations.js
```

테스트 항목:
1. 테이블 구조 확인
2. ID 통일 규칙 검증
3. product_info 전달 검증
4. 상태 전이 테스트 (task_queue 기반)
5. 다단계 큐 테스트 (schedule → script → image → video → youtube)
