# 개발 가이드 (Development Guide)

이 문서는 workspace 내의 프로젝트에서 권장하는 구현 패턴과 모범 사례를 정리한 문서입니다.

## 📋 목차

1. [파일 정렬 규칙](#1-파일-정렬-규칙) ⭐️ **중요**
2. [자막 싱크 시스템](#2-자막-싱크-시스템) ⭐️ **중요**
3. [비디오 병합 워크플로우](#3-비디오-병합-워크플로우) ⭐️ **중요**
4. [Regression Test](#4-regression-test) ⭐️ **중요**
5. [인증 구현](#5-인증-구현)
6. [초기 로딩 최적화](#6-초기-로딩-최적화)
7. [폴링 최소화](#7-폴링-최소화)
8. [로그 관리](#8-로그-관리)

---

## 1. 파일 정렬 규칙

### 🎯 핵심 규칙 (절대 잊지 말 것!)

⚠️ **2025-01-20 업데이트: ImageFX/Whisk 파일명 랜덤 ID 문제로 정렬 규칙 변경됨**

**모든 이미지/영상 파일 정렬은 생성 시간 기준으로만 정렬:**
- ✅ **lastModified 오래된 순** → 가장 먼저 생성/다운로드된 파일이 씬 0

### 1.1 이미지 파일 정렬 (롱폼/숏폼 제작)

**위치:** `trend-video-frontend/src/app/api/generate-video-upload/route.ts` (lines 74-81)

**배경:**
- 사용자가 ImageFX/Whisk에서 이미지를 순서대로 생성하고 다운로드
- 다운로드된 파일명은 랜덤 ID 포함: `Whisk_0dc8dc11...dr.png`, `Image_fx (48).jpg`
- 파일명으로는 순서를 알 수 없으므로 **생성 시간만이 유일한 신뢰 기준**

**정렬 로직:**
```typescript
// ⚠️ 중요: 이 정렬 로직은 모든 이미지/영상 업로드 API에서 동일하게 적용!
imageFiles.sort((a, b) => {
  // lastModified 시간으로 정렬 (오래된 순 = 작은 값이 먼저)
  // → 가장 먼저 다운로드된 이미지가 씬 0
  // → 마지막에 다운로드된 이미지가 씬 마지막
  return a.lastModified - b.lastModified;
});
```

**저장 형식:**
- 정렬된 이미지는 `image_01.jpg`, `image_02.jpg`, `image_03.jpg` 형식으로 저장
- **2자리 0-패딩**, **1부터 시작** (씬 번호와 매칭)

**실제 예시 (ImageFX/Whisk):**
```
다운로드된 파일 (생성 시간 순):
- Whisk_700c11aba77838ba4eb42a3e0327693edr.png (2025-01-20 10:00:00) ← 가장 먼저 다운로드
- Whisk_0dc8dc11252317b817345d04f0009096dr.png (2025-01-20 10:01:00)
- Whisk_e0b52519831ab8f8d1c41436242106b2dr.png (2025-01-20 10:02:00)
- Whisk_6a685be3f6a633ea432443867ed6c0a5dr.png (2025-01-20 10:03:00)
- Whisk_6d387adcefd971ca6ae4fa4b1acc6ad9dr.png (2025-01-20 10:04:00)
- Whisk_23a3956e84daa4ea3244d56f1a671cb9dr.png (2025-01-20 10:05:00)
- Image_fx (48).jpg (2025-01-20 10:06:00)
- Whisk_324a0c83204f880986145f6d0f91511fdr.png (2025-01-20 10:07:00)
- Whisk_509d4d33513179eac6740f94c7c5785cdr.png (2025-01-20 10:08:00)
- Whisk_b8657e817ecbdeaa4b54d072863d20a7dr.png (2025-01-20 10:09:00) ← 마지막 다운로드

정렬 후 (생성 시간 오래된 순):
  씬 0 (폭탄): Whisk_700c11aba77838ba4eb42a3e0327693edr.png → image_01.jpg
  씬 1: Whisk_0dc8dc11252317b817345d04f0009096dr.png → image_02.jpg
  씬 2: Whisk_e0b52519831ab8f8d1c41436242106b2dr.png → image_03.jpg
  씬 3: Whisk_6a685be3f6a633ea432443867ed6c0a5dr.png → image_04.jpg
  씬 4: Whisk_6d387adcefd971ca6ae4fa4b1acc6ad9dr.png → image_05.jpg
  씬 5: Whisk_23a3956e84daa4ea3244d56f1a671cb9dr.png → image_06.jpg
  씬 6: Image_fx (48).jpg → image_07.jpg
  씬 7: Whisk_324a0c83204f880986145f6d0f91511fdr.png → image_08.jpg
  씬 8: Whisk_509d4d33513179eac6740f94c7c5785cdr.png → image_09.jpg
  씬 9: Whisk_b8657e817ecbdeaa4b54d072863d20a7dr.png → image_10.jpg
```

**왜 파일명이 아닌 생성 시간을 사용하는가?**
- ❌ 파일명: 랜덤 ID(`0dc8dc11...`), 괄호 숫자(`(48)`) → 순서 의미 없음
- ✅ 생성 시간: 사용자가 이미지를 생성/다운로드한 실제 순서 반영

### 1.2 비디오 파일 정렬 (비디오 병합)

**위치:** `trend-video-frontend/src/app/api/video-merge/route.ts` (lines 46-70)

**정렬 로직:** (이미지와 동일)
```typescript
videoFiles.sort((a, b) => {
  const extractNumber = (filename: string): number | null => {
    const match = filename.match(/(\d+)/);
    return match ? parseInt(match[1], 10) : null;
  };

  const numA = extractNumber(a.name);
  const numB = extractNumber(b.name);

  if (numA !== null && numB !== null) {
    return numA - numB;
  }

  return a.lastModified - b.lastModified;
});
```

**저장 형식:**
- 정렬된 비디오는 `000_원본파일명.mp4`, `001_원본파일명.mp4` 형식으로 저장
- **3자리 0-패딩**, **0부터 시작**, **원본 파일명 유지**

**예시:**
```
업로드된 파일:
- clip3.mp4 (2025-01-01 10:00)
- video.mp4 (2025-01-01 09:00)
- 1.mp4 (2025-01-01 11:00)
- scene_10.mp4 (2025-01-01 08:00)

정렬 후:
1. 1.mp4 → 000_1.mp4
2. clip3.mp4 → 001_clip3.mp4
3. scene_10.mp4 → 002_scene_10.mp4
4. video.mp4 → 003_video.mp4 (숫자 없으니 오래된 순: 09:00)
```

### 1.3 Python 스크립트 파일 정렬 주의사항

**위치:** `trend-video-backend/video_merge.py` (line 711)

**⚠️ 중요:** Python 스크립트에서 파일을 다시 정렬하지 않는다!

```python
# ❌ 이렇게 하지 마세요!
# video_files.sort(key=lambda p: p.name)

# ✅ API에서 이미 정렬되어 전달되므로 순서 유지
# (시퀀스 번호가 있으면 시퀀스 우선, 없으면 생성 시간 순)
```

**이유:**
- API에서 파일명 + lastModified 정보를 모두 활용하여 정렬
- Python에서는 lastModified 정보가 없어 정확한 정렬 불가능
- Python에서 재정렬하면 API의 정렬 순서가 깨짐

---

## 2. 자막 싱크 시스템

### 🎯 핵심 개념

**Edge TTS WordBoundary 이벤트를 사용하여 음성과 100% 정확히 싱크된 자막 생성**

- Edge TTS는 음성 생성 시 각 단어의 정확한 시작/종료 시간 제공
- 이 타임스탬프를 활용하여 자막을 생성
- 비디오가 끝나도 오디오가 계속되면 마지막 프레임을 freeze하여 자막 끝까지 표시

### 2.1 TTS 생성 시 타임스탬프 수집

**위치:** `trend-video-backend/video_merge.py` - `generate_tts()` 함수

```python
async def generate_tts(text: str, output_path: Path) -> tuple:
    """
    Edge TTS로 음성 생성 + 단어별 타임스탬프 추출
    Returns: (output_path, duration, word_timings)
    """
    communicate = edge_tts.Communicate(text, voice, rate='-15%')

    word_timings = []
    sentence_timings = []
    audio_data = b""

    async for chunk in communicate.stream():
        if chunk["type"] == "audio":
            audio_data += chunk["data"]
        elif chunk["type"] == "WordBoundary":
            # 단어별 타임스탬프 저장
            word_timings.append({
                "word": chunk["text"],
                "start": chunk["offset"] / 10_000_000.0,  # 100ns → 초 변환
                "end": (chunk["offset"] + chunk["duration"]) / 10_000_000.0
            })
        elif chunk["type"] == "SentenceBoundary":
            # 문장별 타임스탬프 저장 (폴백용)
            sentence_timings.append({
                "text": chunk.get("text", ""),
                "start": chunk["offset"] / 10_000_000.0,
                "end": (chunk["offset"] + chunk["duration"]) / 10_000_000.0
            })

    # WordBoundary가 없으면 SentenceBoundary를 단어로 분할
    if not word_timings and sentence_timings:
        for sent in sentence_timings:
            words = sent["text"].split()
            time_per_word = (sent["end"] - sent["start"]) / len(words)
            for i, word in enumerate(words):
                word_timings.append({
                    "word": word,
                    "start": sent["start"] + (i * time_per_word),
                    "end": sent["start"] + ((i + 1) * time_per_word)
                })

    return output_path, duration, word_timings
```

### 2.2 자막 생성 시 타임스탬프 활용

**위치:** `trend-video-backend/video_merge.py` - `create_ass_from_text()` 함수

```python
def create_ass_from_text(text: str, duration: float, word_timings: list):
    if word_timings and len(word_timings) > 0:
        # WordBoundary 타임스탬프 사용
        subtitles = []
        current_text = ""
        current_start = None
        current_end = None

        for i, word_info in enumerate(word_timings):
            word = word_info["word"]
            start = word_info["start"]
            end = word_info["end"]

            if current_start is None:
                current_start = start

            next_text = current_text + (" " if current_text else "") + word

            # 22자를 초과하면 줄바꿈
            if len(next_text) > 22 and current_text:
                subtitles.append({
                    "start": current_start,
                    "end": end,
                    "text": current_text.strip()
                })
                current_text = word
                current_start = start
                current_end = end
            else:
                current_text = next_text
                current_end = end

        # 남은 텍스트 처리
        if current_text:
            subtitles.append({
                "start": current_start,
                "end": current_end,
                "text": current_text.strip()
            })
    else:
        # 폴백: 타임스탬프가 없으면 문자 기반 방식
        # ... (기존 로직)
```

### 2.3 비디오 확장 (오디오가 더 긴 경우)

**위치:** `trend-video-backend/video_merge.py` - `add_audio_to_video()` 함수

```python
def add_audio_to_video(video_path, audio_path, output_path,
                       subtitle_text, add_subtitles,
                       word_timings, audio_duration):

    video_duration = get_video_duration(video_path)

    # 자막이 있는 경우
    if subtitle_text and add_subtitles:
        # 자막은 오디오 길이에 맞춤
        duration = audio_duration if audio_duration else video_duration

        # ASS 자막 파일 생성 (word_timings 전달)
        ass_path = create_ass_from_text(subtitle_text, duration, word_timings)

        # 오디오가 비디오보다 길면 마지막 프레임 freeze
        if audio_duration > video_duration:
            vf_filter = f"tpad=stop_mode=clone:stop_duration={audio_duration - video_duration},ass={ass_path}"
        else:
            vf_filter = f"ass={ass_path}"

        cmd = [
            ffmpeg, '-y',
            '-i', str(video_path),
            '-i', str(audio_path),
            '-vf', vf_filter,
            '-c:v', 'libx264',
            '-preset', 'medium',
            '-crf', '23',
            '-c:a', 'aac',
            '-map', '0:v:0',
            '-map', '1:a:0',
            str(output_path)
        ]

    # 자막 없는 경우도 동일하게 비디오 확장
    else:
        if audio_duration and audio_duration > video_duration:
            cmd = [
                ffmpeg, '-y',
                '-i', str(video_path),
                '-i', str(audio_path),
                '-vf', f"tpad=stop_mode=clone:stop_duration={audio_duration - video_duration}",
                '-c:v', 'libx264',
                # ...
            ]
```

**tpad 필터 설명:**
- `tpad=stop_mode=clone:stop_duration=X`: 마지막 프레임을 X초 동안 복제
- 비디오가 끝나도 오디오가 계속 재생되면 마지막 화면이 정지된 상태로 유지
- 자막도 끝까지 표시됨

---

## 3. 비디오 병합 워크플로우

### 3.1 JSON/TXT 파일 보존

**위치:** `trend-video-frontend/src/app/api/video-merge/route.ts` (lines 231-243)

```typescript
// JSON/TXT 파일도 videos 폴더에 저장 (재시도용)
if (jsonFile) {
  try {
    const jsonPath = path.join(videoDir, jsonFile.name);
    const jsonBuffer = Buffer.from(await jsonFile.arrayBuffer());
    await fs.writeFile(jsonPath, jsonBuffer);
    await addJobLog(jobId, `📄 ${jsonFile.name} 저장 (재시도용)`);
  } catch (error) {
    console.error('⚠️ JSON/TXT 파일 저장 실패:', error);
  }
}
```

**폴더 구조:**
```
output/merge_<timestamp>/
├── videos/
│   ├── 000_video1.mp4
│   ├── 001_video2.mp4
│   ├── 002_video3.mp4
│   └── script.json          ← 재시도용 보존 ⭐️
├── config.json
├── merged_video.mp4
└── <제목>.mp4               ← JSON title 사용 ⭐️
```

### 3.2 제목 추출 및 파일명 설정

**Frontend (route.ts):**
```typescript
// JSON에서 제목 추출
const jsonData = JSON.parse(jsonText);
let videoTitle = `비디오 병합 (${videoFiles.length}개)`;  // 기본 제목

if (jsonData.title) {
  videoTitle = jsonData.title;
}

createJob(user.userId, jobId, videoTitle);
```

**Backend (video_merge.py):**
```python
# videos 폴더에서 JSON 파일 찾기
video_title = None
videos_dir = output_dir / 'videos'

if videos_dir.exists():
    for file in videos_dir.iterdir():
        if file.suffix.lower() in ['.json', '.txt']:
            content = file.read_text(encoding='utf-8')
            clean_content = content.replace('```json', '').replace('```', '').strip()
            data = json.loads(clean_content)
            if 'title' in data:
                video_title = data['title']
                break

# 제목으로 파일명 설정
if video_title:
    # 안전한 파일명으로 변환 (특수문자 제거)
    safe_title = re.sub(r'[<>:"/\\|?*]', '', video_title)
    safe_title = safe_title.strip()[:100]  # 최대 100자
    final_filename = f"{safe_title}.mp4"
else:
    final_filename = 'final_with_narration.mp4'

final_with_audio = output_dir / final_filename
```

**특수문자 제거 규칙:**
- Windows 금지 문자: `< > : " / \ | ? *`
- 공백은 유지
- 최대 100자로 제한

---

## 4. Regression Test

### 🎯 핵심 원칙

**스테이블 버전 푸시 후 반드시 Regression Test 작성 및 실행**

### 4.1 Regression Test 작성 시점

**언제 작성하는가?**
1. ✅ 스테이블 버전 푸시 후
2. ✅ 주요 기능 변경 후
3. ✅ 버그 수정 후 (재발 방지)

**작성 대상:**
- ✅ 롱폼 비디오 생성
- ✅ 숏폼 비디오 생성
- ✅ SORA2 비디오 생성
- ✅ 비디오 병합
- ✅ TTS 생성 및 자막 싱크

### 4.2 테스트 데이터 원칙

**작은 데이터 사용:**
- 롱폼: 2-3개 씬만 테스트 (전체 8씬 불필요)
- 숏폼: 2-3개 씬만 테스트
- SORA2: 간단한 1개 프롬프트
- 이미지: 작은 크기 (예: 512x512)

**이유:**
- CI/CD에서 빠르게 실행
- 디스크 공간 절약
- 핵심 기능 검증에 집중

### 4.3 Regression Test 구조

**위치:** `trend-video-backend/tests/`

```
trend-video-backend/
├── tests/
│   ├── __init__.py
│   ├── test_regression.py          ← 메인 테스트 파일
│   ├── test_data/
│   │   ├── longform_2scenes.json   ← 롱폼 테스트 데이터
│   │   ├── shortform_2scenes.json  ← 숏폼 테스트 데이터
│   │   ├── sora2_simple.json       ← SORA2 테스트 데이터
│   │   ├── test_image_01.jpg       ← 테스트 이미지
│   │   └── test_image_02.jpg
│   └── README.md                    ← 테스트 실행 방법
```

### 4.4 테스트 실행 방법

```bash
# 전체 Regression Test 실행
cd trend-video-backend
python -m pytest tests/test_regression.py -v

# 특정 테스트만 실행
python -m pytest tests/test_regression.py::test_longform_generation -v
python -m pytest tests/test_regression.py::test_shortform_generation -v
python -m pytest tests/test_regression.py::test_sora2_generation -v
```

### 4.5 테스트 성공 기준

**각 테스트는 다음을 확인:**
1. ✅ 프로세스가 정상 종료 (exit code 0)
2. ✅ 출력 비디오 파일 생성됨
3. ✅ 출력 비디오가 재생 가능 (ffprobe로 확인)
4. ✅ 예상된 파일 구조 생성 (generated_videos 폴더 등)
5. ✅ 로그에 에러 없음

### 4.6 Regression Test 업데이트 규칙

**스테이블 버전마다:**
1. 기존 테스트가 모두 통과하는지 확인
2. 새로운 기능이 추가되었으면 해당 테스트 추가
3. 변경된 기능이 있으면 테스트 업데이트
4. 테스트 실행 결과를 Git에 커밋

**테스트 실패 시:**
- 코드를 수정하거나
- 의도된 변경이면 테스트를 업데이트

---

## 5. 인증 구현

### ✅ 권장: 쿠키 기반 인증

**장점:**
- 브라우저가 자동으로 쿠키 전송
- localStorage 관리 불필요
- 더 안전 (httpOnly 설정 가능)
- 세션 로그 스팸 감소

**구현 방법:**

#### 백엔드 (Next.js API)

```typescript
// lib/session.ts
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

// 세션 생성
export async function createSession(userId: string, email: string, isAdmin: boolean): Promise<string> {
  const sessionId = crypto.randomUUID();
  // ... 세션 저장 로직
  return sessionId;
}

// 세션 쿠키 설정
export function setSessionCookie(response: NextResponse, sessionId: string): void {
  response.cookies.set('sessionId', sessionId, {
    httpOnly: false, // 개발: false, 프로덕션: true
    secure: false,   // 개발: false, 프로덕션: true
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60, // 7일
    path: '/'
  });
}

// 세션 ID 가져오기 (쿠키 우선)
export function getSessionIdFromRequest(request: NextRequest): string | null {
  // 쿠키 확인
  return request.cookies.get('sessionId')?.value || null;
}

// 현재 사용자 가져오기
export async function getCurrentUser(request: NextRequest) {
  const sessionId = getSessionIdFromRequest(request);
  if (!sessionId) return null;
  return await getSession(sessionId);
}
```

#### 로그인 API

```typescript
// app/api/auth/login/route.ts
import { createSession, setSessionCookie } from '@/lib/session';

export async function POST(request: NextRequest) {
  // ... 사용자 인증 로직

  const sessionId = await createSession(user.id, user.email, user.isAdmin);

  const response = NextResponse.json({
    success: true,
    user: { id: user.id, email: user.email, isAdmin: user.isAdmin }
    // sessionId를 응답에 포함하지 않음 (쿠키로만 전송)
  });

  // 쿠키 설정
  setSessionCookie(response, sessionId);

  return response;
}
```

#### 프론트엔드 (React/Next.js)

```typescript
// 인증 헤더 - 빈 객체 반환 (쿠키 자동 전송)
const getAuthHeaders = () => {
  return {}; // Authorization 헤더 사용 안 함
};

// 로그인
const handleLogin = async (email: string, password: string) => {
  const response = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
    // credentials: 'include' 는 same-origin에서 자동
  });

  const data = await response.json();
  // localStorage에 저장하지 않음!
  if (data.success) {
    router.push('/');
  }
};

// API 호출
const fetchData = async () => {
  const response = await fetch('/api/some-endpoint', {
    headers: getAuthHeaders() // 빈 객체, 쿠키 자동 전송
  });
  return response.json();
};
```

### ❌ 비권장: localStorage + Authorization 헤더

```typescript
// 이렇게 하지 마세요!
localStorage.setItem('sessionId', sessionId);
const sessionId = localStorage.getItem('sessionId');
headers: { 'Authorization': `Bearer ${sessionId}` }
```

**문제점:**
- 수동으로 sessionId 관리 필요
- 모든 요청마다 localStorage 읽기
- 세션 검증 로그 스팸
- XSS 취약점

---

## 2. 초기 로딩 최적화

### ✅ 권장: 데이터 로드 완료 후 렌더링

**목적:**
- 깜빡임 방지
- 더 나은 사용자 경험
- 불완전한 UI 노출 방지

**구현 방법:**

```typescript
export default function Page() {
  const [user, setUser] = useState(null);
  const [settings, setSettings] = useState(null);
  const [isInitialLoading, setIsInitialLoading] = useState(true);

  useEffect(() => {
    loadInitialData();
  }, []);

  const loadInitialData = async () => {
    try {
      setIsInitialLoading(true);

      // 1. 세션 확인
      const sessionRes = await fetch('/api/auth/session');
      const sessionData = await sessionRes.json();

      if (sessionData.user) {
        setUser(sessionData.user);

        // 2. 필요한 데이터 병렬로 로드
        const [creditsRes, settingsRes] = await Promise.all([
          fetch('/api/credits'),
          fetch('/api/settings')
        ]);

        const [creditsData, settingsData] = await Promise.all([
          creditsRes.json(),
          settingsRes.json()
        ]);

        // 3. 모든 데이터 설정
        setUser(prev => ({ ...prev, credits: creditsData.credits }));
        setSettings(settingsData);
      }
    } catch (error) {
      console.error('Initial data load error:', error);
    } finally {
      // 4. 로딩 완료
      setIsInitialLoading(false);
    }
  };

  // 로딩 중일 때 스피너 표시
  if (isInitialLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-purple-500 mx-auto mb-4"></div>
          <p className="text-slate-300 text-lg">로딩 중...</p>
        </div>
      </div>
    );
  }

  // 실제 컨텐츠 렌더링
  return (
    <div>
      {/* 모든 데이터가 준비된 상태로 렌더링 */}
      <h1>환영합니다, {user?.email}</h1>
      <p>크레딧: {user?.credits}</p>
    </div>
  );
}
```

**핵심 포인트:**
1. `isInitialLoading` state로 로딩 상태 관리
2. `Promise.all`로 병렬 요청 (속도 향상)
3. `finally`에서 로딩 완료 처리
4. 로딩 중일 때 스피너 표시
5. 데이터 준비 완료 후 실제 UI 렌더링

### ❌ 비권장: 렌더링 후 데이터 로드

```typescript
// 이렇게 하지 마세요!
useEffect(() => {
  fetch('/api/user').then(data => setUser(data));
  fetch('/api/settings').then(data => setSettings(data));
}, []);

return (
  <div>
    {/* 깜빡임 발생! */}
    <h1>{user?.email || '로딩 중...'}</h1>
  </div>
);
```

**문제점:**
- UI가 먼저 렌더링되어 깜빡임
- "로딩 중..." → 실제 데이터로 변경되는 깜빡임
- 순차적 요청으로 느림

---

## 3. 폴링 최소화

### ✅ 권장: 이벤트 기반 데이터 갱신

**원칙:**
- 폴링은 꼭 필요한 경우에만 사용
- CRUD 작업 후 자동 갱신
- 실시간 업데이트가 필요하지 않으면 폴링 안 함

**구현 방법:**

```typescript
// Admin Tasks 페이지 예시
export default function TasksPage() {
  const [tasks, setTasks] = useState([]);

  // 초기 로드만
  useEffect(() => {
    fetchTasks();
  }, []);

  // ❌ 폴링 제거 - 이렇게 하지 마세요!
  // useEffect(() => {
  //   const interval = setInterval(() => {
  //     fetchTasks();
  //   }, 5000);
  //   return () => clearInterval(interval);
  // }, []);

  const fetchTasks = async () => {
    const res = await fetch('/api/tasks');
    const data = await res.json();
    setTasks(data.tasks);
  };

  // Task 추가 후 자동 갱신
  const addTask = async (content: string) => {
    await fetch('/api/tasks', {
      method: 'POST',
      body: JSON.stringify({ content })
    });

    // 추가 후 바로 갱신
    await fetchTasks();
  };

  // Task 상태 변경 후 자동 갱신
  const updateTask = async (id: string, status: string) => {
    await fetch('/api/tasks', {
      method: 'PUT',
      body: JSON.stringify({ id, status })
    });

    // 업데이트 후 바로 갱신
    await fetchTasks();
  };

  // Task 삭제 후 자동 갱신
  const deleteTask = async (id: string) => {
    await fetch(`/api/tasks?id=${id}`, {
      method: 'DELETE'
    });

    // 삭제 후 바로 갱신
    await fetchTasks();
  };

  return (
    <div>
      {/* UI */}
    </div>
  );
}
```

### 폴링이 필요한 경우

외부 프로세스(Python 스크립트 등)가 데이터를 변경하는 경우에만 폴링 사용:

```typescript
// 대본 생성 상태 폴링 (외부 Python 프로세스)
useEffect(() => {
  if (!currentScriptId || scriptStatus === 'completed') return;

  const interval = setInterval(async () => {
    const res = await fetch(`/api/script-status?scriptId=${currentScriptId}`);
    const data = await res.json();

    if (data.status === 'completed') {
      setScriptStatus('completed');
      clearInterval(interval);
      await fetchScripts(); // 최종 데이터 갱신
    }
  }, 2000);

  return () => clearInterval(interval);
}, [currentScriptId, scriptStatus]);
```

**폴링 사용 기준:**
- ✅ 외부 프로세스가 데이터 변경 (Python, 백그라운드 작업)
- ✅ 실시간 상태 모니터링 필수 (작업 진행률)
- ❌ Admin 페이지처럼 즉시 반영 불필요
- ❌ CRUD 작업으로 충분히 갱신 가능

---

## 4. 로그 관리

### ✅ 권장: 필요한 로그만 남기기

**원칙:**
- 개발 중: 디버깅에 필요한 로그
- 프로덕션: 에러와 중요 이벤트만
- 폴링 로그는 주석 처리

**구현 방법:**

```typescript
// lib/session.ts
export async function getSession(sessionId: string) {
  // 폴링 시 로그 스팸 방지 - 주석 처리
  // console.log('🔍 세션 조회 요청:', sessionId);

  const sessions = await readSessions();
  // console.log('📋 현재 저장된 세션 목록:', Array.from(sessions.keys()));

  const session = sessions.get(sessionId);

  if (!session) {
    // console.log('❌ 세션을 찾을 수 없음');
    return null;
  }

  if (Date.now() > session.expiresAt) {
    console.log('⏰ 세션 만료됨'); // 중요 이벤트는 로그
    sessions.delete(sessionId);
    await writeSessions(sessions);
    return null;
  }

  // console.log('✅ 세션 유효:', session.email);
  return { userId: session.userId, email: session.email, isAdmin: session.isAdmin };
}
```

**로그 레벨:**
- ✅ 로그인/로그아웃 성공
- ✅ 에러 발생
- ✅ 중요한 상태 변경 (세션 만료, 크레딧 차감)
- ❌ 모든 API 요청
- ❌ 세션 검증 (폴링 시 스팸)
- ❌ 일반적인 데이터 조회

---

## 5. SSR/Hydration 주의사항

### ✅ 권장: 클라이언트 전용 코드 분리

**문제:**
- localStorage는 서버에서 사용 불가
- 서버/클라이언트 불일치 시 Hydration 에러

**해결 방법:**

```typescript
export default function Component() {
  // ❌ 이렇게 하지 마세요!
  // const [value, setValue] = useState(() => localStorage.getItem('key'));

  // ✅ 권장: 기본값으로 초기화
  const [value, setValue] = useState('default');
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    // 클라이언트에서만 실행
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('key');
      if (stored) setValue(stored);
    }
    setIsMounted(true);
  }, []);

  // 마운트 전에는 기본값 표시
  if (!isMounted) return null;

  return <div>{value}</div>;
}
```

---

## 6. Git 푸시 가이드

### ✅ 권장: "workspace에 깃 푸시해줘" 명령 처리

**원칙:**
- "workspace에 깃 푸시"는 작업과 관련된 모든 저장소를 푸시하는 것을 의미
- 사용자에게 푸시할 저장소 목록을 확인 받고 진행

**처리 절차:**

1. **현재 작업 컨텍스트 파악**
   - 어떤 저장소를 수정했는지 확인
   - frontend, backend 모두 수정했는지 체크

2. **사용자에게 확인 요청**
   ```
   다음 저장소들을 푸시하시겠습니까?
   - trend-video-frontend
   - trend-video-backend

   모두 푸시하시겠습니까? (y/n)
   ```

3. **단계별 푸시 실행**
   ```bash
   # 1. Frontend 푸시
   cd trend-video-frontend
   git add .
   git commit -m "feat: [작업 내용]"
   git push origin master

   # 2. Backend 푸시
   cd ../trend-video-backend
   git add .
   git commit -m "feat: [작업 내용]"
   git push origin master
   ```

**예시 시나리오:**

**시나리오 1: Frontend와 Backend 모두 수정**
```
사용자: "workspace에 깃 푸시해줘"

AI 응답:
"현재 작업에서 다음 저장소들이 수정되었습니다:
✅ trend-video-frontend (API 엔드포인트 경로 변경)
✅ trend-video-backend (Multi-AI Aggregator 통합)

모두 푸시하시겠습니까?"

→ 사용자 확인 후 순차적으로 푸시
```

**시나리오 2: Frontend만 수정**
```
사용자: "workspace에 깃 푸시해줘"

AI 응답:
"현재 작업에서 다음 저장소가 수정되었습니다:
✅ trend-video-frontend (토스트 메시지 변경)

trend-video-frontend를 푸시하시겠습니까?"

→ 사용자 확인 후 푸시
```

**주의사항:**
- 작업과 무관한 저장소는 푸시 목록에 포함하지 않음
- 커밋 메시지는 작업 내용을 정확히 반영
- 푸시 전 git status로 변경사항 확인
- 각 저장소마다 푸시 성공 여부 확인

**커밋 메시지 규칙:**
- `feat:` 새 기능 추가
- `fix:` 버그 수정
- `refactor:` 리팩토링
- `docs:` 문서 수정
- `style:` 코드 스타일 변경
- `chore:` 기타 작업

---

## 📝 체크리스트

새 기능 구현 시 확인사항:

- [ ] 쿠키 기반 인증 사용
- [ ] 초기 데이터 로드 완료 후 렌더링
- [ ] 불필요한 폴링 제거 (이벤트 기반 갱신)
- [ ] Promise.all로 병렬 요청
- [ ] 로그 최소화 (에러와 중요 이벤트만)
- [ ] localStorage는 useEffect에서만 접근
- [ ] 로딩 상태 표시
- [ ] Git 푸시 시 작업 관련 저장소 확인

---

## 참고 프로젝트

- **trend-video-frontend**: 위 패턴을 모두 적용한 참고 프로젝트
  - `src/lib/session.ts`: 쿠키 기반 인증
  - `src/app/page.tsx`: 초기 로딩 최적화
  - `src/app/admin/tasks/page.tsx`: 폴링 제거 사례

---

*Last Updated: 2025-01-01*
