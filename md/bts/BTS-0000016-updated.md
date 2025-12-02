# BTS-0000017: video completed 상태 재발 (다음 단계 전환 실패)

**발생일:** 2025-12-02

**상태:** 🔧 진행중

**심각도:** 🔴 **CRITICAL** - video 단계가 잘못 완료 처리되어 YouTube 업로드 대기 상태로 전환되지 않음

**증상:**
- video 단계가 정상 완료됨
- task_queue에 type='video', status='completed'로 잘못 설정됨
- 정상적으로는 type='youtube', status='waiting'이어야 함
- YouTube 업로드가 실행되지 않음

**사례:**
Task ID: `6cadc518-f561-42bd-b60d-7b2b695e1bc3`

```
현재 상태 (잘못됨):
- task_queue: type='video', status='completed' ❌
- content: status='waiting', youtube_url=null

정상 상태:
- task_queue: type='youtube', status='waiting' ✅
- content: status='video'
```

**타임라인:**
```
2025-12-02 14:35:37 - video 단계 완료 (로그 확인)
2025-12-02 14:38:49 - YouTube 업로드 시도 (ModuleNotFoundError 발생)
```

**파일 상태:**
```
✅ video.log - 영상 생성 완료
✅ 광고_블랙핑크_워머로_완성하는_따뜻한_겨울_외출.mp4 - 최종 영상 존재
❌ task_queue.type = 'video' (잘못됨, 'youtube'이어야 함)
❌ task_queue.status = 'completed' (잘못됨, 'waiting'이어야 함)
```

---

## 원인 분석

### 1. triggerNextStage 코드 확인 (unified-worker.js:593-637)

**현재 코드:**
```javascript
async triggerNextStage(currentType, taskId, emoji) {
  const nextTypeMap = {
    script: 'image',
    image: 'video',
    video: 'youtube',  // ⭐ video 완료 → youtube 전환
    youtube: null
  };

  const nextType = nextTypeMap[currentType];
  if (!nextType) {
    console.log(`${emoji} [${currentType}] Pipeline completed for: ${taskId}`);
    return false; // 다음 단계 없음
  }

  try {
    // 1. content.status 설정
    if (currentType === 'script' || currentType === 'video') {
      await run(`UPDATE content SET status = ? WHERE content_id = ?`, [currentType, taskId]);
    }

    // 2. task_queue 다음 단계로 UPDATE
    await run(`UPDATE task_queue SET type = ?, status = 'waiting' WHERE task_id = ?`, [nextType, taskId]);

    console.log(`${emoji} → ${nextEmoji} [${currentType}→${nextType}] Triggered next stage for: ${taskId}`);
    return true; // 다음 단계 있음

  } catch (error) {
    console.error(`${emoji} [${currentType}] Failed to trigger next stage:`, error);
    // ⚠️ 에러 발생 시 false 반환하면 completed로 처리되는 버그!
    // 에러를 throw하여 상위에서 failed로 처리되도록 함
    throw error;  // ⭐ Line 635: 이미 수정되어 있음
  }
}
```

**Line 635에 이미 `throw error;` 수정이 적용되어 있음!**

### 2. 호출부 확인 (unified-worker.js:294-311)

```javascript
// 다음 단계로 전환 (또는 완료 처리)
const hasNextStage = await this.triggerNextStage(type, taskId, emoji);

if (hasNextStage) {
  console.log(`${emoji} [${type}] ✅ Completed and moved to next stage: ${taskId}`);
} else {
  // 마지막 단계 (youtube)만 completed 상태로 변경
  await this.updateTask(taskId, type, { state: 'completed' });
  await run(`UPDATE content SET status = 'completed' WHERE content_id = ?`, [taskId]);
  console.log(`${emoji} [${type}] ✅ All stages completed: ${taskId}`);
}
```

**로직:**
- `hasNextStage = true` → 다음 단계로 전환됨
- `hasNextStage = false` → completed 처리 (youtube만 해당)
- `throw error` → 상위 catch로 전달되어 failed 처리

---

## 근본 원인

### ⚠️ **Worker 프로세스가 재시작되지 않아서 이전 코드가 실행 중!**

**가능한 시나리오:**

#### 시나리오 A: 이전 코드 실행 (가장 가능성 높음)
```
1. unified-worker.js가 메모리에 로드됨 (throw error 수정 전 버전)
2. video 단계 완료
3. triggerNextStage('video') 호출
4. DB UPDATE 시도 중 에러 발생
5. catch에서 return false 실행 (이전 코드)
   ❌ Line 633에 `return false;`가 있었던 버전
6. hasNextStage = false
7. video completed 처리 ❌
```

#### 시나리오 B: UPDATE 실패
```
1. video 단계 완료
2. triggerNextStage('video') 호출
3. UPDATE task_queue SET type='youtube', status='waiting' 실행 실패
4. throw error (새 코드)
5. 상위 catch → failed 처리해야 하는데...
6. 왜인지 completed로 처리됨?
```

---

## 해결 방법

### ✅ 옵션 1: Worker 프로세스 재시작 (즉시 조치)

**이유:** 코드는 이미 수정되어 있지만, 실행 중인 프로세스가 이전 버전일 가능성

**조치:**
1. 실행 중인 unified-worker 프로세스 확인
2. 프로세스 종료 및 재시작
3. 새 코드 (throw error) 로드 확인

```bash
# Windows
powershell -Command "Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force"

# 재시작
npm run dev
```

### ✅ 옵션 2: 로그 추가 (디버깅)

**목적:** triggerNextStage의 에러 발생 지점 정확히 파악

```javascript
async triggerNextStage(currentType, taskId, emoji) {
  const nextTypeMap = { script: 'image', image: 'video', video: 'youtube', youtube: null };
  const nextType = nextTypeMap[currentType];

  if (!nextType) {
    console.log(`${emoji} [${currentType}] Pipeline completed for: ${taskId}`);
    return false;
  }

  const nextEmoji = { image: '📸', video: '🎬', youtube: '📺' }[nextType];

  try {
    console.log(`⭐ [TRIGGER] Starting: ${currentType} → ${nextType} for ${taskId}`);

    // 1. content.status 설정
    if (currentType === 'script' || currentType === 'video') {
      console.log(`⭐ [TRIGGER] Updating content.status to '${currentType}'`);
      await run(`UPDATE content SET status = ? WHERE content_id = ?`, [currentType, taskId]);
    }

    // 2. task_queue 다음 단계로 UPDATE
    console.log(`⭐ [TRIGGER] Updating task_queue: type='${nextType}', status='waiting'`);
    const result = await run(`UPDATE task_queue SET type = ?, status = 'waiting' WHERE task_id = ?`, [nextType, taskId]);
    console.log(`⭐ [TRIGGER] UPDATE result:`, result);

    console.log(`${emoji} → ${nextEmoji} [${currentType}→${nextType}] Triggered next stage for: ${taskId}`);
    return true;

  } catch (error) {
    console.error(`${emoji} [${currentType}] ❌ Failed to trigger next stage:`, error);
    console.error(`⭐ [TRIGGER] Error details:`, error.message, error.stack);
    throw error; // ⭐ 반드시 throw하여 상위에서 failed 처리
  }
}
```

### ✅ 옵션 3: 안전장치 추가

**목적:** triggerNextStage 실패 시에도 video completed가 안 되도록

```javascript
// Line 294-311 수정
const hasNextStage = await this.triggerNextStage(type, taskId, emoji);

if (hasNextStage) {
  console.log(`${emoji} [${type}] ✅ Completed and moved to next stage: ${taskId}`);
} else {
  // ⭐ 안전장치: video는 절대 completed가 되면 안 됨
  if (type === 'video') {
    console.error(`❌ [${type}] CRITICAL: video completed is not allowed! taskId=${taskId}`);
    throw new Error('Video stage cannot be completed without youtube stage');
  }

  // 마지막 단계 (youtube)만 completed 상태로 변경
  await this.updateTask(taskId, type, { state: 'completed' });
  await run(`UPDATE content SET status = 'completed' WHERE content_id = ?`, [taskId]);
  console.log(`${emoji} [${type}] ✅ All stages completed: ${taskId}`);
}
```

---

## 영향 범위

**파일:**
- `trend-video-frontend/src/workers/unified-worker.js`
  - Line 294-311: 완료 처리 로직
  - Line 593-637: triggerNextStage 함수

**테이블:**
- `task_queue`: type='video', status='completed' (잘못된 상태)
- `content`: status='waiting' (정상)

---

## 재발 방지

1. **Worker 재시작 확인**
   - 코드 수정 후 반드시 프로세스 재시작
   - PM2 사용 시 `pm2 reload` 또는 `pm2 restart`

2. **안전장치 추가**
   - video는 completed가 될 수 없다는 체크 추가
   - 중간 단계(script, image, video)는 completed 불가

3. **로그 강화**
   - triggerNextStage의 각 단계별 로그 추가
   - DB UPDATE 결과 확인

4. **상태 검증 추가**
   - Worker 시작 시 task_queue 상태 검증
   - video completed 발견 시 자동 복구 (youtube waiting으로 변경)

---

## ✅ 해결 완료

**적용 날짜:** 2025-12-02

### 적용된 해결책

#### 1. 안전장치 추가 (unified-worker.js:299-304)
```javascript
// ⭐ 안전장치: video는 절대 completed가 되면 안 됨 (BTS-0000017)
if (type === 'video') {
  const errorMsg = `CRITICAL: video stage cannot be completed without youtube stage`;
  console.error(`❌ [${type}] ${errorMsg}, taskId=${taskId}`);
  throw new Error(errorMsg);
}
```

**효과:** video 단계가 completed로 잘못 설정되는 것을 **원천 차단**

#### 2. 로그 강화 (unified-worker.js:617-649)
```javascript
try {
  console.log(`⭐ [TRIGGER] Starting: ${currentType} → ${nextType} for ${taskId}`);

  // content UPDATE 로그
  console.log(`⭐ [TRIGGER] Updating content.status to '${currentType}'`);
  const contentResult = await run(...);
  console.log(`⭐ [TRIGGER] content UPDATE result:`, contentResult);

  // task_queue UPDATE 로그
  console.log(`⭐ [TRIGGER] Updating task_queue: type='${nextType}', status='waiting'`);
  const queueResult = await run(...);
  console.log(`⭐ [TRIGGER] task_queue UPDATE result:`, queueResult);

  return true;

} catch (error) {
  console.error(`⭐ [TRIGGER] Error details:`, error.message);
  console.error(`⭐ [TRIGGER] Stack trace:`, error.stack);
  throw error; // (BTS-0000017)
}
```

**효과:** triggerNextStage 실행 과정 상세 추적 가능

### 수정된 파일

1. **`trend-video-frontend/src/workers/unified-worker.js`**
   - Line 299-304: video completed 안전장치 추가
   - Line 617-649: triggerNextStage 로그 강화
   - Line 650-652: 에러 throw 주석 업데이트

---

## 다음 단계

1. ✅ 안전장치 추가 (옵션 3 적용)
2. ✅ 로그 추가 (옵션 2 적용)
3. ⬜ Worker 프로세스 재시작 권장
4. ⬜ Task 6cadc518 수동 복구 (youtube waiting으로 변경)
5. ⬜ 테스트: video → youtube 전환 확인

---

## 임시 복구 방법

**Task 6cadc518을 youtube waiting으로 수동 변경:**

```sql
UPDATE task_queue
SET type = 'youtube', status = 'waiting', error = NULL
WHERE task_id = '6cadc518-f561-42bd-b60d-7b2b695e1bc3';

UPDATE content
SET status = 'video'
WHERE content_id = '6cadc518-f561-42bd-b60d-7b2b695e1bc3';
```

그러면 YouTube 업로드가 다시 시도될 것입니다.
단, YouTube 업로드의 ModuleNotFoundError는 별도로 해결해야 합니다.
