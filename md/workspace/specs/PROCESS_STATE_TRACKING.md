# 🔄 프로세스 상태 추적 시스템 (Process State Tracking)

## 📌 개요

각 자동화 프로세스의 **시작, 진행 중, 완료** 상태를 마커 파일로 추적하는 시스템입니다.

### 문제점 해결
- ✅ 크롤링이 시작되었는지 확인 가능
- ✅ 크롤링이 진행 중인지 확인 가능
- ✅ 크롤링이 완료되었는지 확인 가능
- ✅ 중복 실행 방지
- ✅ 프로세스 재시도 가능

---

## 🎯 구현된 마커 파일 시스템

### 이미지 크롤링 (Image Crawling) 마커

#### 1. `.crawl_start` - 크롤링 시작
**생성 시점**: 크롤링 API를 호출할 때
**생성 위치**: `project_${scriptId}/` 폴더
**내용**: 시작 시간 타임스탬프

```typescript
// automation-scheduler.ts - checkWaitingForUploadSchedules()
const crawlStartMarker = path.join(scriptFolderPath, '.crawl_start');
if (!isCrawlStarted) {
  fs.writeFileSync(crawlStartMarker, `Started at: ${new Date().toISOString()}\n`);
}
```

#### 2. `.crawl_progress` - 크롤링 진행 중
**생성 시점**: 크롤링 프로세스가 씬 루프를 시작할 때
**생성 위치**: `project_${scriptId}/` 폴더
**내용**: 시작 시간 및 총 씬 개수

```python
# image_crawler_working.py - main() 함수
progress_marker = os.path.join(output_folder, '.crawl_progress')
with open(progress_marker, 'w') as f:
    f.write(f"Started at: {datetime.datetime.now().isoformat()}\nScenes: {len(scenes)}\n")
```

#### 3. `.crawl_complete` - 크롤링 완료
**생성 시점**: 모든 이미지 수집이 완료되었을 때
**제거 시점**: 비디오 생성 시작 시
**생성 위치**: `project_${scriptId}/` 폴더
**내용**: 완료 시간 타임스탐프

```python
# image_crawler_working.py - finally 블록
completion_marker = os.path.join(output_folder, '.crawl_complete')
with open(completion_marker, 'w') as f:
    f.write(f"Completed at: {datetime.datetime.now().isoformat()}\n")

# .crawl_progress 마커 제거
if os.path.exists(progress_marker):
    os.remove(progress_marker)
```

---

## 🔄 상태 전환 플로우

### 이미지 크롤링 상태 머신

```
[대기 중]
   ↓
[크롤링 필요 감지]
   ↓
.crawl_start 생성 ← API 호출
   ↓
[크롤링 진행 중]
.crawl_progress 존재 확인
   ↓
[이미지 파일 수집]
   ↓
.crawl_complete 생성
.crawl_progress 제거
   ↓
[비디오 생성 시작]
.crawl_start 제거
.crawl_complete 제거
   ↓
[다음 프로세스]
```

### 스케줄러 체크 로직

```typescript
// automation-scheduler.ts - checkWaitingForUploadSchedules()

// 마커 파일 확인
const isCrawlStarted = fs.existsSync(crawlStartMarker);
const isCrawlInProgress = fs.existsSync(crawlProgressMarker);
const isCrawlCompleted = fs.existsSync(crawlCompleteMarker);

if (imageFiles.length === 0) {
  // 케이스 1: 크롤링이 아직 시작되지 않았음
  if (!isCrawlStarted) {
    // → 크롤링 API 호출
    fs.writeFileSync(crawlStartMarker, ...);
    fetch('/api/images/crawl', { ... });
    return;  // 다음 사이클 대기
  }

  // 케이스 2: 크롤링이 시작되었지만 아직 완료 안 됨
  else if (isCrawlStarted && !isCrawlCompleted) {
    // → 완료 대기
    console.log('이미지 크롤링 진행 중...');
    return;  // 다음 사이클 대기
  }
}

// 케이스 3: 이미지가 있고 크롤링이 완료됨
// → 비디오 생성으로 진행
await resumeVideoGeneration(schedule, ...);
```

---

## 📝 마커 파일 정리 타이밍

### 비디오 생성 시작 시 (resumeVideoGeneration)

```typescript
// 크롤링 마커 정리
try {
  if (fs.existsSync(crawlStartMarker)) {
    fs.unlinkSync(crawlStartMarker);
  }
  if (fs.existsSync(crawlCompleteMarker)) {
    fs.unlinkSync(crawlCompleteMarker);
  }
} catch (error) {
  // 정리 실패는 무시하고 계속 진행
}
```

**이유**: 다음 번 이미지 크롤링이 필요할 때 깨끗한 상태에서 시작하기 위함

---

## 🛠️ 파일 수정 내역

### 1. automation-scheduler.ts
**라인**: 1488-1566

**변경 사항**:
- `.crawl_start`, `.crawl_progress`, `.crawl_complete` 마커 파일 확인 로직 추가
- 마커 파일 상태에 따른 3가지 분기 처리:
  1. 크롤링 미시작 → 시작
  2. 크롤링 진행 중 → 대기
  3. 크롤링 완료 → 비디오 생성

**라인**: 1886-1903 (resumeVideoGeneration)

**변경 사항**:
- 비디오 생성 시작 전에 크롤링 마커 파일 정리

### 2. image_crawler_working.py
**라인**: 16 (import)

**변경 사항**:
- `import datetime` 추가

**라인**: 1399-1406 (main 함수 - 크롤링 루프 시작)

**변경 사항**:
- `.crawl_progress` 마커 파일 생성

**라인**: 1770-1784 (finally 블록 - 정리)

**변경 사항**:
- `.crawl_progress` 마커 파일 제거
- `.crawl_complete` 마커 파일 생성

---

## 🧪 테스트 방법

### 1. 마커 파일 직접 확인
```bash
# 프로젝트 폴더 확인
ls -la "C:\Users\oldmoon\workspace\trend-video-backend\input\project_<SCRIPT_ID>\"

# 마커 파일 확인
# .crawl_start - 크롤링 시작됨
# .crawl_progress - 크롤링 진행 중
# .crawl_complete - 크롤링 완료됨
```

### 2. 로그 확인
```bash
# 스케줄러 로그에서 상태 추적
[Scheduler] 📊 Crawl state - Started: true, InProgress: true, Completed: false
[Scheduler] ⏳ Image crawling in progress, waiting for completion...
```

### 3. 전체 플로우 테스트
1. waiting_for_upload 상태의 스케줄 추가
2. 이미지 없음 → `.crawl_start` 생성 → API 호출
3. Python 크롤러 실행 → `.crawl_progress` 생성 → 이미지 수집
4. 크롤링 완료 → `.crawl_progress` 제거 → `.crawl_complete` 생성
5. 다음 스케줄러 사이클 → 이미지 파일 발견 + `.crawl_complete` 확인
6. 비디오 생성 시작 → 마커 파일 정리

---

## 💡 확장 가능성

현재 이미지 크롤링 프로세스를 위해 구현했지만, 다음 프로세스에도 같은 패턴으로 확장 가능:

### 비디오 생성 (Video Generation)
- `.video_start` - 비디오 생성 시작
- `.video_progress` - 비디오 생성 진행 중
- `.video_complete` - 비디오 생성 완료

### YouTube 업로드 (YouTube Upload)
- `.upload_start` - 업로드 시작
- `.upload_progress` - 업로드 진행 중
- `.upload_complete` - 업로드 완료

---

## ✅ 체크리스트

- [x] `.crawl_start` 마커 생성/확인 로직 구현
- [x] `.crawl_progress` 마커 생성/제거 로직 구현
- [x] `.crawl_complete` 마커 생성 로직 구현
- [x] 스케줄러에서 마커 상태에 따른 분기 처리
- [x] 비디오 생성 시작 시 마커 정리
- [x] 중복 실행 방지
- [x] 에러 처리 및 로깅
- [x] datetime import 추가

---

## 📚 관련 문서

- `COMPLETE_AUTO_GUIDE.md` - 자동화 전체 가이드
- `AUTOMATION_PIPELINE_FIX.md` - 파이프라인 수정 내역
- `IMAGE_CRAWLER_DEBUG_GUIDE.md` - 이미지 크롤러 디버그 가이드
