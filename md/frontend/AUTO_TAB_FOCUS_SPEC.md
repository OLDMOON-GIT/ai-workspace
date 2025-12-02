# 자동화 페이지 탭 자동 이동 스펙

## 개요
자동화 페이지(/automation)에서 사용자 편의를 위한 탭 자동 전환 로직

## 1. 페이지 로드 시 자동 포커싱

### 동작
- 페이지 로드 시 **첫 번째 스케줄의 tabType**으로 자동 전환
- **최초 1회만** 실행 (`hasAutoExpandedLast` ref 사용)

### 구현 위치
- `trend-video-frontend/src/app/automation/page.tsx`
- Line 698-708: useEffect hook

### 코드
```typescript
// 페이지 로드 시 첫 번째 스케줄의 탭으로 자동 포커싱
useEffect(() => {
  if (!hasAutoExpandedLast.current && schedules.length > 0) {
    // schedules 배열에서 첫 번째 항목 가져오기
    const firstSchedule = schedules[0];
    if (firstSchedule && firstSchedule.tabType) {
      setQueueTab(firstSchedule.tabType);
      hasAutoExpandedLast.current = true;
    }
  }
}, [schedules]);
```

### 예시
- 첫 번째 스케줄이 youtube 단계 → youtube 탭으로 자동 전환
- 첫 번째 스케줄이 failed 상태 → failed 탭으로 자동 전환
- 첫 번째 스케줄이 schedule 대기 중 → schedule 탭으로 자동 전환

## 2. 폴링 중 자동 업데이트

### 동작
- 사용자가 **조작하지 않을 때만** 데이터 폴링 및 업데이트
- `isEditingRef`로 수정 중 여부 체크
- **탭 전환은 하지 않음** (데이터만 업데이트)

### 조작 감지 조건
```typescript
isEditingRef.current = !!(editingId || showAddForm || expandedLogsFor);
```

- `editingId`: 제목 수정 중
- `showAddForm`: 제목 추가 폼 열림
- `expandedLogsFor`: 로그 펼침 상태

### 대기 시간
- 조작 후 **20초 동안** 폴링 중단
- 20초 후 자동으로 폴링 재개

## 3. 액션 버튼 클릭 시 즉시 탭 전환

### 동작
- 재시도, 즉시실행 등 **액션 버튼 클릭 시** 해당 작업의 탭으로 **즉시 전환**
- 사용자가 결과를 바로 확인할 수 있도록 함

### 대상 버튼
1. **즉시실행** (`forceExecute`)
   - 클릭 시 → `script` 탭으로 전환
   - 대본 생성부터 시작하므로

2. **재시도** (`handleRetry`)
   - 선택한 단계(type)에 따라 탭 전환
   - script 재시도 → `script` 탭
   - image 재시도 → `image` 탭
   - video 재시도 → `video` 탭
   - youtube 재시도 → `youtube` 탭

3. **대본 재생성** (🔄대본 버튼)
   - 클릭 시 → `script` 탭으로 전환

4. **YouTube 업로드** (YouTubeUploadButton)
   - 업로드 시작 시 → `youtube` 탭으로 전환

### 구현 필요
```typescript
// forceExecute 함수 내부
setQueueTab('script');

// handleRetry 함수 내부
if (type === 'script') setQueueTab('script');
else if (type === 'image') setQueueTab('image');
else if (type === 'video') setQueueTab('video');
else if (type === 'youtube') setQueueTab('youtube');

// 대본 재생성 버튼 onClick
setQueueTab('script');

// YouTubeUploadButton 컴포넌트
onUploadStart={() => setQueueTab('youtube')}
```

## tabType 필드

### 소스
- API: `http://localhost:2000/api/automation/schedules`
- 서버에서 각 스케줄의 현재 상태에 맞는 tabType 제공

### 가능한 값
- `schedule`: 예약 대기 중
- `script`: 대본 처리 중/완료
- `image`: 이미지 처리 중/완료
- `video`: 영상 처리 중/완료
- `youtube`: 유튜브 업로드 중/완료
- `failed`: 실패
- `completed`: 완료
- `cancelled`: 취소됨

### 특징
- **항상 존재하는 필드** (fallback 로직 불필요)
- 서버에서 status 기반으로 자동 계산됨

## 주의사항

1. **최초 로드만 자동 전환**
   - 폴링 중에는 탭을 강제로 바꾸지 않음
   - 사용자가 completed 탭을 보고 있으면 그대로 유지

2. **사용자 조작 우선**
   - 사용자가 뭔가 클릭/수정 중이면 폴링도 중단
   - UX 방해 최소화

3. **액션 버튼은 즉시 전환**
   - 사용자가 명시적으로 작업을 시작했으므로
   - 해당 작업의 진행 상황을 바로 보여줌

## 구현 상태

- ✅ 페이지 로드 시 자동 포커싱 (완료)
- ✅ 폴링 중 조작 감지 (기존 구현 있음)
- ⏳ 액션 버튼 클릭 시 탭 전환 (미구현, 필요 시 추가)

## 관련 파일

- `trend-video-frontend/src/app/automation/page.tsx`
- `trend-video-backend/src/routes/automation.ts` (tabType 계산)
