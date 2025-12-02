# UI 실패 구간 표시 개선안

**발생일:** 2025-12-03

**문제:**
- 자동화 작업이 실패했을 때 어느 단계에서 실패했는지 UI에서 명확하지 않음
- 진행률도 부정확하게 표시됨 (0% 표시)
- 에러 메시지가 숨겨져 있어 원인 파악이 어려움

**사례:**
```
제목: [광고] 스쿼드나인 귀도리 방한귀마개 4P
상태: ❌실패
진행률: 🎬 0% ← 잘못됨! (실제로는 85% 이상)

실제 진행 상황:
✅ 대본 (34s)
✅ 이미지 (3m41s)
✅ 영상 (29s)
❌ 유튜브 (실패)
```

---

## 개선 방안

### 1. 실패 구간 명확히 표시

**현재:**
```
상품
❌실패
```

**개선 후:**
```
상품
❌실패 (📺 유튜브 업로드)
```

**구현:**
```typescript
// task_queue.type에서 실패 구간 가져오기
const failedStage = {
  'script': '📝 대본 생성',
  'image': '🖼️ 이미지 크롤링',
  'video': '🎬 영상 제작',
  'youtube': '📺 유튜브 업로드'
}[task.queueType];

const statusLabel = task.status === 'failed'
  ? `❌실패 (${failedStage})`
  : task.status;
```

---

### 2. 진행률 정확하게 계산

**현재:**
- 실패 시 0% 표시

**개선 후:**
- 실패한 단계까지의 진행률 표시
  - script 실패 → 10%
  - image 실패 → 25%
  - video 실패 → 60%
  - youtube 실패 → 85%

**구현:**
```typescript
function getProgressForFailedTask(queueType: string): number {
  const stageProgress = {
    'script': 10,
    'image': 25,
    'video': 60,
    'youtube': 85
  };
  return stageProgress[queueType] || 0;
}

// UI에서 사용
const progress = task.status === 'failed'
  ? getProgressForFailedTask(task.queueType)
  : calculateProgress(task.status, task.queueType, task.taskId);
```

---

### 3. 에러 메시지 툴팁으로 표시

**현재:**
- 에러 메시지가 숨겨져 있음

**개선 후:**
- 실패 라벨에 마우스 오버 시 툴팁으로 에러 메시지 표시

**구현:**
```tsx
<div
  className="status-label"
  title={task.status === 'failed' ? task.error : ''}
>
  {task.status === 'failed'
    ? `❌실패 (${failedStage}): ${task.error?.substring(0, 50)}...`
    : statusLabel
  }
</div>
```

---

### 4. 단계별 진행 상황 시각화

**개선 후:**
각 단계에 상태 아이콘 추가:

```
✅ 📝 대본 (34s)
✅ 🖼️ 이미지 (3m41s)
✅ 🎬 영상 (29s)
❌ 📺 유튜브 (실패: 이미 처리 중...)
```

**구현:**
```typescript
const stages = ['script', 'image', 'video', 'youtube'];
const stageLabels = {
  'script': '📝 대본',
  'image': '🖼️ 이미지',
  'video': '🎬 영상',
  'youtube': '📺 유튜브'
};

stages.map(stage => {
  const isCompleted = isStageCompleted(task, stage);
  const isFailed = task.queueType === stage && task.status === 'failed';
  const icon = isFailed ? '❌' : isCompleted ? '✅' : '⏳';

  return (
    <div key={stage}>
      {icon} {stageLabels[stage]}
      {isFailed && <span className="error-msg">({task.error})</span>}
    </div>
  );
});
```

---

## 구현 우선순위

1. **[HIGH]** 실패 구간 라벨 추가 - 가장 시급
2. **[HIGH]** 진행률 정확하게 계산
3. **[MEDIUM]** 에러 메시지 툴팁
4. **[LOW]** 단계별 시각화 (선택사항)

---

## 영향받는 파일

- `src/app/automation/page.tsx` - 자동화 페이지 UI
- `src/lib/content.ts` - `calculateProgress()` 함수 수정
- `src/types/content.ts` - 타입 정의 (필요시)

---

## 테스트 방법

1. 각 단계에서 일부러 실패시키기
   - script 실패: AI 모델 API 키 잘못 설정
   - image 실패: 이미지 크롤러 에러 유도
   - video 실패: FFmpeg 경로 잘못 설정
   - youtube 실패: OAuth 토큰 삭제

2. UI에서 확인:
   - 실패 구간이 명확히 표시되는지
   - 진행률이 해당 단계까지 반영되는지
   - 에러 메시지가 보이는지

---

## 참고

- 관련 이슈: 사용자 피드백 2025-12-03
- 사례: "[광고] 스쿼드나인 귀도리 방한귀마개 4P" (task_id: 045eef94-e6f9-46bc-b27a-6befb032770f)
