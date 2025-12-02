# Task Queue Flow 명세

## 📋 전체 플로우

⚠️ **핵심: completed 상태를 거치지 않고 바로 다음 phase의 waiting으로 전환!**

```
schedule waiting
    ↓ (processPendingSchedules)
script processing
    ├─ 성공 → image waiting (바로!)
    │     ↓ (processQueue 락 획득)
    │   image processing
    │     ├─ 성공 → video waiting (바로!)
    │     │     ↓ (processQueue 락 획득)
    │     │   video processing
    │     │     ├─ 성공 → youtube waiting (바로!)
    │     │     │     ↓ (processQueue 락 획득)
    │     │     │   youtube processing
    │     │     │     ├─ 성공 → youtube completed ✅ (최종 완료)
    │     │     │     ├─ 실패 → youtube failed ❌
    │     │     │     └─ 취소 → youtube cancelled ⛔
    │     │     ├─ 실패 → video failed ❌
    │     │     └─ 취소 → video cancelled ⛔
    │     ├─ 실패 → image failed ❌
    │     └─ 취소 → image cancelled ⛔
    ├─ 실패 → script failed ❌
    └─ 취소 → script cancelled ⛔
```

## 🔄 Phase Transitions

⚠️ **processQueue()가 작업 완료 시 바로 다음 phase의 waiting으로 전환 (completed 거치지 않음!)**

| 현재 Phase | 상태 | 다음 Phase | 전환 함수 |
|-----------|-----|----------|----------|
| schedule | waiting | script | `processPendingSchedules()` (script waiting 생성) |
| script | processing → 성공 | image | `processQueue()` → image waiting (바로!) |
| image | processing → 성공 | video | `processQueue()` → video waiting (바로!) |
| video | processing → 성공 | youtube | `processQueue()` → youtube waiting (바로!) |
| youtube | processing → 성공 | - | `processQueue()` → youtube completed (최종 완료) |

**📝 recoverOrphanedPipelines()는?**
- 서버 중단/에러 시 복구용 (completed → waiting 전환)
- 정상 플로우에서는 사용되지 않음 (바로 waiting으로 전환)

## ⛔ 중단 상태 (전환 없음)

- `failed`: 해당 단계에서 실패 → 더 이상 진행하지 않음
- `cancelled`: 사용자가 취소 → 더 이상 진행하지 않음

## 📌 상태 정의

### task_queue.type (단계)
- `schedule`: 예약 대기
- `script`: 대본 생성
- `image`: 이미지 생성/크롤링
- `video`: 영상 생성
- `youtube`: YouTube 업로드

### task_queue.status (상태)
- `waiting`: 대기 중 (다음 실행 대상)
- `processing`: 처리 중
- `completed`: 완료 (다음 단계로 전환 대상)
- `failed`: 실패 (중단)
- `cancelled`: 취소 (중단)

## 🔍 핵심 함수

1. **recoverOrphanedPipelines()** (60초마다)
   - `completed` 상태 찾기
   - 다음 phase로 type 변경
   - status를 `waiting`으로 변경

2. **processPendingSchedules()** (60초마다)
   - scheduled_time 도래한 task 찾기
   - task_queue에 script waiting 등록

3. **processQueue(type, executor)** (모든 phase 공통)
   - **락 획득 로직 (각 타입에 processing 하나만):**
     1. processing 카운트 확인 → 이미 있으면 skip
     2. task_lock 테이블 확인 → 다른 워커가 작업 중이면 skip
     3. waiting 큐 조회
     4. **waiting → processing 변경**
     5. **task_lock 획득** (다른 워커 충돌 방지)
     6. executor 실행
     7. 완료 후 **task_lock 해제**

4. **processScriptQueue()** (60초마다)
   - processQueue('script', executePipeline) 호출
   - 대본 생성 실행

5. **processVideoQueue()** (60초마다)
   - processQueue('video', videoExecutor) 호출
   - 영상 생성 실행

6. **processYoutubeQueue()** (60초마다)
   - processQueue('youtube', youtubeExecutor) 호출
   - YouTube 업로드 실행

## ⚠️ 주의사항

1. **schedule → script 전환**
   - task_queue가 없으면 `processPendingSchedules()`가 생성
   - 즉시실행은 `force-execute API`가 직접 생성

2. **image 단계**
   - 이미지 워커가 별도 프로세스로 실행
   - task_queue에서 image waiting을 찾아서 처리

3. **완료 판정**
   - `youtube completed` 상태만 최종 완료로 간주
   - 다른 단계의 completed는 중간 완료 (다음 단계로 전환됨)

4. **실패/취소 처리**
   - `recoverOrphanedPipelines()`는 completed만 처리
   - failed/cancelled는 전환되지 않음 (영구히 해당 상태 유지)
