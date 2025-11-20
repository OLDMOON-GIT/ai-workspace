# 숏폼 자동 생성 및 업로드 기능 구현 완료 ✅

## 📋 구현 내역

### 1. 숏폼 대본에 엔딩 멘트 추가

**파일**: `src/app/api/jobs/[id]/convert-to-shorts/route.ts` (Line 220-267)

**변경사항**:
- Claude AI 프롬프트에 엔딩 멘트 추가 지시 포함
- 마지막 씬에 자동으로 추가되는 멘트:
  - "구독과 좋아요 부탁드립니다"
  - "전체 영상은 설명란에 있습니다"

```typescript
**엔딩 멘트 (마지막 씬에 추가):**
마지막 씬의 나레이션 끝에 다음 내용을 자연스럽게 추가해주세요:
- "구독과 좋아요 부탁드립니다"
- "전체 영상은 설명란에 있습니다"

이 엔딩 멘트를 포함한 총 글자가 60초(900자)를 넘지 않도록 조절해주세요.
```

### 2. 내부 요청 지원 추가

**파일**: `src/app/api/jobs/[id]/convert-to-shorts/route.ts` (Line 15-34)

**변경사항**:
- `X-Internal-Request` 헤더 체크
- `X-User-Id` 헤더로 사용자 인증 우회
- 자동화 스케줄러에서 호출 가능하도록 개선

```typescript
// 내부 요청 확인
const isInternalRequest = request.headers.get('X-Internal-Request');
const internalUserId = request.headers.get('X-User-Id');

// 사용자 인증
let user;
if (isInternalRequest && internalUserId) {
  user = { userId: internalUserId };
} else {
  user = await getCurrentUser(request);
}
```

### 3. 롱폼 완료 후 숏폼 자동 생성 트리거

**파일**: `src/lib/automation-scheduler.ts` (Line 466-517)

**변경사항**:
- 롱폼 파이프라인 완료 후 자동으로 숏폼 변환 시작
- 숏폼 작업 ID와 롱폼 YouTube URL을 DB에 저장
- 사용자에게 진행 상황 로그 제공

```typescript
// 롱폼 완료 후 숏폼 자동 생성
if (schedule.type === 'longform' && uploadResult.videoUrl) {
  // convert-to-shorts API 호출
  const convertResponse = await fetch(`http://localhost:${process.env.PORT || 3000}/api/jobs/${longformJobId}/convert-to-shorts`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Internal-Request': 'automation-system',
      'X-User-Id': schedule.user_id
    }
  });

  // 숏폼 작업 ID 저장
  dbShortform.prepare(`
    UPDATE video_schedules
    SET shortform_job_id = ?, longform_youtube_url = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(shortformJobId, longformYoutubeUrl, schedule.id);
}
```

### 4. 데이터베이스 스키마 업데이트

**파일**: `src/lib/automation-scheduler.ts` (Line 504-525)

**추가된 컬럼**:
- `shortform_job_id`: 숏폼 작업 ID
- `longform_youtube_url`: 롱폼 YouTube URL (숏폼 설명란에 사용)
- `shortform_uploaded`: 숏폼 업로드 완료 플래그

```sql
ALTER TABLE video_schedules ADD COLUMN shortform_job_id TEXT;
ALTER TABLE video_schedules ADD COLUMN longform_youtube_url TEXT;
ALTER TABLE video_schedules ADD COLUMN shortform_uploaded INTEGER DEFAULT 0;
```

### 5. 숏폼 자동 업로드 체커 추가

**파일**: `src/lib/automation-scheduler.ts` (Line 2059-2187)

**기능**:
- 완료된 숏폼 작업을 주기적으로 체크
- 숏폼 YouTube 업로드 (롱폼 링크 포함)
- 업로드 완료 후 플래그 업데이트

```typescript
export async function checkCompletedShortformJobs() {
  // shortform_job_id가 있고 아직 업로드되지 않은 스케줄 찾기
  const schedulesWithShortform = db.prepare(`
    SELECT vs.*, vt.user_id, vt.channel, vt.tags
    FROM video_schedules vs
    LEFT JOIN video_titles vt ON vs.title_id = vt.id
    WHERE vs.shortform_job_id IS NOT NULL
      AND (vs.shortform_uploaded IS NULL OR vs.shortform_uploaded = 0)
  `).all();

  // 완료된 숏폼 YouTube 업로드
  const uploadResponse = await fetch(`http://localhost:${process.env.PORT || 3000}/api/youtube/upload`, {
    method: 'POST',
    body: JSON.stringify({
      videoPath,
      title: `${title} (쇼츠)`,
      description: `롱폼 : ${longformYoutubeUrl}`, // 롱폼 링크 추가!
      type: 'shortform'
    })
  });
}
```

### 6. 스케줄러 인터벌에 체커 추가

**파일**: `src/lib/automation-scheduler.ts` (Line 77-89)

**변경사항**:
- `checkCompletedShortformJobs()` 주기적 실행
- 다른 체커 함수들과 함께 동작

```typescript
schedulerInterval = setInterval(() => {
  processPendingSchedules();
  checkWaitingForUploadSchedules();
  checkReadyToUploadSchedules();
  checkCompletedShortformJobs(); // ✨ 추가!

  if (autoTitleGeneration) {
    checkAndCreateAutoSchedules();
  }
}, checkInterval);
```

## 🔄 전체 워크플로우

### 1단계: 롱폼 파이프라인 실행
```
롱폼 대본 생성 → 롱폼 영상 생성 → YouTube 업로드 → 퍼블리시
```

### 2단계: 롱폼 완료 후 자동 숏폼 변환 트리거
```
롱폼 완료 감지 → convert-to-shorts API 호출 → 숏폼 작업 ID 저장
```

### 3단계: 숏폼 변환 진행
```
Claude AI로 대본 요약 (60초, 900자)
→ 마지막 씬에 엔딩 멘트 추가
→ 롱폼 이미지를 9:16으로 변환
→ 숏폼 영상 생성
```

### 4단계: 숏폼 자동 업로드
```
완료된 숏폼 감지 → YouTube 업로드 (롱폼 링크 포함) → 완료 플래그 업데이트
```

## 📊 결과

### 숏폼 대본 예시
```
씬 1: 핵심 내용 요약 (150자)
씬 2: 핵심 내용 요약 (150자)
...
마지막 씬: 핵심 내용 요약 + "구독과 좋아요 부탁드립니다. 전체 영상은 설명란에 있습니다." (150자)
```

### YouTube 설명란
```
롱폼 : https://youtu.be/xxxxx
```

## ✅ 테스트 항목

1. **롱폼 완료 → 숏폼 트리거**
   - 롱폼 파이프라인 완료 후 숏폼 변환 시작 확인
   - 로그에 "🎬 롱폼 완료! 숏폼 변환 시작..." 표시
   - DB에 shortform_job_id, longform_youtube_url 저장 확인

2. **숏폼 대본 생성**
   - 마지막 씬에 엔딩 멘트 포함 확인
   - 총 길이 60초 (900자) 준수 확인

3. **숏폼 자동 업로드**
   - 숏폼 완료 후 자동 업로드 확인
   - 설명란에 "롱폼 : {URL}" 포함 확인
   - 제목에 "(쇼츠)" 추가 확인

4. **중복 방지**
   - shortform_uploaded 플래그로 중복 업로드 방지 확인

## 📁 수정된 파일

1. `src/app/api/jobs/[id]/convert-to-shorts/route.ts`
   - 엔딩 멘트 프롬프트 추가
   - 내부 요청 지원

2. `src/lib/automation-scheduler.ts`
   - 롱폼 완료 후 숏폼 트리거
   - 숏폼 업로드 체커 추가
   - 스케줄러 인터벌에 체커 추가
   - DB 스키마 마이그레이션

## 🚀 사용 방법

### 자동 실행 (권장)
1. 자동화 페이지에서 롱폼 영상 스케줄 등록
2. 자동화 스케줄러가 롱폼 파이프라인 실행
3. 롱폼 완료 후 자동으로 숏폼 변환 시작
4. 숏폼 완료 후 자동으로 YouTube 업로드

### 수동 실행
1. 내 콘텐츠 페이지에서 롱폼 영상 선택
2. "쇼츠로 변환" 버튼 클릭
3. 숏폼 생성 완료 후 수동 업로드

## 💡 주요 기능

- ✅ 롱폼 → 숏폼 완전 자동화
- ✅ 엔딩 CTA 자동 추가 (구독/좋아요 유도)
- ✅ 롱폼 링크 자동 포함 (YouTube 설명란)
- ✅ 중복 방지 (플래그 관리)
- ✅ 실시간 진행 로그
- ✅ 에러 핸들링 및 재시도

---

**구현 완료일**: 2025-11-17
**작업 시간**: 약 2시간
**테스트 상태**: 구현 완료, 실제 테스트 대기 중
