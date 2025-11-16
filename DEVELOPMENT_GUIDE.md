# 개발 가이드 (Development Guide)

workspace 프로젝트의 핵심 구현 패턴과 모범 사례 정리

## 🌏 기본 규칙

### AI와의 대화는 한글로 진행
- 모든 개발 대화, 코드 주석, 에러 메시지는 한글 우선

### 사용자에게 작업을 시키지 않는다
- AI가 직접 코드 확인, 로그 분석, 문제 해결
- 사용자는 결과만 확인
- **"하라마라" 하지 않기**: 사용자에게 명령을 내리거나 지시하지 않는다
  - ❌ "이 명령어를 실행하세요", "~해보시겠어요?", "복사해서 붙여넣으세요"
  - ✅ 바로 작업을 수행하고 결과를 보고
  - 사용자가 직접 해야 하는 작업이면 자동화 방법을 찾거나, 불가능하면 명확히 설명

### Claude Code 설치
- npm 버전 사용 금지 (성능 이슈)
- 공식 설치 프로그램 사용

## 📋 목차

1. [영상 생성 3종 세트 규칙](#1-영상-생성-3종-세트-규칙) ⭐⭐⭐
2. [파일 정렬 규칙](#2-파일-정렬-규칙) ⭐
3. [자막 싱크 시스템](#3-자막-싱크-시스템) ⭐
4. [비디오 병합 워크플로우](#4-비디오-병합-워크플로우) ⭐
5. [Regression Test](#5-regression-test) ⭐
6. [프론트엔드-백엔드 아키텍처](#6-프론트엔드-백엔드-아키텍처) ⭐
7. [인증 구현](#7-인증-구현)
8. [초기 로딩 최적화](#8-초기-로딩-최적화)
9. [폴링 최소화](#9-폴링-최소화)
10. [로그 관리](#10-로그-관리)
11. [UI/UX 일관성](#11-uiux-일관성) ⭐
12. [API 에러 처리](#12-api-에러-처리) ⭐
13. [백그라운드 프로세스 중지](#13-백그라운드-프로세스-중지) ⭐
14. [버튼 배치 규칙](#14-버튼-배치-규칙) ⭐
15. [API 테스트 프로세스](#15-api-테스트-프로세스) ⭐
16. [스케줄러 중복 실행 방지](#16-스케줄러-중복-실행-방지) ⭐
17. [버그 수정 히스토리](#17-버그-수정-히스토리)

---

## 1. 영상 생성 3종 세트 규칙

### 🎯 절대 원칙: 3개 파일은 항상 함께 수정 ⭐⭐⭐

**미디어 처리 관련 수정 시 반드시 3개 파일을 세트로 수정:**

1. **영상 제작 페이지** (Frontend)
   - `trend-video-frontend/src/app/page.tsx`
   - 사용자가 직접 미디어를 업로드하는 UI

2. **자동화 스케줄러** (Frontend)
   - `trend-video-frontend/src/lib/automation-scheduler.ts`
   - 자동화 시스템에서 스케줄된 영상 생성

3. **백엔드 API** (Frontend API Routes)
   - `trend-video-frontend/src/app/api/generate-video-upload/route.ts`
   - 1번과 2번이 호출하는 공통 API

### 왜 3개가 세트인가?

```
┌─────────────────┐
│ page.tsx        │ → FormData로 전송
│ (영상 제작 UI)  │    (thumbnailFile 포함)
└────────┬────────┘
         │
         ├─────────────────────┐
         │                     │
         ↓                     ↓
┌────────────────────────┐    ┌──────────────────────────┐
│ generate-video-upload  │←───│ automation-scheduler.ts  │
│ /route.ts              │    │ (자동화 스케줄러)        │
│                        │    │ JSON으로 전송            │
│ 공통 API               │    │ (useThumbnailFromFirstImage 포함)
└────────────────────────┘    └──────────────────────────┘
```

### 수정 예시: 썸네일 분리 기능

**변경 사항:**
- 씬이 2개 이상일 때 첫 번째 이미지를 썸네일 전용으로 분리

**수정한 파일:**

1. ✅ `page.tsx` (line 5335-5359)
   ```typescript
   // 첫 번째 이미지 찾기
   const firstImageIndex = allMediaFiles.findIndex(f => f.mediaType === 'image');
   if (firstImageIndex !== -1) {
     thumbnailFile = allMediaFiles[firstImageIndex];
     // FormData에 별도로 추가
     formData.append('thumbnail', thumbnailFile);
   }
   ```

2. ✅ `automation-scheduler.ts` (line 540-560)
   ```typescript
   // 자동화: scene_0 이미지를 썸네일로 사용
   let useThumbnailFromFirstImage = false;
   if (sceneCount >= 2 && hasUploadedImages && imageFiles.length > 0) {
     const firstFile = sortedImages[0];
     if (firstFile && /scene_0.*\.(png|jpg|jpeg|webp)$/i.test(firstFile)) {
       useThumbnailFromFirstImage = true;
     }
   }
   // requestBody에 플래그 추가
   requestBody.useThumbnailFromFirstImage = useThumbnailFromFirstImage;
   ```

3. ✅ `route.ts` (line 36-37, 96, 274-275, 310-311, 403-433)
   ```typescript
   // 파라미터 추가
   let thumbnailFile: File | null = null;
   let useThumbnailFromFirstImage: boolean = false;

   // FormData에서 썸네일 파일 받기
   thumbnailFile = formDataGeneral.get('thumbnail') as File | null;

   // JSON에서 플래그 받기
   useThumbnailFromFirstImage = body.useThumbnailFromFirstImage || false;

   // 썸네일 파일 처리 로직
   if (config.thumbnailFile) {
     // 일반 요청: FormData에서 받은 썸네일 저장
     await fs.writeFile(thumbnailPath, buffer);
   } else if (config.useThumbnailFromFirstImage && config.scriptId) {
     // 자동화: 첫 번째 이미지를 썸네일로 복사
     await fs.copyFile(sourcePath, thumbnailPath);
   }
   ```

### ❌ 잘못된 사례

**하나만 수정:**
```
❌ page.tsx만 수정 → 영상 제작은 되지만 자동화가 안 됨
❌ automation-scheduler.ts만 수정 → 자동화만 되고 수동 제작이 안 됨
❌ route.ts만 수정 → 프론트엔드에서 전달하지 않아 무의미
```

### ✅ 올바른 사례

**3개 모두 수정:**
```
✅ page.tsx: 썸네일 파일을 FormData에 추가
✅ automation-scheduler.ts: useThumbnailFromFirstImage 플래그 전달
✅ route.ts: 두 가지 케이스를 모두 처리
   → 결과: 영상 제작과 자동화 모두 정상 작동
```

### 컴포넌트 통일 규칙

**이미지 업로드 박스는 한 컴포넌트로 통일:**

현재 이미지 업로드 UI가 3곳에 중복되어 있다면:
- ❌ 각각 별도 코드로 구현
- ✅ 공통 컴포넌트로 추출

**권장 구조:**
```typescript
// components/MediaUploadBox.tsx
export function MediaUploadBox({
  onUpload,
  accept = "image/*,video/*",
  maxFiles = 10
}) {
  // 드래그앤드롭, 파일 선택, 정렬 기능
  return <div>...</div>;
}

// 사용처
import { MediaUploadBox } from '@/components/MediaUploadBox';

// page.tsx (영상 제작)
<MediaUploadBox onUpload={handleMediaUpload} />

// automation page (자동화 업로드)
<MediaUploadBox onUpload={handleAutomationUpload} />
```

### 체크리스트

**미디어 처리 수정 시 반드시 확인:**

- [ ] `page.tsx` 수정 완료
- [ ] `automation-scheduler.ts` 수정 완료
- [ ] `generate-video-upload/route.ts` 수정 완료
- [ ] 3개 파일 모두 커밋
- [ ] 테스트: 영상 제작 페이지에서 정상 작동
- [ ] 테스트: 자동화 스케줄에서 정상 작동

---

## 2. 파일 정렬 규칙

### 🎯 핵심 규칙

**모든 이미지/영상 정렬:**
1. ✅ 시퀀스 번호 우선 (01, 02, 03...)
2. ✅ 시퀀스 없으면 lastModified 오래된 순
3. ✅ 썸네일은 시퀀스 제일 앞 또는 오래된 것 1장

### 정렬 로직

**위치:** `trend-video-frontend/src/app/api/generate-video-upload/route.ts`

```typescript
const extractSequenceNumber = (filename: string): number | null => {
  const startMatch = filename.match(/^(\d+)\./);
  if (startMatch) return parseInt(startMatch[1], 10);

  const seqMatch = filename.match(/[_-](\d{1,3})\./);
  if (seqMatch) return parseInt(seqMatch[1], 10);

  const parenMatch = filename.match(/\((\d+)\)/);
  if (parenMatch && !filename.match(/[_-]\w{8,}/)) {
    return parseInt(parenMatch[1], 10);
  }

  return null;
};

imageFiles.sort((a, b) => {
  const numA = extractSequenceNumber(a.name);
  const numB = extractSequenceNumber(b.name);

  if (numA !== null && numB !== null) return numA - numB;
  if (numA !== null) return -1;
  if (numB !== null) return 1;
  return a.lastModified - b.lastModified;
});
```

### 적용 위치
- `generate-video-upload/route.ts` (롱폼/숏폼 이미지)
- `sora2-upload/route.ts` (SORA2 업로드)
- `content.ts` `getSceneVideos()` (씬 영상)

---

## 3. 자막 싱크 시스템

### 🎯 핵심 원리

**문제:** 기존 비디오 길이와 새 자막 길이가 다를 때 싱크 맞추기

**해결:**
1. 기존 비디오 전체 길이 파악
2. 새 자막의 총 길이 계산
3. 비율(ratio) = 비디오 길이 / 자막 길이
4. 각 자막 세그먼트에 ratio 적용

### 구현 예시

**위치:** `trend-video-backend/src/utils/subtitle_utils.py`

```python
def adjust_subtitle_timing(srt_path: str, target_duration: float):
    """자막 타이밍을 target_duration에 맞춰 조정"""
    segments = parse_srt(srt_path)

    # 마지막 자막의 end 시간 = 원본 자막 전체 길이
    last_end = segments[-1]['end']

    # 비율 계산
    ratio = target_duration / last_end

    # 각 세그먼트 시간 조정
    for seg in segments:
        seg['start'] *= ratio
        seg['end'] *= ratio

    write_srt(srt_path, segments)
```

### 적용 케이스
- `regenerate_video.py`: 영상 재생성 시 자막 조정
- `create_video_from_folder.py`: 롱폼/숏폼 생성 시 자막 싱크
- `create_video_from_sora2.py`: SORA2 비디오 자막 처리

---

## 4. 비디오 병합 워크플로우

### 🎯 핵심 프로세스

```
1. 씬별 비디오 생성 → scenes/scene_001.mp4, scene_002.mp4
2. 자막 생성 → subtitles/scene_001.srt, scene_002.srt
3. 자막 싱크 조정 (각 씬 비디오 길이에 맞춤)
4. 비디오에 자막 하드코딩 → scenes_with_subs/scene_001.mp4
5. concat.txt 생성
6. FFmpeg concat demuxer로 병합 → final_output.mp4
```

### 병합 코드

**위치:** `trend-video-backend/src/create_video_from_folder.py`

```python
def merge_videos_with_concat(video_paths: List[Path], output_path: Path):
    """concat demuxer로 비디오 병합 (re-encoding 없음)"""
    concat_file = output_path.parent / 'concat.txt'

    # concat.txt 생성
    with open(concat_file, 'w', encoding='utf-8') as f:
        for video in video_paths:
            f.write(f"file '{video.absolute()}'\n")

    # FFmpeg concat
    subprocess.run([
        'ffmpeg', '-f', 'concat', '-safe', '0',
        '-i', str(concat_file), '-c', 'copy', str(output_path)
    ], check=True)
```

### 주의사항
- ✅ concat demuxer 사용 (빠름, 무손실)
- ❌ filter_complex 사용 금지 (느림, 품질 손실)
- ✅ 자막 하드코딩은 병합 전에 수행

---

## 5. Regression Test

### 🎯 **필수 규칙: 코드 완료 전 테스트 실행** ⭐

**모든 코드 수정 후:**
1. ❌ 수동 테스트만 하고 완료 보고 금지
2. ✅ 자동화된 regression test 작성 및 실행
3. ✅ 서버 로그 확인하여 실제 동작 검증
4. ✅ 테스트 통과 후에만 완료 보고

### AI 자동 테스트 프로세스 (필수) ⭐

**단계별 프로세스:**
```
1. 코드 수정
   ↓
2. 리그레션 테스트 작성 (test-*.js)
   ↓
3. 테스트 실행
   ↓
4. 서버 로그 확인 (trend-video-frontend/logs/server.log)
   ├─ 성공: 완료 보고
   └─ 실패: 재시도 (최대 5회)
       ├─ 5회 내 성공: 완료 보고
       └─ 5회 실패: 사용자에게 상세 리포트
```

**재시도 규칙:**
- 최대 5회 시도
- 각 시도마다 로그 분석 및 원인 파악
- 실패 원인에 따라 코드 수정 후 재테스트
- 5회 실패 시 반드시 사용자에게 리포트:
  - 시도한 수정 내역
  - 각 시도의 실패 원인
  - 현재 상태 및 추가 정보 필요 여부

**테스트 작성 가이드:**
```javascript
// 예시: test-automation-folder-path.js
const fs = require('fs');
const path = require('path');

let testResults = { passed: 0, failed: 0, tests: [] };

function addTestResult(name, passed, message) {
  testResults.tests.push({ name, passed, message });
  if (passed) {
    testResults.passed++;
    console.log(`✅ ${name}: ${message}`);
  } else {
    testResults.failed++;
    console.error(`❌ ${name}: ${message}`);
  }
}

async function runTests() {
  console.log('🧪 [테스트명] 시작\n');

  // 테스트 1: 코드 변경 확인
  const routeContent = fs.readFileSync('path/to/file.ts', 'utf-8');
  const hasExpectedChange = routeContent.includes('expected-code');
  addTestResult('코드 변경', hasExpectedChange, '변경사항 확인');

  // 테스트 2: 로직 검증
  const result = yourLogic('input');
  addTestResult('로직 검증', result === 'expected', '로직 정상');

  // 테스트 3: 서버 로그 확인 (중요!)
  const logPath = path.join(__dirname, 'trend-video-frontend', 'logs', 'server.log');
  if (fs.existsSync(logPath)) {
    const logContent = fs.readFileSync(logPath, 'utf-8');
    const hasError = logContent.includes('❌') || logContent.includes('Error:');
    addTestResult('서버 로그', !hasError, hasError ? '에러 발견' : '정상');
  }

  // 결과 출력
  console.log(`\n✅ 통과: ${testResults.passed}/${testResults.tests.length}`);
  process.exit(testResults.failed === 0 ? 0 : 1);
}

runTests();
```

**실행:**
```bash
node test-your-feature.js
# Exit code 0: 통과
# Exit code 1: 실패
```

### 서버 로그 관리

**로그 파일 위치:**
```
trend-video-frontend/logs/server.log
```

**서버 시작 시 로그 설정:**
```bash
# 개발 서버 시작 (로그 자동 저장)
cd trend-video-frontend
npm run dev 2>&1 | tee -a logs/server.log
```

**로그 확인 명령어:**
```bash
# 최근 로그 확인
tail -100 trend-video-frontend/logs/server.log

# 에러만 필터링
grep -E "❌|Error|Failed" trend-video-frontend/logs/server.log

# 특정 패턴 검색
grep "영상 제작" trend-video-frontend/logs/server.log
```

**AI가 로그를 확인해야 하는 시점:**
1. ✅ 테스트 실행 직후
2. ✅ API 호출 후
3. ✅ Python 프로세스 실행 후
4. ✅ 에러 발생 시

**로그 검증 예시:**
```javascript
// 서버 로그에서 성공 여부 확인
function checkServerLogs(featureName) {
  const logPath = path.join(__dirname, 'trend-video-frontend', 'logs', 'server.log');
  const logContent = fs.readFileSync(logPath, 'utf-8');
  const recentLogs = logContent.split('\n').slice(-200).join('\n');

  // 특정 패턴 확인
  const hasSuccess = recentLogs.includes(`✅ ${featureName}`);
  const hasError = recentLogs.includes(`❌ ${featureName}`) ||
                   recentLogs.match(new RegExp(`${featureName}.*Error`, 'i'));

  return { success: hasSuccess && !hasError, logs: recentLogs };
}
```

---

### Backend Tests

**위치:** `trend-video-backend/tests/test_regression.py`

```bash
# 전체 테스트
pytest tests/test_regression.py -v

# 개별 테스트
pytest tests/test_regression.py::test_longform_generation -v
pytest tests/test_regression.py::test_shortform_generation -v
pytest tests/test_regression.py::test_sora2_generation -v
```

**성공 기준:**
- ✅ 프로세스 정상 종료 (exit code 0)
- ✅ 출력 비디오 파일 생성
- ✅ 비디오 재생 가능 (ffprobe 확인)
- ✅ 로그 에러 없음

### Frontend Tests

**위치:** `trend-video-frontend/__tests__/`

```bash
cd trend-video-frontend

# 전체 테스트
npm test

# 개별 테스트
npm test file-sorting
npm test json-title-extraction

# 커버리지
npm test -- --coverage
```

**테스트 대상:**
- 파일 정렬 로직 (시퀀스 인식)
- JSON 제목 추출 및 검증

---

## 6. 프론트엔드-백엔드 아키텍처

### 🎯 핵심 원칙

**프론트엔드 (Next.js):**
- DB 접근 (SQLite)
- 작업 관리 (큐, 상태)
- Python 프로세스 실행

**백엔드 (Python):**
- 비디오 생성 로직
- AI 처리 (DALL-E, Claude)
- FFmpeg 작업

### 작업 흐름

```
1. 프론트엔드: 작업 생성 → DB 저장
2. 프론트엔드: Python 스크립트 실행
3. 백엔드: 비디오 생성
4. 프론트엔드: 작업 완료 감지 → DB 업데이트
```

---

## 7. 인증 구현

### ✅ 권장: httpOnly 쿠키

**프론트엔드:**
```typescript
// 로그인
const response = await fetch('/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password })
});
// sessionId는 쿠키로 자동 저장됨
```

**백엔드:**
```typescript
// 세션 쿠키 설정
response.cookies.set('sessionId', sessionId, {
  httpOnly: false, // 개발: false, 프로덕션: true
  secure: false,   // 개발: false, 프로덕션: true
  sameSite: 'lax',
  maxAge: 7 * 24 * 60 * 60, // 7일
  path: '/'
});
```

### ❌ 비권장: localStorage + Authorization 헤더

보안 취약점 때문에 사용 금지

---

## 8. 초기 로딩 최적화

### 🎯 전략

**한 번에 모든 데이터 로딩:**
```typescript
// app/api/content/route.ts
export async function GET() {
  return NextResponse.json({
    videos: getAllVideos(),
    scripts: getAllScripts(),
    products: getAllProducts()
  });
}
```

**클라이언트 캐싱:**
```typescript
const [allData, setAllData] = useState(null);

useEffect(() => {
  fetch('/api/content')
    .then(res => res.json())
    .then(setAllData);
}, []);
```

### 효과
- ✅ 초기 로딩 1회만
- ✅ 탭 전환 즉시
- ✅ 불필요한 API 호출 제거

---

## 9. 폴링 최소화

### 🎯 규칙

**폴링 사용 조건:**
- 작업이 진행 중일 때만
- 작업 완료 시 즉시 중지

```typescript
useEffect(() => {
  if (!hasRunningJobs()) {
    return; // 폴링 안 함
  }

  const interval = setInterval(async () => {
    await fetchStatus();
    if (!hasRunningJobs()) {
      clearInterval(interval);
    }
  }, 2000);

  return () => clearInterval(interval);
}, [hasRunningJobs()]);
```

### 효과
- ✅ 서버 부하 감소
- ✅ 네트워크 트래픽 감소

---

## 10. 로그 관리

### 구조

```sql
-- contents 테이블
CREATE TABLE contents (
  id TEXT PRIMARY KEY,
  status TEXT,
  type TEXT
);

-- content_logs 테이블 (1:N 관계)
CREATE TABLE content_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  content_id TEXT,
  log_message TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (content_id) REFERENCES contents(id) ON DELETE CASCADE
);
```

### 로그 추가

```typescript
export function addContentLog(contentId: string, logMessage: string) {
  // contentId 존재 확인 (FOREIGN KEY 에러 방지)
  const exists = db.prepare('SELECT id FROM contents WHERE id = ?').get(contentId);
  if (!exists) {
    console.warn(`Content ${contentId} does not exist, skipping log`);
    return;
  }

  db.prepare('INSERT INTO content_logs (content_id, log_message) VALUES (?, ?)')
    .run(contentId, logMessage);
}
```

### 🔍 로그 파일 위치 (문제 발생 시)

**프론트엔드 서버 로그:**
```
C:\Users\oldmoon\workspace\trend-video-frontend\logs\server.log
```

**로그 확인 방법:**
```bash
# Git Bash에서 (권장 - 한글 정상 표시)
tail -f trend-video-frontend/logs/server.log

# 단축 명령어 (Git Bash에서 어디서든 사용 가능)
tlog

# PowerShell에서 (UTF-8 인코딩 필수)
Get-Content -Path trend-video-frontend\logs\server.log -Encoding UTF8 -Tail 50 -Wait
```

**단축 명령어 설정:**

Git Bash (`~/.bashrc`에 추가됨):
```bash
alias tlog='tail -f /c/Users/oldmoon/workspace/trend-video-frontend/logs/server.log'
```

PowerShell (`$PROFILE`에 추가됨):
```powershell
function tlog {
    Get-Content -Path C:\Users\oldmoon\workspace\trend-video-frontend\logs\server.log -Encoding UTF8 -Tail 50 -Wait
}
```

**단축 명령어 적용:**
- Git Bash: 새 터미널 열거나 `source ~/.bashrc`
- PowerShell: 새 터미널 열거나 `. $PROFILE`

**⚠️ 문제 발생 시 로그 확인:**
- 에러 로그는 **가장 아래부터** 확인
- 최신 에러가 파일 끝에 추가됨
- 스택트레이스 전체를 확인하여 원인 파악

**로그 파일 인코딩:**
- UTF-8 인코딩 사용
- 한글 깨짐 시 PowerShell 인코딩 설정 확인:
  ```powershell
  [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
  ```

---

## 11. UI/UX 일관성

### 🎯 핵심 규칙

1. **버튼 개수 고정**
   - 영상 카드: 9개 버튼 (조건부 제외)
   - 대본 카드: 12개 버튼 (조건부 제외)

2. **버튼 순서 고정**
   - 영상: YouTube 업로드 → 읽어보기 → ... → 삭제
   - 대본: 대본 → 읽어보기 → ... → 삭제

3. **버튼 패딩 통일**
   - 모든 버튼: `px-3 py-1.5`
   - 일관된 시각적 레이아웃

4. **탭 간 일관성**
   - 전체 탭 영상 = 영상 탭
   - 전체 탭 대본 = 대본 탭

---

## 12. API 에러 처리

### 🎯 표준 패턴

```typescript
export async function POST(request: NextRequest) {
  try {
    // 작업 수행
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}
```

### 프론트엔드 처리

```typescript
const response = await fetch('/api/endpoint', { method: 'POST' });
const data = await response.json();

if (!response.ok) {
  alert(`에러: ${data.error}`);
  return;
}
```

---

## 13. 백그라운드 프로세스 중지

### 🎯 이중 보호 메커니즘

**1. 취소 플래그 (Graceful Shutdown)**

프론트엔드:
```typescript
const cancelFilePath = path.join(backendPath, 'input', jobFolder, '.cancel');
await fs.writeFile(cancelFilePath, 'cancelled by user');
```

백엔드:
```python
cancel_file = self.folder_path / '.cancel'
if cancel_file.exists():
    raise KeyboardInterrupt("User cancelled")
```

**2. 프로세스 트리 강제 종료 (Force Kill)**

```typescript
import kill from 'tree-kill';

await new Promise<void>((resolve, reject) => {
  kill(pid, 'SIGKILL', (err) => {
    if (err) reject(err);
    else resolve();
  });
});

// Windows 좀비 프로세스 정리
if (process.platform === 'win32') {
  await execAsync('taskkill /F /FI "IMAGENAME eq python.exe"');
}
```

### 실행 순서
1. 취소 플래그 생성
2. 2초 대기 (graceful shutdown 기회)
3. tree-kill 실행
4. Windows 좀비 프로세스 정리

---

## 14. 버튼 배치 규칙

### 영상 카드 버튼 순서

```
1. YouTube 업로드
2. 읽어보기 (sourceContentId 있을 때)
3. 이미지크롤링
4. 로그 (logs 있을 때)
5. 폴더 (관리자 전용)
6. 저장
7. 쇼츠 (롱폼 타입만)
8. 재시도
9. 삭제
```

### 대본 카드 버튼 순서

```
1. 대본
2. 읽어보기
3. 이미지크롤링
4. 영상
5. 포멧팅
6. 복사
7. 로그 (logs 있을 때)
8. 저장
9. 변환 (longform/shortform만)
10. 상품정보 (product만)
11. 재시도
12. 삭제
```

### 버튼 그룹 구분

**영상:**
- **보기**: 읽어보기, 로그, 폴더
- **제작/업로드**: YouTube 업로드
- **편집**: 이미지크롤링, 저장, 쇼츠, 재시도, 삭제

**대본:**
- **보기**: 대본, 읽어보기, 로그
- **제작**: 이미지크롤링, 영상, 상품정보
- **편집**: 복사, 포멧팅, 저장, 변환, 재시도, 삭제

### 구분선

```tsx
<div className="w-px h-8 bg-slate-600"></div>
```

---

## 15. API 테스트 프로세스

### 🎯 핵심 원칙

**절대 테스트 없이 완료하지 않는다**
- 코드 작성 후 반드시 실제 테스트 수행
- 서버 로그를 확인하여 응답 검증
- 타임스탬프로 요청-응답 매칭

### API 테스트 방법

**1. 테스트 스크립트 작성**

```javascript
// test-api.js
const fetch = require('node-fetch');

const API_URL = 'http://localhost:3000/api/endpoint';

fetch(API_URL, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ key: 'value' })
})
  .then(res => res.json())
  .then(data => {
    console.log('✅ 성공:', data);
  })
  .catch(error => {
    console.error('❌ 에러:', error.message);
  });
```

**2. 실행 및 로그 확인**

```bash
# 테스트 실행
node test-api.js

# 서버 로그 확인 (별도 터미널)
tail -30 trend-video-frontend/logs/server.log
```

**3. 응답 검증**

서버 로그에서 확인할 사항:
- 요청 시간과 응답 시간 매칭
- HTTP 상태 코드 (200, 400, 500 등)
- 에러 메시지 및 스택트레이스
- 실제 응답 데이터

### 쿠팡 API 테스트 예시

**테스트 스크립트:** `test-coupang-api.js`

```javascript
const crypto = require('crypto');

const accessKey = 'YOUR_ACCESS_KEY';
const secretKey = 'YOUR_SECRET_KEY';

// Datetime format: yymmddTHHMMSSZ
const now = new Date();
const year = String(now.getUTCFullYear()).slice(-2);
const month = String(now.getUTCMonth() + 1).padStart(2, '0');
const day = String(now.getUTCDate()).padStart(2, '0');
const hours = String(now.getUTCHours()).padStart(2, '0');
const minutes = String(now.getUTCMinutes()).padStart(2, '0');
const seconds = String(now.getUTCSeconds()).padStart(2, '0');
const datetime = `${year}${month}${day}T${hours}${minutes}${seconds}Z`;

// Message: datetime + method + path (no spaces)
const REQUEST_METHOD = 'GET';
const URL = '/v2/providers/affiliate_open_api/apis/openapi/v1/products/bestcategories/1001';
const message = datetime + REQUEST_METHOD + URL;

// HMAC signature
const signature = crypto
  .createHmac('sha256', secretKey)
  .update(message)
  .digest('hex');

// Authorization header (spaces after commas)
const authorization = `CEA algorithm=HmacSHA256, access-key=${accessKey}, signed-date=${datetime}, signature=${signature}`;

console.log('🔐 인증 정보:');
console.log('   datetime:', datetime);
console.log('   message:', message);
console.log('   signature:', signature);

// API 호출
fetch('https://api-gateway.coupang.com' + URL, {
  method: REQUEST_METHOD,
  headers: {
    'Authorization': authorization,
    'Content-Type': 'application/json'
  }
})
  .then(response => {
    console.log('📡 응답 상태:', response.status);
    return response.text().then(text => ({ status: response.status, text, ok: response.ok }));
  })
  .then(({ status, text, ok }) => {
    console.log('📦 응답 본문:', text);
    if (ok) {
      console.log('✅ 성공!');
    } else {
      console.error('❌ 실패:', status);
    }
  })
  .catch(error => {
    console.error('❌ 에러:', error.message);
  });
```

**실행:**
```bash
node test-coupang-api.js
```

**성공 응답 예시:**
```
📡 응답 상태: 200
📦 응답 본문: {"rCode":"0","rMessage":"성공","data":[...]}
✅ 성공!
```

### 서버 로그 분석

**로그 확인 시 주의사항:**

1. **시간 매칭**: 테스트 실행 시간과 로그 타임스탬프 확인
2. **요청 정보**: HTTP 메서드, URL, 파라미터
3. **응답 정보**: 상태 코드, 응답 본문
4. **에러 추적**: 스택트레이스, 에러 메시지

**예시:**
```
[2025-11-14 16:58:13] 🔍 Coupang API Test - 요청 받음
[2025-11-14 16:58:13]    accessKey: 8943cf3b-8...
[2025-11-14 16:58:13]    secretKey: provided
[2025-11-14 16:58:13] 🔐 인증 정보:
[2025-11-14 16:58:13]    datetime: 251114T075813Z
[2025-11-14 16:58:13]    message: 251114T075813ZGET/v2/providers/...
[2025-11-14 16:58:13] 🌐 쿠팡 API 호출 시작: https://api-gateway.coupang.com/...
[2025-11-14 16:58:14] 📡 쿠팡 API 응답 상태: 200
[2025-11-14 16:58:14] ✅ 쿠팡 API 성공: {"rCode":"0",...}
```

### 수정 사이클

```
1. 코드 작성
2. 테스트 스크립트 작성
3. 테스트 실행
4. 서버 로그 확인
5. 에러 발견 시 → 코드 수정 → 2번으로
6. 성공 시 → 완료
```

**❌ 잘못된 방법:**
- 코드만 작성하고 "완료되었습니다" 보고
- 로그 확인 없이 추측으로 문제 해결
- 여러 번 시행착오 후 포기

**✅ 올바른 방법:**
- 테스트 스크립트로 실제 실행
- 로그에서 정확한 에러 확인
- 에러 원인 분석 후 수정
- 재테스트로 검증

---

## 16. 사연 영상 생성 시스템 (2025-11-15 추가) ⭐

### 🎯 개요

유튜브 사연 영상의 표준 구조(훅 + CTA + 본문)를 롱폼과 숏폼 모두에 적용

### 핵심 구조

**롱폼 (60분+)**:
```
Scene 1:
├─ 훅 (30초-1분): 극적인 대사/상황
├─ CTA: "사연 시작 전에 무료로 할 수 있는 구독과 좋아요 부탁드립니다..."
└─ 본문: 본격적인 사연 시작

Scene 2~12:
└─ 이어지는 스토리
```

**숏폼 (60초)**:
```
├─ 훅 (5-10초): 강렬한 시작
├─ CTA (3-5초): "구독과 좋아요 부탁드립니다."
└─ 본문 (40-50초): 핵심 + 반전
```

### 프롬프트 템플릿 위치

```
trend-video-backend/src/prompts/
├─ long_form_prompt.txt       # 롱폼
├─ short_story_system.txt     # 숏폼 시스템
└─ short_story_user.txt       # 숏폼 사용자
```

### 테스트 실행

```bash
node test-story-generation.js
```

**결과**: 20/20 통과 ✅

### 자세한 내용

- **롱폼 가이드**: [LONGFORM_STORY_GUIDE.md](LONGFORM_STORY_GUIDE.md)
- **숏폼 가이드**: [SHORTFORM_STORY_GUIDE.md](SHORTFORM_STORY_GUIDE.md)
- **종합 가이드**: [STORY_GENERATION_COMPLETE.md](STORY_GENERATION_COMPLETE.md)

---

## 17. 스케줄러 중복 실행 방지

### 🎯 핵심 규칙

**레이스 컨디션 방지를 위한 원자적 상태 업데이트**

### ❌ 잘못된 방법 (레이스 컨디션 발생)

```typescript
// 1. 조회
const pendingSchedules = getPendingSchedules();

// 2. 상태 변경
updateScheduleStatus(schedule.id, 'processing');

// ⚠️ 문제: 1과 2 사이에 다른 스케줄러가 같은 스케줄을 가져갈 수 있음!
```

### ✅ 올바른 방법 (원자적 업데이트)

```typescript
// 1. WHERE 조건에 현재 상태를 포함하여 원자적으로 업데이트
const result = db.prepare(`
  UPDATE video_schedules
  SET status = 'processing', updated_at = CURRENT_TIMESTAMP
  WHERE id = ? AND status = 'pending'
`).run(schedule.id);

// 2. 업데이트된 row 수 확인
if (result.changes === 0) {
  // 다른 스케줄러가 이미 처리 중
  console.log('Already being processed by another scheduler');
  continue;
}

// 3. 파이프라인 생성
const pipelineIds = createPipeline(schedule.id);
```

### 핵심 포인트

1. **마킹을 먼저 해라**: 상태 업데이트를 가장 먼저 수행
2. **WHERE 조건에 현재 상태 포함**: `AND status = 'pending'`
3. **업데이트 결과 확인**: `result.changes === 0`이면 이미 처리 중
4. **중복 파이프라인 체크**: 파이프라인 존재 여부도 확인

### 적용 위치

- `automation-scheduler.ts`: `processPendingSchedules()`
- `force-execute/route.ts`: 즉시 실행 API
- 모든 concurrent 작업 처리

### 참고

**파일:** `trend-video-frontend/src/lib/automation-scheduler.ts:100-135`

---

## 18. 버그 수정 히스토리

### Tailwind CSS v4 Emoji Parsing Error

**문제:** `RangeError: Invalid code point` 에러

**해결:** Tailwind CSS v4 → v3 다운그레이드

```bash
npm uninstall @tailwindcss/postcss tailwindcss
npm install -D tailwindcss@3 postcss autoprefixer
```

### Python Job 무한 로그 버그

**문제:** 브라우저 닫혀도 Python 프로세스 계속 실행

**해결:**
1. Python agent 치명적 에러 감지 시 즉시 종료
2. FOREIGN KEY 에러 방지 (contentId 존재 확인)

### JSON 파싱 실패 (상품 대본)

**문제:** 중첩 따옴표 많은 JSON 파싱 실패

**해결:** 긴 필드만 선택적으로 따옴표 이스케이프

```typescript
const longFields = ['narration', 'sora_prompt', 'product_intro'];
longFields.forEach(field => {
  json = escapeQuotesInField(json, field);
});
```

---

*Last Updated: 2025-11-15*
