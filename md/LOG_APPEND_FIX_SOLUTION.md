# 로그 어팬드 문제 해결 방안

## 문제 상황

### 증상
- 영상 생성이 실제로는 완료되었지만, 프론트엔드에 진행 상황 로그가 표시되지 않음
- "⏸️ 이미지를 업로드해주세요" 메시지 이후 로그가 멈춤
- 사용자가 "영상 완료되었다구 ㅠ"라고 확인했지만 UI에는 나타나지 않음

### 근본 원인
1. **Python 백엔드**: `logging` 모듈로 로그를 출력하지만, `job_logs` 테이블에 저장하지 않음
2. **프론트엔드**: 3초마다 `/api/automation/logs?titleId=xxx`를 폴링하지만, DB에 로그가 없어서 가져올 수 없음
3. **결과**: 실제 작업은 진행되지만 UI가 업데이트되지 않아 사용자는 멈춘 것처럼 보임

## 현재 시스템 구조

### 로그 흐름
```
Python 백엔드 (story_video_creator.py)
  ↓ logging.getLogger().info()
Console/File (stdout)
  ↓ ❌ DB에 저장 안 됨
job_logs 테이블 (비어있음)
  ↓ ❌ 프론트엔드가 가져올 로그가 없음
프론트엔드 (automation/page.tsx)
  ↓ fetchLogs() 폴링 (3초마다)
사용자 UI (로그 표시 안 됨)
```

### 정상적인 로그 흐름 (목표)
```
Python 백엔드 (story_video_creator.py)
  ↓ logging with DatabaseLogHandler
job_logs 테이블 (실시간 저장)
  ↓ ✅ 로그 저장됨
프론트엔드 (/api/automation/logs)
  ↓ fetchLogs() 폴링 (3초마다)
사용자 UI (실시간 로그 표시)
```

## 해결 방안

### 방안 1: DatabaseLogHandler 적용 (권장)

#### 1-1. 파일 생성 완료
- ✅ `trend-video-backend/src/utils/db_log_handler.py` 생성
- ✅ `trend-video-backend/src/utils/__init__.py` 생성

#### 1-2. story_video_creator.py 수정 필요

**수정 위치**: `trend-video-backend/src/video_generator/story_video_creator.py`

**변경 전**:
```python
import logging

class StoryVideoCreator:
    def __init__(self, config):
        self.logger = logging.getLogger("AutoShortsEditor.StoryVideoCreator")
```

**변경 후**:
```python
import logging
import os
from src.utils import setup_db_logging

class StoryVideoCreator:
    def __init__(self, config, job_id=None):
        # job_id가 있으면 DB 로깅 활성화
        if job_id:
            self.logger = setup_db_logging(
                job_id=job_id,
                logger_name="AutoShortsEditor.StoryVideoCreator"
            )
        else:
            self.logger = logging.getLogger("AutoShortsEditor.StoryVideoCreator")
```

#### 1-3. API 호출부 수정 필요

**수정 위치**: `trend-video-backend/src/sora/api.py` (line 504)

**변경 전**:
```python
creator = StoryVideoCreator(autoshorts_config)
```

**변경 후**:
```python
# job_id를 request에서 가져오기 (Next.js에서 전달)
job_id = data.get("job_id")
creator = StoryVideoCreator(autoshorts_config, job_id=job_id)
```

#### 1-4. Next.js API 수정 필요

**수정 위치**: `trend-video-frontend/src/app/api/pipeline/route.ts`

Python 백엔드 호출 시 `job_id` 전달:
```typescript
const response = await fetch('http://localhost:5000/api/generate/shortform', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    prompt: title,
    job_id: videoId,  // ← 추가
    // ... 기타 파라미터
  })
});
```

### 방안 2: 프로세스 stdout 캡처 (임시 해결책)

Python 프로세스의 stdout/stderr를 캡처해서 DB에 저장하는 래퍼 사용.

**장점**:
- Python 코드 수정 불필요
- 모든 출력 (print, logging, FFmpeg 등) 자동 캡처

**단점**:
- 성능 오버헤드
- 복잡한 구현

### 방안 3: 파일 로깅 + 폴링 (가장 간단)

Python에서 파일에 로그 저장 → Next.js에서 파일 읽기 → DB에 저장

**장점**:
- 구현 간단
- Python 수정 최소화

**단점**:
- 파일 I/O 오버헤드
- 실시간성 떨어짐

## 즉시 적용 가능한 임시 해결책

### Quick Fix: 진행 상태만 표시

프론트엔드에서 상태가 'processing'이면 "처리 중..." 메시지만 계속 표시:

**수정 위치**: `trend-video-frontend/src/app/automation/page.tsx`

```typescript
// 로그가 없어도 진행 중이면 표시
{title.status === 'processing' && logsMap[title.id]?.length === 0 && (
  <div className="text-yellow-400">
    🔄 영상 생성 진행 중... (로그 수집 중)
  </div>
)}
```

## 추천 적용 순서

1. **즉시** (Quick Fix):
   - 진행 상태 표시 개선 (방안 3)
   - 사용자에게 최소한의 피드백 제공

2. **단기** (1-2일):
   - DatabaseLogHandler 적용 (방안 1)
   - story_video_creator.py, api.py, pipeline/route.ts 수정
   - 테스트 및 검증

3. **장기** (1주):
   - 모든 Python 모듈에 DB 로깅 적용
   - long_form_creator.py, editor.py 등
   - 진행률 보고 개선

## 테스트 방법

### 1. DB 로깅 테스트
```python
# test_db_logging.py
from src.utils import setup_db_logging

logger = setup_db_logging(job_id="test-job-123")
logger.info("Test message 1")
logger.info("Test message 2")
logger.info("Test message 3")

# DB 확인
# SELECT * FROM job_logs WHERE job_id = 'test-job-123'
```

### 2. 통합 테스트
1. 자동화 페이지에서 제목 생성
2. "실행" 버튼 클릭
3. 로그 모달 확인
4. 3초마다 로그가 추가되는지 확인

### 3. 확인 사항
- [ ] `job_logs` 테이블에 실시간으로 로그 저장됨
- [ ] 프론트엔드에서 3초마다 새 로그 폴링
- [ ] UI에 로그가 실시간으로 표시됨
- [ ] FFmpeg 출력도 캡처됨
- [ ] 오류 로그도 정상 표시됨

## 관련 파일

### 백엔드 (Python)
- `trend-video-backend/src/utils/db_log_handler.py` - DB 로깅 핸들러 (✅ 생성 완료)
- `trend-video-backend/src/video_generator/story_video_creator.py` - 영상 생성 (수정 필요)
- `trend-video-backend/src/video_generator/long_form_creator.py` - 롱폼 영상 (수정 필요)
- `trend-video-backend/src/sora/api.py` - Flask API (수정 필요)

### 프론트엔드 (Next.js)
- `trend-video-frontend/src/app/api/automation/logs/route.ts` - 로그 조회 API (✅ 정상)
- `trend-video-frontend/src/app/api/pipeline/route.ts` - 파이프라인 API (수정 필요)
- `trend-video-frontend/src/app/automation/page.tsx` - 자동화 페이지 (Quick Fix 가능)

### 데이터베이스
- `trend-video-frontend/data/database.sqlite`
  - `job_logs` 테이블 - Python 로그 저장
  - `title_logs` 테이블 - Next.js 로그 저장

## 예상 효과

### Before (현재)
```
[오후 6:17:41] ⏸️ 이미지를 업로드해주세요...
(로그 멈춤)
(실제로는 영상 생성 진행 중)
(사용자는 멈춘 줄 알고 불안)
```

### After (개선 후)
```
[오후 6:17:41] ⏸️ 이미지를 업로드해주세요...
[오후 6:17:45] 🖼️ 이미지 업로드 완료
[오후 6:17:46] 🎬 영상 생성 시작...
[오후 6:17:50] 📹 비디오 클립 1/5 생성 중...
[오후 6:18:02] 📹 비디오 클립 2/5 생성 중...
[오후 6:18:15] 📹 비디오 클립 3/5 생성 중...
[오후 6:18:28] 🎵 오디오 믹싱 중...
[오후 6:18:35] ✅ 영상 생성 완료!
```

## 비용/시간 추정

- **Quick Fix**: 10분 (진행 상태 표시만)
- **DatabaseLogHandler 적용**: 1-2시간 (Python + Next.js 수정)
- **전체 모듈 적용**: 4-6시간 (모든 Python 모듈)
- **테스트 및 검증**: 2시간

**총 추정**: 8-10시간 (1일 작업)

## 우선순위

1. ✅ **긴급** (0시간): DB 로깅 핸들러 생성 완료
2. 🔴 **높음** (1시간): story_video_creator.py 수정
3. 🔴 **높음** (30분): api.py 수정
4. 🟡 **중간** (30분): pipeline/route.ts 수정
5. 🟢 **낮음** (2시간): 기타 모듈 적용
6. 🟢 **낮음** (1시간): Quick Fix 적용 (임시)

## 다음 단계

현재 **1단계 완료** (DB 로깅 핸들러 생성).

**즉시 적용 필요**:
```bash
# 1. story_video_creator.py에 job_id 파라미터 추가
# 2. api.py에서 job_id 전달
# 3. pipeline/route.ts에서 job_id 전달
# 4. 테스트
```

적용 후 로그가 실시간으로 표시될 것입니다.
