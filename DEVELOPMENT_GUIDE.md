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

1. [파일 정렬 규칙](#1-파일-정렬-규칙) ⭐
2. [자막 싱크 시스템](#2-자막-싱크-시스템) ⭐
3. [비디오 병합 워크플로우](#3-비디오-병합-워크플로우) ⭐
4. [Regression Test](#4-regression-test) ⭐
5. [프론트엔드-백엔드 아키텍처](#5-프론트엔드-백엔드-아키텍처) ⭐
6. [인증 구현](#6-인증-구현)
7. [초기 로딩 최적화](#7-초기-로딩-최적화)
8. [폴링 최소화](#8-폴링-최소화)
9. [로그 관리](#9-로그-관리)
10. [UI/UX 일관성](#10-uiux-일관성) ⭐
11. [API 에러 처리](#11-api-에러-처리) ⭐
12. [백그라운드 프로세스 중지](#12-백그라운드-프로세스-중지) ⭐
13. [버튼 배치 규칙](#13-버튼-배치-규칙) ⭐

---

## 1. 파일 정렬 규칙

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

## 2. 자막 싱크 시스템

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

## 3. 비디오 병합 워크플로우

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

## 4. Regression Test

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

## 5. 프론트엔드-백엔드 아키텍처

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

## 6. 인증 구현

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

## 7. 초기 로딩 최적화

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

## 8. 폴링 최소화

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

## 9. 로그 관리

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

## 10. UI/UX 일관성

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

## 11. API 에러 처리

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

## 12. 백그라운드 프로세스 중지

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

## 13. 버튼 배치 규칙

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

## 14. 버그 수정 히스토리

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

*Last Updated: 2025-01-20*
