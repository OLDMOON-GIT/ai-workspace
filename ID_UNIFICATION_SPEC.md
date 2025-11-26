# ID 통합 스펙 (UUID 기반)

## 📋 핵심 원칙

**모든 작업은 하나의 UUID를 중심으로 관리된다**

```
대본 생성 → UUID 폴더 생성 → 모든 파일이 이 폴더에 저장
```

## 🆔 ID 규칙

### 1. 유일한 ID: UUID
- **형식**: `8bf8d1f1-fa61-46d3-9def-7383a1ea560e` (UUID v4)
- **생성 시점**: 대본 생성 시작 시
- **사용처**: 모든 곳에서 동일한 UUID 사용

### 2. ID 이름 통일
```typescript
// ✅ 올바른 이름
const projectId = "8bf8d1f1-fa61-46d3-9def-7383a1ea560e";
const scriptId = projectId;  // 같은 값
const titleId = projectId;   // 같은 값
const taskId = projectId;    // 같은 값

// ❌ 잘못된 이름 (사용 금지)
const id = `task_${Date.now()}_${random()}`;  // 타임스탬프 형식
const id = `1764083366546_dh69cc741ps`;        // 타임스탬프 + 랜덤
```

## 📁 폴더 구조

### 폴더 이름: 순수 UUID만 사용
```
trend-video-backend/
  tasks/
    8bf8d1f1-fa61-46d3-9def-7383a1ea560e/    ← UUID 폴더
      story.json                               ← 대본 (scenes 포함)
      scene_00_hook.jpeg                       ← 이미지
      scene_01_problem.jpeg
      scene_02_solution.jpeg
      final_video.mp4                          ← 최종 영상
      product_thumbnail.png                    ← 상품 썸네일 (있는 경우)
```

### ❌ 금지된 폴더 이름
```
tasks/
  task_1764083366546_dh69cc741ps/             ✗ task_ prefix
  1764083366546_dh69cc741ps/                  ✗ 타임스탬프
  task_8bf8d1f1-fa61-46d3-9def-7383a1ea560e/  ✗ task_ prefix
```

## 🔄 작업 흐름

### 1단계: 대본 생성 (Script Generation)
```typescript
// 1. UUID 생성
const projectId = crypto.randomUUID();  // "8bf8d1f1-fa61-46d3-9def-7383a1ea560e"

// 2. DB에 저장
- video_titles.id = projectId
- video_scripts.id = projectId
- task_schedules.title_id = projectId
- task_schedules.task_id = projectId  // title_id와 동일

// 3. 폴더 생성
tasks/${projectId}/story.json
```

### 2단계: 이미지 크롤링 (Image Crawling)
```typescript
// 큐에 등록
queueManager.enqueue({
  taskId: projectId,  // 동일한 UUID
  type: 'image',
  metadata: {
    scriptId: projectId,  // 동일한 UUID
    product_info: { ... }
  }
});

// 이미지 저장 위치
tasks/${projectId}/scene_00.jpeg
tasks/${projectId}/scene_01.jpeg
```

### 3단계: 영상 제작 (Video Generation)
```typescript
// 입력
const projectId = task.taskId;  // 동일한 UUID

// 파일 읽기
const storyJson = readFile(`tasks/${projectId}/story.json`);
const images = readDir(`tasks/${projectId}/`);

// 영상 저장
tasks/${projectId}/final_video.mp4
```

### 4단계: 유튜브 업로드 (YouTube Upload)
```typescript
// 입력
const projectId = schedule.title_id;  // 동일한 UUID

// 파일 읽기
const video = `tasks/${projectId}/final_video.mp4`;
```

## 🗄️ 데이터베이스 스키마

### video_titles
```sql
id TEXT PRIMARY KEY  -- UUID (예: "8bf8d1f1-fa61-46d3-9def-7383a1ea560e")
```

### video_scripts
```sql
id TEXT PRIMARY KEY  -- UUID (video_titles.id와 동일)
title_id TEXT        -- UUID (video_titles.id 참조)
```

### task_schedules
```sql
title_id TEXT        -- UUID (video_titles.id 참조)
task_id TEXT         -- UUID (title_id와 동일한 값)
```

### tasks_queue
```sql
taskId TEXT          -- UUID (title_id와 동일)
metadata JSON {
  scriptId: "UUID",  -- title_id와 동일
  titleId: "UUID"    -- title_id와 동일
}
```

## ✅ 검증 체크리스트

- [ ] 대본 생성 시 UUID 생성 확인
- [ ] 폴더 이름에 prefix 없음 (task_, title_ 등)
- [ ] 폴더 이름에 타임스탬프 없음
- [ ] story.json이 UUID 폴더에 저장됨
- [ ] 이미지가 같은 UUID 폴더에 저장됨
- [ ] 영상이 같은 UUID 폴더에 저장됨
- [ ] 모든 DB 레코드가 동일한 UUID 사용

## 🚨 중요 참고사항

1. **하나의 프로젝트 = 하나의 UUID = 하나의 폴더**
2. **대본 없이 폴더 생성 금지**
3. **UUID는 대본 생성 시점에만 생성**
4. **모든 후속 작업은 기존 UUID 재사용**
5. **폴더 이름 변경 금지 (UUID 고정)**

---

**작성일**: 2025-11-26
**버전**: 1.1
**상태**: ✅ 적용 완료

## 수정된 파일 목록 (2025-11-26)

| 파일 | 수정 내용 |
|------|----------|
| `src/app/api/images/crawl/route.ts` | `task_` prefix 제거 로직으로 변경 |
| `src/lib/automation-scheduler.ts` | 4곳의 `task_` prefix 사용 제거, UUID 사용 |
| `src/app/api/queue/enqueue/route.ts` | `task_` prefix → UUID 사용 |
| `md/TABLE_RELATIONS.md` | prefix 금지 규칙 추가 |
