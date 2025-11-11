# 개발 가이드 (Development Guide)

이 문서는 workspace 내의 프로젝트에서 권장하는 구현 패턴과 모범 사례를 정리한 문서입니다.

## 🌏 기본 규칙

### AI와의 대화는 한글로 진행
- 모든 개발 대화는 한글로 진행합니다
- 코드 주석도 가능한 한글로 작성합니다
- 에러 메시지와 로그도 한글을 우선적으로 사용합니다

## 📋 목차

1. [파일 정렬 규칙](#1-파일-정렬-규칙) ⭐️ **중요**
2. [자막 싱크 시스템](#2-자막-싱크-시스템) ⭐️ **중요**
3. [비디오 병합 워크플로우](#3-비디오-병합-워크플로우) ⭐️ **중요**
4. [Regression Test](#4-regression-test) ⭐️ **중요**
5. [프론트엔드-백엔드 아키텍처](#5-프론트엔드-백엔드-아키텍처) ⭐️ **중요**
6. [인증 구현](#6-인증-구현)
7. [초기 로딩 최적화](#7-초기-로딩-최적화)
8. [폴링 최소화](#8-폴링-최소화)
9. [로그 관리](#9-로그-관리)
10. [UI/UX 일관성 규칙](#10-uiux-일관성-규칙) ⭐️ **중요**
11. [API 에러 처리 규칙](#11-api-에러-처리-규칙) ⭐️ **중요**
12. [백그라운드 프로세스 중지 기능](#12-백그라운드-프로세스-중지-기능) ⭐️ **중요**

---

## 1. 파일 정렬 규칙

### 🎯 핵심 규칙 (절대 잊지 말 것!)

⚠️ **2025-01-20 업데이트: 시퀀스 번호 우선, 그 다음 lastModified 정렬**

**모든 이미지/영상 파일 정렬 규칙:**
1. ✅ **시퀀스 번호가 있으면 시퀀스 우선** (01, 02, 03...)
2. ✅ **시퀀스 번호가 없으면 lastModified 오래된 순**
3. ✅ **썸네일은 시퀀스 제일 앞 또는 오래된 것 1장**

### 1.1 이미지 파일 정렬 (롱폼/숏폼 제작)

**위치:** `trend-video-frontend/src/app/api/generate-video-upload/route.ts` (lines 95-144)

**배경:**
- 사용자가 ImageFX/Whisk에서 이미지를 순서대로 생성하고 다운로드
- 다운로드된 파일명은 랜덤 ID 포함: `Whisk_0dc8dc11...dr.png`, `Image_fx (48).jpg`
- 일부 사용자는 시퀀스 번호로 파일명 변경: `01.jpg`, `image_02.png`, `scene-03.jpg`
- **시퀀스 번호가 있으면 시퀀스 우선, 없으면 생성 시간 기준**

**정렬 로직:**
```typescript
// ⚠️ 중요: 이 정렬 로직은 모든 이미지/영상 업로드 API에서 동일하게 적용!
const extractSequenceNumber = (filename: string): number | null => {
  // 1. 파일명이 숫자로 시작: "1.jpg", "02.png"
  const startMatch = filename.match(/^(\d+)\./);
  if (startMatch) return parseInt(startMatch[1], 10);

  // 2. _숫자. 또는 -숫자. 패턴: "image_01.jpg", "scene-02.png"
  const seqMatch = filename.match(/[_-](\d{1,3})\./);
  if (seqMatch) return parseInt(seqMatch[1], 10);

  // 3. (숫자) 패턴: "Image_fx (47).jpg"
  // 단, 랜덤 ID가 없을 때만
  const parenMatch = filename.match(/\((\d+)\)/);
  if (parenMatch && !filename.match(/[_-]\w{8,}/)) {
    return parseInt(parenMatch[1], 10);
  }

  return null;
};

imageFiles.sort((a, b) => {
  const numA = extractSequenceNumber(a.name);
  const numB = extractSequenceNumber(b.name);

  // 둘 다 시퀀스 번호가 있으면: 시퀀스 번호로 정렬
  if (numA !== null && numB !== null) {
    return numA - numB;
  }

  // 시퀀스 번호가 하나만 있으면: 시퀀스 번호 있는게 우선
  if (numA !== null && numB === null) return -1;
  if (numA === null && numB !== null) return 1;

  // 둘 다 없으면: lastModified로 정렬 (오래된 순)
  return a.lastModified - b.lastModified;
});
```

**저장 형식:**
- 정렬된 이미지는 `image_01.jpg`, `image_02.jpg`, `image_03.jpg` 형식으로 저장
- **2자리 0-패딩**, **1부터 시작** (씬 번호와 매칭)

**실제 예시 1 (시퀀스 번호 있음):**
```
업로드된 파일:
- 05.jpg (2025-01-20 10:05:00) [시퀀스: 5]
- 02.jpg (2025-01-20 10:02:00) [시퀀스: 2]
- 01.jpg (2025-01-20 10:01:00) [시퀀스: 1]
- random.jpg (2025-01-20 10:00:00) [시퀀스 없음] ← 가장 오래됨

정렬 후 (시퀀스 우선 → lastModified):
  씬 0 (폭탄): 01.jpg [시퀀스: 1] → image_01.jpg
  씬 1: 02.jpg [시퀀스: 2] → image_02.jpg
  씬 2: 05.jpg [시퀀스: 5] → image_03.jpg
  씬 3: random.jpg [시퀀스 없음] → image_04.jpg
```

**실제 예시 2 (ImageFX/Whisk - 시퀀스 번호 없음):**
```
다운로드된 파일 (생성 시간 순):
- Whisk_700c11aba77838ba4eb42a3e0327693edr.png (2025-01-20 10:00:00) ← 가장 먼저 다운로드
- Whisk_0dc8dc11252317b817345d04f0009096dr.png (2025-01-20 10:01:00)
- Whisk_e0b52519831ab8f8d1c41436242106b2dr.png (2025-01-20 10:02:00)
- Image_fx (48).jpg (2025-01-20 10:03:00)
- Whisk_324a0c83204f880986145f6d0f91511fdr.png (2025-01-20 10:04:00) ← 마지막 다운로드

정렬 후 (lastModified 오래된 순 - 시퀀스 번호 없음):
  씬 0 (폭탄): Whisk_700c11aba77838ba4eb42a3e0327693edr.png → image_01.jpg
  씬 1: Whisk_0dc8dc11252317b817345d04f0009096dr.png → image_02.jpg
  씬 2: Whisk_e0b52519831ab8f8d1c41436242106b2dr.png → image_03.jpg
  씬 3: Image_fx (48).jpg → image_04.jpg
  씬 4: Whisk_324a0c83204f880986145f6d0f91511fdr.png → image_05.jpg
```

**정렬 우선순위:**
1. ✅ **시퀀스 번호**: 파일명에서 숫자 패턴 추출 (01, image_02, scene-03)
2. ✅ **생성 시간**: 시퀀스 번호가 없을 때만 사용 (lastModified 오래된 순)

### 1.2 비디오 파일 정렬 (비디오 병합)

**위치:** `trend-video-frontend/src/app/api/video-merge/route.ts` (lines 46-71)

**정렬 로직:** (이미지와 동일 - 시퀀스 우선, 그 다음 lastModified)
```typescript
const extractVideoSequenceNumber = (filename: string): number | null => {
  // scene_001.mp4, video_002.mp4 등의 패턴 (3자리 이상)
  const match = filename.match(/[_-](\d{3,})\./);
  if (match) {
    return parseInt(match[1], 10);
  }
  return null;
};

videoFiles.sort((a, b) => {
  const numA = extractVideoSequenceNumber(a.name);
  const numB = extractVideoSequenceNumber(b.name);

  // 둘 다 시퀀스 번호가 있으면: 시퀀스 번호로 정렬
  if (numA !== null && numB !== null) {
    return numA - numB;
  }

  // 시퀀스 번호가 하나만 있으면: 시퀀스 번호 있는게 우선
  if (numA !== null && numB === null) return -1;
  if (numA === null && numB !== null) return 1;

  // 둘 다 없으면: lastModified로 정렬 (오래된 순)
  return a.lastModified - b.lastModified;
});
```

**저장 형식:**
- 정렬된 비디오는 `000_원본파일명.mp4`, `001_원본파일명.mp4` 형식으로 저장
- **3자리 0-패딩**, **0부터 시작**, **원본 파일명 유지**

**예시:**
```
업로드된 파일:
- scene_005.mp4 (2025-01-01 10:00) [시퀀스: 5]
- video.mp4 (2025-01-01 09:00) [시퀀스 없음] ← 가장 오래됨
- scene_001.mp4 (2025-01-01 11:00) [시퀀스: 1]
- scene_003.mp4 (2025-01-01 08:00) [시퀀스: 3]

정렬 후 (시퀀스 우선 → lastModified):
1. scene_001.mp4 [시퀀스: 1] → 000_scene_001.mp4
2. scene_003.mp4 [시퀀스: 3] → 001_scene_003.mp4
3. scene_005.mp4 [시퀀스: 5] → 002_scene_005.mp4
4. video.mp4 [시퀀스 없음] → 003_video.mp4
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

---

## 5. Frontend Regression Tests

### 5.1 개요

프론트엔드의 핵심 비즈니스 로직을 검증하는 단위 테스트:
- 파일 정렬 로직 (이미지/비디오 시퀀스 인식)
- JSON 제목 추출 및 안전한 파일명 생성

### 5.2 테스트 위치

```
trend-video-frontend/
├── __tests__/
│   ├── api/
│   │   ├── file-sorting.test.ts          # 파일 정렬 알고리즘
│   │   └── json-title-extraction.test.ts # 제목 파싱 및 검증
│   ├── test_data/                         # 테스트 데이터 (필요시)
│   └── README.md                          # 테스트 문서
├── jest.config.js                         # Jest 설정
└── jest.setup.js                          # Jest 초기화
```

### 5.3 테스트 실행

```bash
cd trend-video-frontend

# 전체 테스트 실행
npm test

# 특정 테스트만 실행
npm test file-sorting
npm test json-title-extraction

# 커버리지 리포트
npm test -- --coverage

# Watch 모드 (개발 중)
npm test -- --watch
```

### 5.4 테스트 카테고리

#### 파일 정렬 로직 (`file-sorting.test.ts`)

**이미지 정렬** (from `generate-video-upload/route.ts`):
- **시퀀스 번호 우선, 그 다음 lastModified 오래된 순**
- 시퀀스 번호 추출 패턴:
  - 숫자로 시작: `1.jpg`, `02.png`
  - 언더스코어: `image_01.jpg`
  - 대시: `scene-02.png`
  - 괄호: `Image_fx (47).jpg` (랜덤 ID 없을 때만)
- 랜덤 ID 무시: `Whisk_2ea51d84...`
- 정렬 우선순위:
  1. 시퀀스 번호 있는 파일 → 시퀀스 순으로 정렬
  2. 시퀀스 번호 없는 파일 → lastModified 순으로 정렬
  3. 시퀀스 번호 있는 파일이 항상 먼저 옴

**비디오 정렬** (from `video-merge/route.ts`):
- **시퀀스 번호 우선, 그 다음 lastModified 오래된 순**
- 3자리 시퀀스: `scene_001.mp4`, `video_002.mp4`
- 정렬 우선순위: 이미지와 동일

#### JSON 제목 추출 (`json-title-extraction.test.ts`)

**제목 추출:**
- JSON에서 `title` 필드 파싱
- 마크다운 코드 블록 처리
- 유효하지 않은 JSON 처리

**안전한 파일명:**
- Windows 금지 문자 제거: `< > : " / \ | ? *`
- 공백 트림
- 100자 제한
- 유니코드 보존 (한글, 일본어, 스페인어 등)

### 5.5 테스트 성공 기준

**각 테스트는 다음을 확인:**
1. ✅ 모든 정렬 테스트 통과 (33개 테스트)
2. ✅ 엣지 케이스 올바르게 처리
3. ✅ 정렬 동작에 리그레션 없음
4. ✅ 제목 추출 및 검증 정확
5. ✅ Windows 호환 파일명 생성

### 5.6 Frontend Regression Test 업데이트 규칙

**스테이블 버전마다:**
1. `npm test` 실행하여 모든 테스트 통과 확인
2. 파일 정렬 로직 변경 시 테스트 업데이트
3. 제목 추출/검증 로직 변경 시 테스트 업데이트
4. 새로운 시퀀스 번호 패턴 추가 시 테스트 추가
5. 크리티컬 버그 수정 시 리그레션 방지 테스트 추가

**업데이트하지 말아야 할 경우:**
- UI/스타일 변경
- 로직이 없는 코드 리팩토링
- API 엔드포인트 URL 변경 (로직 변경 없을 때)

### 5.7 테스트 데이터

- 테스트 데이터는 테스트 파일 내에 mock 객체로 임베드됨
- 단위 테스트이므로 외부 파일 불필요
- 통합 테스트 추가 시 `__tests__/test_data/`에 작은 파일 배치

### 5.8 커버리지 목표

- **파일 정렬**: 100% 커버리지 (크리티컬 비즈니스 로직)
- **제목 추출**: 100% 커버리지 (크리티컬 비즈니스 로직)
- **전체**: 로직이 많은 코드 >90% 커버리지

### 5.9 AI 모델 선택 테스트 (`aiModelSelection.test.ts`)

**위치:** `trend-video-frontend/__tests__/aiModelSelection.test.ts`

**목적:**
- ChatGPT, Gemini, Claude 모델 선택이 올바르게 전달되는지 검증
- 롱폼/숏폼/SORA2/상품 포맷과의 모든 조합 테스트 (총 12개 조합)
- 프론트엔드 → 백엔드 → Python 명령어 인자까지 전체 흐름 검증

**테스트 카테고리:**
1. API 요청 파라미터 검증 (scriptModel 전송)
2. 서버 파라미터 처리 검증 (MODEL_TO_AGENT 매핑)
3. Python 명령어 인자 검증 (`-a <agent>`)
4. UnifiedAgent 초기화 검증
5. 리그레션 방지 (과거 버그 재발 방지)
6. 통합 테스트 (비디오 포맷 + AI 모델 조합)
7. Edge Cases (undefined, 빈 문자열, 잘못된 값)

**테스트 실행:**
```bash
cd trend-video-frontend
npm test -- __tests__/aiModelSelection.test.ts
```

#### 🐛 크리티컬 버그 수정: ChatGPT 선택 무시 (2025-01-20)

**버그 증상:**
- 사용자가 UI에서 ChatGPT를 선택했는데 Claude가 실행됨
- 로그에 `-a claude`로 표시됨

**원인:**
```typescript
// ❌ 버그: 'chatgpt' 값이 매핑에 없음
const MODEL_TO_AGENT: Record<string, string> = {
  'gpt': 'chatgpt',      // 'gpt'만 매핑됨
  'gemini': 'gemini',
  'claude': 'claude'
};

// 프론트엔드에서 실제로 전송하는 값: 'chatgpt'
// 'chatgpt'가 매핑에 없어서 기본값 'claude' 사용
const agentName = scriptModel && MODEL_TO_AGENT[scriptModel]
  ? MODEL_TO_AGENT[scriptModel]
  : 'claude';  // ← 여기서 claude로 fallback
```

**해결:**
```typescript
// ✅ 수정: 'chatgpt' 매핑 추가
const MODEL_TO_AGENT: Record<string, string> = {
  'gpt': 'chatgpt',
  'chatgpt': 'chatgpt',  // 프론트엔드에서 'chatgpt'로 전송
  'gemini': 'gemini',
  'claude': 'claude'
};
```

**수정 파일:**
1. `trend-video-frontend/src/app/api/scripts/generate/route.ts` (line 242)
   - MODEL_TO_AGENT에 `'chatgpt': 'chatgpt'` 추가

2. `trend-video-frontend/__tests__/aiModelSelection.test.ts` (line 13, 59, 66)
   - 테스트 케이스 업데이트: 'gpt' → 'chatgpt'
   - MODEL_TO_AGENT 매핑에 'chatgpt' 추가

**테스트 결과:**
```bash
✓ ChatGPT 선택 시 scriptModel: "chatgpt"로 전송되어야 함
✓ 서버는 scriptModel을 올바른 agent 이름으로 매핑해야 함
✓ ChatGPT 선택 시 Python에 "-a chatgpt" 인자가 전달되어야 함
✓ [BUG FIX] ChatGPT 선택 후 대본 생성 시 Claude가 아닌 ChatGPT가 실행되어야 함

Test Suites: 1 passed, 1 total
Tests:       30 passed, 30 total
```

**학습 포인트:**
- 프론트엔드와 백엔드 간 값 매핑이 일치하는지 항상 확인
- Fallback 기본값은 버그를 숨길 수 있으므로 주의
- 모든 가능한 입력값을 매핑 테이블에 명시적으로 포함

---

## 6. Backend Regression Tests

**테스트 실패 시:**
- 코드를 수정하거나
- 의도된 변경이면 테스트를 업데이트

---

## 5. 프론트엔드-백엔드 아키텍처

### 🎯 핵심 구조

**프로젝트 구성:**
```
workspace/
├── trend-video-frontend/  (Next.js - TypeScript)
│   ├── src/app/api/       ← Next.js API Routes (프론트엔드 서버)
│   └── src/app/           ← React 컴포넌트
└── trend-video-backend/   (Python)
    ├── src/
    │   ├── video_generator/
    │   ├── sora/
    │   └── ai_aggregator/
    └── video_merge.py
```

### 5.1 호출 구조

**Frontend → Backend 호출 흐름:**

```
사용자 브라우저
    ↓ (HTTP Request)
Next.js API Route (trend-video-frontend/src/app/api/)
    ↓ (spawn/exec)
Python Script (trend-video-backend/src/)
    ↓ (프로세스 실행)
결과 파일 생성
    ↓ (폴링으로 상태 확인)
Next.js API Route → 사용자 브라우저
```

**예시:**

1. **대본 생성 요청**
   ```typescript
   // Frontend: /api/scripts/generate/route.ts
   const pythonScript = path.join(
     process.cwd(),
     '../trend-video-backend/run_ai_aggregator.py'
   );

   const process = spawn('python', [
     pythonScript,
     '--output', outputPath,
     '--topic', topic
   ]);
   ```

2. **비디오 병합 요청**
   ```typescript
   // Frontend: /api/video-merge/route.ts
   const pythonScript = path.join(
     process.cwd(),
     '../trend-video-backend/video_merge.py'
   );

   const process = spawn('python', [
     pythonScript,
     '--mode', 'merge',
     '--input', inputDir
   ]);
   ```

### 5.2 프로세스 관리

**PID 저장 및 추적:**

```typescript
// Frontend: 프로세스 시작 시 PID 저장
const pythonProcess = spawn('python', [scriptPath, ...args]);

db.prepare(`
  UPDATE scripts_temp
  SET pid = ?
  WHERE id = ?
`).run(pythonProcess.pid, taskId);
```

**프로세스 취소:**

```typescript
// Frontend: /api/scripts/cancel/route.ts
// 1. DB에서 PID 조회
const row = db.prepare('SELECT pid FROM scripts_temp WHERE id = ?').get(taskId);

// 2. 프로세스 트리 전체 종료
if (process.platform === 'win32') {
  // Windows: taskkill로 프로세스 트리 종료
  await execAsync(`taskkill /F /T /PID ${pid}`);

  // 3. 좀비 프로세스 방지 - ShimGen, Python 정리
  await execAsync('taskkill /F /IM ShimGen.exe 2>nul');
  await execAsync('taskkill /F /FI "IMAGENAME eq python.exe" /FI "WINDOWTITLE eq *claude*" 2>nul');
} else {
  // Unix: kill 명령 사용
  await execAsync(`kill -9 ${pid}`);
}

// 4. DB 상태 업데이트
db.prepare(`
  UPDATE scripts_temp
  SET status = 'ERROR', message = '사용자에 의해 중지됨', pid = NULL
  WHERE id = ?
`).run(taskId);
```

### 5.3 좀비 프로세스 방지

**문제:**
- Python 스크립트가 중지되어도 ShimGen.exe나 자식 프로세스가 살아있는 경우
- `taskkill /F /T /PID`만으로는 모든 프로세스를 정리하지 못함

**해결:**
```typescript
// 1. 메인 PID 종료
await execAsync(`taskkill /F /T /PID ${pid}`);

// 2. 이미지 이름으로 남은 프로세스 정리
try {
  await execAsync('taskkill /F /IM ShimGen.exe 2>nul');
} catch {
  // ShimGen이 없으면 무시
}

try {
  await execAsync('taskkill /F /FI "IMAGENAME eq python.exe" /FI "WINDOWTITLE eq *claude*" 2>nul');
} catch {
  // 해당 프로세스가 없으면 무시
}
```

**중요 플래그:**
- `/F`: 강제 종료 (Force)
- `/T`: 프로세스 트리 전체 종료 (Tree)
- `/IM`: 이미지 이름으로 종료 (Image Name)
- `/FI`: 필터 조건 (Filter)
- `2>nul`: 에러 메시지 억제 (프로세스가 없을 때)

### 5.4 데이터 전달

**Frontend → Backend:**

1. **파일 시스템 경로**
   ```typescript
   // Frontend가 파일을 저장하고 경로를 Python에 전달
   const inputDir = path.join(process.cwd(), 'output', jobId, 'videos');
   const configPath = path.join(inputDir, 'config.json');

   spawn('python', [
     scriptPath,
     '--input', inputDir,
     '--config', configPath
   ]);
   ```

2. **설정 JSON 파일**
   ```typescript
   // config.json 생성
   const config = {
     mode: 'longform',
     add_subtitles: true,
     transitions: true,
     narration_text: 'Hello...'
   };

   await fs.writeFile(configPath, JSON.stringify(config, null, 2));
   ```

**Backend → Frontend:**

1. **파일 생성**
   ```python
   # Python이 결과 파일 생성
   output_path = output_dir / 'final_video.mp4'
   # ... 비디오 처리 ...
   ```

2. **상태 파일 업데이트**
   ```python
   # status.json 업데이트
   status = {
       'status': 'completed',
       'output_file': str(output_path),
       'duration': video_duration
   }
   with open(output_dir / 'status.json', 'w') as f:
       json.dump(status, f)
   ```

3. **Frontend 폴링**
   ```typescript
   // Frontend가 status.json 폴링
   const interval = setInterval(async () => {
     const statusPath = path.join(outputDir, 'status.json');
     if (await fs.pathExists(statusPath)) {
       const status = await fs.readJSON(statusPath);
       if (status.status === 'completed') {
         clearInterval(interval);
         // 완료 처리
       }
     }
   }, 2000);
   ```

### 5.5 에러 처리

**Python 스크립트 에러:**

```typescript
// Frontend: 프로세스 에러 캡처
pythonProcess.stderr.on('data', (data) => {
  const errorMsg = data.toString();
  console.error('Python 에러:', errorMsg);

  // DB에 에러 저장
  db.prepare(`
    UPDATE scripts_temp
    SET status = 'ERROR', message = ?
    WHERE id = ?
  `).run(errorMsg, taskId);
});

pythonProcess.on('exit', (code) => {
  if (code !== 0) {
    console.error(`프로세스 종료 (코드: ${code})`);
  }
});
```

---

## 6. 인증 구현

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

### 🎯 핵심 원칙

**디버깅 로그는 개발 완료 후 반드시 제거하거나 주석 처리**

### 4.1 로그 사용 규칙

**원칙:**
- 개발 중: 디버깅에 필요한 로그 사용 가능
- **개발 완료 후: 디버깅 로그는 반드시 제거 또는 주석 처리** ⭐️
- 프로덕션: 에러와 중요 이벤트만
- 폴링 로그는 주석 처리
- 데이터 조회 성공 로그는 제거

**로그 레벨:**
- ✅ **에러 발생** (항상 유지)
- ✅ **중요한 상태 변경** (세션 만료, 크레딧 차감, 결제 완료 등)
- ✅ **인증 이벤트** (로그인 성공/실패, 로그아웃)
- ❌ **일반적인 데이터 조회** (목록 가져오기, 상태 확인)
- ❌ **API 요청 시작/완료** (응답 상태, 데이터 내용)
- ❌ **세션 검증** (폴링 시 스팸)
- ❌ **useEffect 실행 로그**
- ❌ **렌더링 확인 로그**

### 4.2 개발 중 디버깅 로그

**나쁜 예시 (제거해야 함):**
```typescript
// ❌ 이런 로그는 개발 완료 후 제거!
export default function MyContentPage() {
  useEffect(() => {
    const loadScripts = async () => {
      console.log('📥 대본 목록 가져오기 시작...'); // ❌ 제거
      const res = await fetch('/api/scripts');
      console.log('응답 상태:', res.status, res.statusText); // ❌ 제거
      const data = await res.json();
      console.log('응답 데이터:', data); // ❌ 제거
      setScripts(data.scripts);
      console.log('✅ 대본 설정:', data.scripts.length, '개'); // ❌ 제거
    };
    loadScripts();
  }, []);
}
```

**좋은 예시 (에러만 로그):**
```typescript
// ✅ 에러만 로그
export default function MyContentPage() {
  useEffect(() => {
    const loadScripts = async () => {
      try {
        const res = await fetch('/api/scripts');
        const data = await res.json();
        setScripts(data.scripts);
      } catch (error) {
        console.error('대본 목록 로드 실패:', error); // ✅ 에러는 로그
      }
    };
    loadScripts();
  }, []);
}
```

### 4.3 세션 검증 로그

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
    console.log('⏰ 세션 만료됨'); // ✅ 중요 이벤트는 로그
    sessions.delete(sessionId);
    await writeSessions(sessions);
    return null;
  }

  // console.log('✅ 세션 유효:', session.email);
  return { userId: session.userId, email: session.email, isAdmin: session.isAdmin };
}
```

### 4.4 체크리스트

코드 푸시 전 확인사항:
- [ ] 디버깅용 `console.log` 제거 또는 주석 처리
- [ ] 데이터 조회 성공 로그 제거
- [ ] API 요청/응답 로그 제거
- [ ] useEffect 실행 확인 로그 제거
- [ ] 에러 로그만 남김 (`console.error`)
- [ ] 중요 이벤트 로그만 남김

### 4.5 최근 수정 사항 (2025-01-20)

**제거된 로그:**
- `[fetchScripts] 응답` (page.tsx:467) - 데이터 조회 성공 로그
- `[전체 탭 더보기]` (page.tsx:2020) - 렌더링 확인 로그 (무한 반복)
- `✅ JSON 파싱 성공` (page.tsx:1220) - 성공 로그
- `⚠️ JSON 파싱 실패` (page.tsx:1222) - 디버깅 로그
- `✅ {"title" 패턴 발견` (page.tsx:1233) - 디버깅 로그
- `✅ JSON 자동 수정 성공` (page.tsx:1278) - 성공 로그

**유지된 로그:**
- `JSON 자동 수정 실패` (console.error) - 에러 로그
- `로컬 JSON 포맷팅 실패` (console.error) - 에러 로그
- `포멧팅 실패` (console.error) - 에러 로그

### 4.6 JSON 파싱 개선 (2025-01-20)

**문제:**
- 상품 대본의 `sora_prompt` 필드에 중첩된 따옴표가 많아 파싱 실패
  - 예: `"a cozy, beige knit sweater"`, `"Pepero Almond"` 등
- `position 1057/1089` 근처에서 "Expected ',' or '}'" 에러 발생
- 기존 로직이 긴 필드(`sora_prompt`)를 처리하지 못함

**원인:**
```typescript
// ❌ json-utils.ts (line 205): sora_prompt가 빠져있음!
const otherLongFields = ['image_prompt', 'description', 'text', 'visual_description', 'prompt', 'audio_description'];
```

**해결:**

1. **백엔드 (json-utils.ts)**
```typescript
// ✅ sora_prompt 추가
const otherLongFields = [
  'image_prompt', 'description', 'text',
  'visual_description', 'prompt', 'audio_description',
  'sora_prompt'  // ← 추가!
];

// 이미 이스케이프된 따옴표는 유지, 이스케이프 안 된 것만 처리
fixed = fixed.replace(regex, (match, value) => {
  let fixedValue = '';
  for (let i = 0; i < value.length; i++) {
    if (value[i] === '\\' && i + 1 < value.length) {
      fixedValue += value[i] + value[i + 1];  // 이미 이스케이프된 것 유지
      i++;
    } else if (value[i] === '"') {
      fixedValue += '\\"';  // 이스케이프 안 된 것만 처리
    } else {
      fixedValue += value[i];
    }
  }
  return `"${field}": "${fixedValue}",`;
});
```

2. **프론트엔드 (page.tsx)**
```typescript
// ✅ 백엔드와 동일한 로직 적용
const longFields = [
  'image_prompt', 'description', 'text',
  'visual_description', 'prompt', 'audio_description',
  'sora_prompt'  // ← 추가!
];

// 백엔드와 동일한 문자별 이스케이프 로직 사용
```

**위치:**
- `trend-video-frontend/src/lib/json-utils.ts` (lines 205, 229)
- `trend-video-frontend/src/app/my-content/page.tsx` (lines 1249-1287)

**효과:**
- ✅ 상품 대본을 포함한 모든 대본 형식의 JSON 파싱 성공률 향상
- ✅ 중첩 따옴표가 많은 `sora_prompt` 필드도 정상 처리
- ✅ 이미 이스케이프된 따옴표는 유지 (중복 이스케이프 방지)
- ✅ 새로운 긴 필드 추가 시 배열에만 추가하면 됨

### 4.7 Python Job 무한 로그 버그 수정 (2025-01-20)

**문제:**
- 브라우저가 닫혔는데도 Python 프로세스가 계속 실행되며 무한히 에러 로그 출력
- "Target page, context or browser has been closed" 에러가 반복됨
- FOREIGN KEY constraint failed 에러 발생

**증상:**
```
[Python] [Claude] Query error (continuing): Page.query_selector: Target page, context or browser has been closed
Failed to add log: SqliteError: FOREIGN KEY constraint failed
    at addContentLog (src\lib\content.ts:331:8)
```

**원인 1: Python agent 에러 핸들링 문제**
```python
# ❌ 버그: 브라우저가 닫혀도 계속 진행
except Exception as e:
    error_str = str(e)
    if self.config.get('handle_navigation_errors'):
        if "Execution context was destroyed" in error_str:
            # ...
        else:
            print(f"[{self.get_name()}] Query error (continuing): {error_str}")
            # ← 치명적 에러를 무시하고 계속 실행!
```

**원인 2: FOREIGN KEY 에러**
- taskId가 DB에서 삭제되었는데도 로그를 계속 추가하려고 시도
- `content_logs` 테이블의 FOREIGN KEY constraint 위반

**해결책:**

1. **Python agent 즉시 종료** (`trend-video-backend/src/ai_aggregator/agents/agent.py`)
```python
# ✅ 수정: 치명적 에러 감지 시 즉시 종료
consecutive_errors = 0  # 카운터 초기화

while waited < max_wait:
    try:
        # ... query logic ...
    except Exception as e:
        error_str = str(e)

        # 브라우저/페이지가 닫힌 치명적 에러 - 즉시 종료
        if "closed" in error_str.lower() or "Target page" in error_str:
            print(f"[{self.get_name()}] ❌ Fatal error: Browser or page closed")
            print(f"[{self.get_name()}] Error: {error_str}")
            raise Exception(f"Browser/page closed: {error_str}")

        # 연속 에러 카운트 증가
        consecutive_errors += 1
        if consecutive_errors > 10:
            print(f"[{self.get_name()}] ❌ Too many consecutive errors ({consecutive_errors}), aborting")
            raise Exception(f"Too many consecutive errors: {error_str}")

        # 네비게이션 에러는 재시도
        if "Execution context was destroyed" in error_str:
            await asyncio.sleep(3)
            continue

    # 에러 없으면 연속 에러 카운트 리셋
    consecutive_errors = 0
```

2. **FOREIGN KEY 에러 방지** (`trend-video-frontend/src/lib/content.ts`)
```typescript
// ✅ 수정: contentId 존재 여부 확인 후 로그 추가
export function addContentLog(contentId: string, logMessage: string): void {
  // contentId가 존재하는지 먼저 확인
  const checkStmt = db.prepare('SELECT id FROM contents WHERE id = ?');
  const exists = checkStmt.get(contentId);

  if (!exists) {
    // contentId가 없으면 로그를 추가하지 않음 (FOREIGN KEY 에러 방지)
    console.warn(`[addContentLog] Content ${contentId} does not exist, skipping log`);
    return;
  }

  // 로그 추가
  const stmt = db.prepare(`
    INSERT INTO content_logs (content_id, log_message)
    VALUES (?, ?)
  `);
  stmt.run(contentId, logMessage);
}
```

**수정 파일:**
1. `trend-video-backend/src/ai_aggregator/agents/agent.py` (lines 366, 426-454)
   - 연속 에러 카운터 추가
   - "closed" 에러 감지 시 즉시 raise
   - 연속 10회 이상 에러 시 자동 종료

2. `trend-video-frontend/src/lib/content.ts` (lines 326-342, 344-367)
   - `addContentLog`: contentId 존재 여부 확인
   - `addContentLogs`: contentId 존재 여부 확인

**효과:**
- ✅ 브라우저 닫힌 후 Python 프로세스 즉시 종료
- ✅ 무한 에러 로그 스팸 방지
- ✅ FOREIGN KEY constraint 에러 방지
- ✅ 연속 에러 발생 시 자동 종료 (무한 루프 방지)

**학습 포인트:**
- 치명적 에러(브라우저/페이지 닫힘)는 반드시 즉시 raise해야 함
- 에러를 무시하고 계속 진행하면 무한 루프에 빠질 수 있음
- FOREIGN KEY constraint는 참조 무결성을 보장하므로, 참조되는 레코드가 존재하는지 먼저 확인
- 연속 에러 카운터로 비정상 상태를 감지하고 자동 종료

### 4.8 JSON 파싱 에러: HTML 에러 페이지 (2025-01-20)

**문제:**
```
SyntaxError: Unexpected token '<', "<!DOCTYPE "... is not valid JSON
```

**원인:**
API가 에러(404, 500 등)를 반환할 때 HTML 에러 페이지를 반환하는데, 이것을 JSON으로 파싱하려고 시도:

```typescript
// ❌ 버그: response.ok를 확인하기 전에 .json() 호출
const response = await fetch('/api/my-scripts');
const data = await response.json();  // ← HTML이면 파싱 실패!

if (response.ok) {
  // ...
}
```

**해결책:**

1. **공통 헬퍼 함수 생성** (`trend-video-frontend/src/lib/fetch-utils.ts`)
```typescript
/**
 * API 응답을 안전하게 JSON으로 파싱
 * HTML 에러 페이지를 JSON으로 파싱하려고 시도하는 것을 방지
 */
export async function safeJsonResponse<T = any>(response: Response): Promise<T> {
  // Content-Type 확인
  const contentType = response.headers.get('content-type');

  // JSON이 아닌 경우 (HTML 에러 페이지 등)
  if (!contentType || !contentType.includes('application/json')) {
    const text = await response.text();

    if (!response.ok) {
      throw new Error(`API Error (${response.status}): ${text.substring(0, 200)}`);
    }

    throw new Error(`Expected JSON response but got: ${contentType}`);
  }

  // JSON 파싱
  const data = await response.json();

  // 에러 응답이면 에러 던지기
  if (!response.ok) {
    const errorMessage = data.error || data.message || `API Error: ${response.status}`;
    throw new Error(errorMessage);
  }

  return data;
}
```

2. **사용 예시** (수정 후)
```typescript
// ✅ 안전한 JSON 파싱
import { safeJsonResponse } from '@/lib/fetch-utils';

const response = await fetch('/api/my-scripts');
const data = await safeJsonResponse(response);  // ← 자동으로 상태 확인 + JSON 파싱

// response.ok는 이미 safeJsonResponse 내부에서 확인됨
```

**수정 파일:**
1. `trend-video-frontend/src/lib/fetch-utils.ts` (신규 생성)
   - `safeJsonResponse()`: 안전한 JSON 파싱 헬퍼
   - `fetchJson()`: fetch + safeJsonResponse 래퍼

2. `trend-video-frontend/src/app/my-content/page.tsx`
   - `fetchScripts()`: line 466
   - `fetchVideos()`: line 653
   - `fetchPublishedVideos()`: line 709
   - `checkAuth()`: line 429

**효과:**
- ✅ HTML 에러 페이지 파싱 시도 방지
- ✅ 명확한 에러 메시지 제공
- ✅ Content-Type 검증으로 안전성 향상
- ✅ 코드 중복 제거 (공통 헬퍼 사용)

**모범 사례:**
```typescript
// ❌ 나쁜 예
const response = await fetch('/api/endpoint');
const data = await response.json();  // 에러 시 파싱 실패
if (response.ok) { /* ... */ }

// ✅ 좋은 예 (방법 1: 헬퍼 사용)
const response = await fetch('/api/endpoint');
const data = await safeJsonResponse(response);

// ✅ 좋은 예 (방법 2: 수동 검증)
const response = await fetch('/api/endpoint');
if (!response.ok) {
  throw new Error(`API Error: ${response.status}`);
}
const data = await response.json();
```

**학습 포인트:**
- 항상 `response.ok`를 확인한 후 `.json()` 호출
- Content-Type 헤더를 확인하여 JSON 응답인지 검증
- 공통 에러 처리 로직은 헬퍼 함수로 분리
- try-catch로 네트워크 에러와 파싱 에러를 모두 처리

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

## 10. UI/UX 일관성 규칙

### 🎯 핵심 원칙

**같은 데이터를 표시하는 모든 탭/섹션은 동일한 UX를 유지해야 함**

### 10.1 탭 구조 일관성

**위치:** `trend-video-frontend/src/app/my-content/page.tsx`

**규칙:**
- ✅ 전체 탭과 개별 탭(영상, 대본)은 같은 레이아웃 사용
- ✅ 카드 스타일, 버튼 위치, 썸네일 크기 동일
- ✅ 호버 효과, 트랜지션 일관성 유지

**레이아웃 패턴:**
```typescript
// 수평 리스트 레이아웃 (영상/대본 공통)
<div className="flex flex-col md:flex-row gap-4 p-4">
  {/* 왼쪽: 썸네일 또는 아이콘 */}
  <div className="relative w-full md:w-64 h-36 flex-shrink-0 bg-slate-800/50 rounded-lg overflow-hidden">
    {/* 영상: 썸네일 이미지 */}
    {/* 대본: 📝 아이콘 */}
  </div>

  {/* 중앙: 메타데이터 */}
  <div className="flex-1 min-w-0 flex flex-col justify-between">
    <div>
      <h3 className="text-lg font-semibold text-white mb-2 break-words line-clamp-2">
        {title}
      </h3>
      {/* 날짜, 상태 등 */}
    </div>

    {/* 하단: 버튼 */}
    <div className="flex flex-wrap gap-2 mt-4">
      {/* 액션 버튼들 */}
    </div>
  </div>
</div>
```

### 10.2 썸네일 표시 규칙

**영상 카드:**
- ✅ 썸네일 크기: `w-full md:w-64 h-36`
- ✅ 이미지 핏: `object-cover` (공간에 꽉 차게)
- ✅ 다운로드 메타포: 호버 시 다운로드 아이콘 오버레이
- ✅ 상태 표시: 진행중/완료/에러 오버레이

**대본 카드:**
- ✅ 썸네일 없음 → 대신 📝 이모지 아이콘 사용
- ✅ 크기는 영상과 동일: `w-full md:w-64 h-36`
- ✅ 배경: `bg-slate-800/50`
- ✅ 타입/상태 배지 표시

### 10.3 버튼 구조 규칙 ⭐️ **중요**

> ⚠️ **2025-01-20 업데이트: 탭별 버튼 구조 표준화**
>
> **이 규칙을 절대 위반하지 마세요!** 버튼 구조가 계속 망가지는 것을 방지하기 위해 regression test와 함께 관리됩니다.

**위치:** `trend-video-frontend/src/app/my-content/page.tsx`
**테스트:** `trend-video-frontend/src/__tests__/myContentButtons.test.ts` (28 tests)

#### 🎯 핵심 원칙

1. **전체 탭 = 개별 탭**: 전체 탭의 영상 카드는 영상 탭과 동일, 전체 탭의 대본 카드는 대본 탭과 동일
2. **대본 탭이 기준**: 대본 탭이 가장 많은 버튼(12개)을 가지며 표준
3. **순서 엄수**: 버튼 순서는 액션 → 관리 → 위험 버튼 순
4. **삭제는 항상 마지막**: 모든 탭에서 삭제 버튼은 마지막 위치

#### 📊 탭별 버튼 개수

- **영상 카드** (전체 탭 = 영상 탭): **9개 버튼**
- **대본 카드** (전체 탭 = 대본 탭): **12개 버튼** ← 가장 많음 (기준)

#### 🎬 영상 카드 버튼 구조 (9개)

**순서:** 업로드 → 액션 → 관리 → 위험

```typescript
// ✅ 전체 탭 영상 = 영상 탭 (완벽히 동일해야 함)
<>
  {/* 1. YouTube 업로드 (첫 번째) */}
  <YouTubeUploadButton {...props} />

  {/* 2. 읽어보기 (sourceContentId 있을 때만) */}
  {item.data.sourceContentId && (
    <button onClick={handleOpenSource}>📖 읽어보기</button>
  )}

  {/* 3. 폴더 (admin 권한만) */}
  {isAdmin && (
    <button onClick={handleOpenFolder}>📁 폴더</button>
  )}

  {/* 4. 로그 */}
  <button onClick={handleOpenLog}>📋 로그</button>

  {/* 5. 이미지크롤링 */}
  <button onClick={handleImageCrawling}>🎨 이미지크롤링</button>

  {/* 6. 저장 (이미지크롤링 다음에 위치) */}
  <button onClick={handleDownload}>📥 저장</button>

  {/* 7. 쇼츠 (longform 타입만) */}
  {item.data.type === 'longform' && (
    <button onClick={handleConvertToShorts}>⚡ 쇼츠</button>
  )}

  {/* 8. 재시도 */}
  <button onClick={handleRestart}>🔄 재시도</button>

  {/* 9. 삭제 (항상 마지막) */}
  <button onClick={handleDelete}>🗑️ 삭제</button>
</>
```

#### 📝 대본 카드 버튼 구조 (12개)

**순서:** 액션 → 관리 → 위험

```typescript
// ✅ 전체 탭 대본 = 대본 탭 (완벽히 동일해야 함)
<>
  {/* 1. 대본 (첫 번째) */}
  <button onClick={toggleContent}>📖 대본</button>

  {/* 2. 읽어보기 (두 번째) */}
  <button onClick={handleOpenSource}>📖 읽어보기</button>

  {/* 3. 이미지크롤링 (세 번째) */}
  <button onClick={handleImageCrawling}>🎨 이미지크롤링</button>

  {/* 4. 영상 (네 번째) */}
  <button onClick={handleMakeVideo}>🎬 영상</button>

  {/* 5. 포멧팅 */}
  <button onClick={handleFormatting}>✨ 포멧팅</button>

  {/* 6. 복사 */}
  <button onClick={handleCopy}>📋 복사</button>

  {/* 7. 로그 */}
  <button onClick={handleOpenLog}>📋 로그</button>

  {/* 8. 저장 */}
  <button onClick={handleDownload}>📥 저장</button>

  {/* 9. 변환 (longform/shortform 타입만) */}
  {(item.data.type === 'longform' || item.data.type === 'shortform') && (
    <button onClick={handleConvert}>🔀 변환</button>
  )}

  {/* 10. 상품정보 (product 타입만) */}
  {item.data.type === 'product' && (
    <button onClick={handleProductInfo}>🛍️ 상품정보</button>
  )}

  {/* 11. 재시도 */}
  <button onClick={handleRestart}>🔄 재시도</button>

  {/* 12. 삭제 (항상 마지막) */}
  <button onClick={handleDelete}>🗑️ 삭제</button>
</>
```

#### 🔍 조건부 버튼 규칙

| 버튼 | 표시 조건 | 카드 타입 |
|------|----------|-----------|
| 읽어보기 (영상) | `sourceContentId` 존재 시 | 영상 |
| 폴더 | `isAdmin === true` | 영상 |
| 쇼츠 | `type === 'longform'` | 영상 |
| 변환 | `type === 'longform' \|\| type === 'shortform'` | 대본 |
| 상품정보 | `type === 'product'` | 대본 |

#### ✅ 필수 검증 체크리스트

버튼 수정 시 반드시 확인:

- [ ] **전체 탭 영상 = 영상 탭** 버튼 구성 동일한가?
- [ ] **전체 탭 대본 = 대본 탭** 버튼 구성 동일한가?
- [ ] 영상 카드는 **정확히 9개** 버튼인가? (조건부 제외)
- [ ] 대본 카드는 **정확히 12개** 버튼인가? (조건부 제외)
- [ ] YouTube 업로드가 영상 카드 **첫 번째**인가?
- [ ] 대본 버튼이 대본 카드 **첫 번째**인가?
- [ ] 삭제 버튼이 **모든 카드에서 마지막**인가?
- [ ] 이미지크롤링 버튼이 **모든 카드에 포함**되었는가?
- [ ] 저장 버튼이 **이미지크롤링 다음**에 위치하는가? (영상)
- [ ] 조건부 버튼 로직이 **정확히 적용**되었는가?

#### 🧪 Regression Test 실행

```bash
cd trend-video-frontend && npm test -- myContentButtons.test.ts
```

**테스트 커버리지:**
- 버튼 개수 검증 (4 tests)
- 버튼 순서 검증 (2 tests)
- 필수 버튼 존재 검증 (10 tests)
- 조건부 버튼 검증 (5 tests)
- 버튼 그룹 순서 검증 (2 tests)
- 통합 일관성 검증 (5 tests)

**Total: 28 tests** - 모두 통과해야 배포 가능

#### 🎨 버튼 패딩 규칙 ⭐️ **중요**

> ⚠️ **2025-01-20 추가: 버튼 패딩 표준화**
>
> **모든 탭의 모든 버튼은 동일한 패딩을 사용해야 합니다!** 패딩 불일치는 시각적 레이아웃 차이를 발생시킵니다.

**규칙:**

```typescript
// ✅ 올바른 패딩: px-3 py-1.5 (모든 버튼 공통)
<button className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-blue-500 cursor-pointer whitespace-nowrap">
  📁 폴더
</button>

// ❌ 잘못된 패딩: px-4 py-2 (사용 금지)
<button className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white ...">
  📁 폴더
</button>
```

**패딩 규칙 체크리스트:**

- [ ] 모든 탭(전체/영상/대본)의 모든 버튼이 **px-3 py-1.5** 패딩 사용
- [ ] **px-4 py-2** 같은 다른 패딩 사용 금지
- [ ] 모든 버튼에 **whitespace-nowrap** 클래스 추가
- [ ] YouTube 업로드 컴포넌트도 동일한 패딩 사용

**왜 중요한가?**

```
패딩 차이로 인한 문제:

전체 탭 (px-4 py-2):
[읽어보기] [폴더] [로그] [이미지크롤링]
[저장] [쇼츠] [재시도] [삭제]  ← 2줄로 래핑

영상 탭 (px-3 py-1.5):
[읽어보기] [폴더] [로그] [이미지크롤링] [저장] [쇼츠] [재시도] [삭제]  ← 1줄 유지

→ 동일한 버튼이지만 시각적으로 다르게 보임!
```

**Regression Test:**

버튼 패딩 일관성 테스트가 추가되었습니다 (6 tests):

```bash
cd trend-video-frontend && npm test -- myContentButtons.test.ts
```

테스트는 다음을 검증합니다:
- 전체 탭 영상 카드 패딩 일관성
- 전체 탭 대본 카드 패딩 일관성
- 영상 탭 패딩 일관성
- 대본 탭 패딩 일관성
- px-4 py-2 사용 금지
- whitespace-nowrap 클래스 권장

**Total: 34 tests** (28 기존 + 6 패딩) - 모두 통과해야 배포 가능

#### ❌ 절대 하지 말아야 할 것

1. **탭마다 다른 버튼 구성**
   ```typescript
   // ❌ 전체 탭: 8개 버튼
   // ❌ 영상 탭: 9개 버튼
   // ✅ 전체 탭 = 영상 탭: 동일해야 함
   ```

2. **버튼 순서 임의 변경**
   ```typescript
   // ❌ 삭제 버튼을 중간에 배치
   // ✅ 삭제는 항상 마지막
   ```

3. **이미지크롤링 누락**
   ```typescript
   // ❌ 일부 탭에만 이미지크롤링 있음
   // ✅ 모든 탭 모든 카드에 이미지크롤링 필수
   ```

4. **조건부 버튼 로직 누락**
   ```typescript
   // ❌ 쇼츠 버튼이 모든 영상에 표시
   // ✅ longform 타입만 표시
   ```

5. **Regression Test 없이 수정**
   ```typescript
   // ❌ 버튼 추가/삭제 후 테스트 업데이트 안 함
   // ✅ 버튼 구조 변경 시 myContentButtons.test.ts도 함께 수정
   ```

6. **버튼 패딩 불일치 (NEW)**
   ```typescript
   // ❌ 전체 탭: px-4 py-2
   // ❌ 영상 탭: px-3 py-1.5
   // ✅ 모든 탭: px-3 py-1.5 (동일해야 함)

   // ❌ whitespace-nowrap 누락 (텍스트 래핑 발생)
   // ✅ 모든 버튼에 whitespace-nowrap 추가
   ```

### 10.4 모달 z-index 규칙

**모든 모달은 최상위 레이어에 표시:**
```typescript
// YouTube 업로드 모달
<div className="fixed inset-0 bg-black/50 flex items-start justify-center z-[99999] p-4 pt-16 overflow-y-auto">
```

**z-index 레벨:**
- `z-50`: 일반 드롭다운, 툴팁
- `z-[9999]`: 중요한 오버레이
- `z-[99999]`: 최상위 모달 (다른 모든 요소 위)

### 10.5 체크리스트

UI 수정 시 확인사항:

- [ ] 전체 탭과 개별 탭의 레이아웃 동일한가?
- [ ] 버튼 구성이 모든 탭에서 일관되는가?
- [ ] 썸네일 크기와 핏이 통일되었는가?
- [ ] 대본은 썸네일 없이 아이콘으로 표시되는가?
- [ ] 호버 효과가 모든 카드에 동일하게 적용되는가?
- [ ] 모달이 다른 요소에 가려지지 않는가?
- [ ] 반응형 레이아웃이 올바르게 작동하는가?

### 10.6 안티패턴

**❌ 하지 말아야 할 것:**

1. **탭마다 다른 레이아웃**
   ```typescript
   // ❌ 전체 탭: 수평 레이아웃
   // ❌ 영상 탭: 수직 레이아웃
   // → 모든 탭 동일해야 함
   ```

2. **버튼 위치 불일치**
   ```typescript
   // ❌ 전체 탭: 버튼이 오른쪽
   // ❌ 영상 탭: 버튼이 하단
   // → 모든 탭에서 하단 통일
   ```

3. **썸네일 크기 불일치**
   ```typescript
   // ❌ aspect-video (16:9 강제)
   // ✅ h-36 (고정 높이, object-cover)
   ```

4. **기능 누락**
   ```typescript
   // ❌ 영상 탭에만 YouTube 버튼 있음
   // ✅ 전체 탭에도 YouTube 버튼 있어야 함
   ```

---

## 11. API 에러 처리 규칙

### 🎯 핵심 원칙

**HTTP 404는 엔드포인트가 존재하지 않을 때만 사용. 데이터가 없는 경우는 커스텀 에러 코드와 함께 400 또는 500 반환**

### 11.1 HTTP 상태 코드 사용 규칙

**문제점:**
- API 엔드포인트가 없을 때: `404 Not Found`
- 데이터를 찾을 수 없을 때도: `404 Not Found`
- → 두 경우를 구분할 수 없어 디버깅이 어려움

**해결 방법:**

#### ✅ 올바른 사용

```typescript
// API 라우트: /api/convert-format/route.ts

export async function POST(request: NextRequest) {
  try {
    // 1. 인증 실패 → 401 Unauthorized
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json(
        {
          error: '로그인이 필요합니다.',
          errorCode: 'AUTH_REQUIRED'
        },
        { status: 401 }
      );
    }

    // 2. 잘못된 요청 파라미터 → 400 Bad Request
    const { scriptId, targetFormat } = await request.json();
    if (!scriptId || !targetFormat) {
      return NextResponse.json(
        {
          error: 'scriptId와 targetFormat이 필요합니다.',
          errorCode: 'INVALID_PARAMETERS'
        },
        { status: 400 }
      );
    }

    // 3. 데이터를 찾을 수 없음 → 400 Bad Request + 커스텀 에러 코드
    const originalScript = await findScriptById(scriptId);
    if (!originalScript) {
      return NextResponse.json(
        {
          error: '대본을 찾을 수 없습니다. 대본 생성이 완료되지 않았을 수 있습니다.',
          errorCode: 'SCRIPT_NOT_FOUND',  // 커스텀 에러 코드
          scriptId: scriptId
        },
        { status: 400 }  // 404가 아닌 400
      );
    }

    // 4. 권한 없음 → 403 Forbidden
    if (originalScript.userId !== user.userId) {
      return NextResponse.json(
        {
          error: '이 대본에 접근할 권한이 없습니다.',
          errorCode: 'FORBIDDEN'
        },
        { status: 403 }
      );
    }

    // 5. 지원하지 않는 변환 → 400 Bad Request
    const validConversions = ['longform-to-shortform', 'longform-to-sora2'];
    if (!validConversions.includes(`${sourceType}-to-${targetFormat}`)) {
      return NextResponse.json(
        {
          error: `지원하지 않는 변환: ${sourceType} → ${targetFormat}`,
          errorCode: 'UNSUPPORTED_CONVERSION'
        },
        { status: 400 }
      );
    }

    // 성공
    return NextResponse.json({ success: true, data: result });

  } catch (error: any) {
    // 6. 서버 내부 에러 → 500 Internal Server Error
    console.error('❌ API 에러:', error);
    return NextResponse.json(
      {
        error: error?.message || '서버 에러가 발생했습니다.',
        errorCode: 'INTERNAL_SERVER_ERROR',
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined
      },
      { status: 500 }
    );
  }
}
```

#### ❌ 잘못된 사용

```typescript
// ❌ 나쁜 예: 데이터 없음에 404 사용
if (!originalScript) {
  return NextResponse.json(
    { error: '대본을 찾을 수 없습니다.' },
    { status: 404 }  // ❌ 엔드포인트가 없는 것처럼 보임
  );
}

// ❌ 나쁜 예: 에러 코드 없음
return NextResponse.json(
  { error: '대본을 찾을 수 없습니다.' },
  { status: 400 }  // ✅ 상태 코드는 맞지만 errorCode가 없어서 구체적인 원인 파악 어려움
);
```

### 11.2 커스텀 에러 코드 규칙

**네이밍 컨벤션:**
- `SNAKE_CASE` 사용
- 명확하고 구체적으로 작성
- 프론트엔드에서 조건 분기 가능하도록

**예시:**

```typescript
// 인증/권한
'AUTH_REQUIRED'           // 로그인 필요
'AUTH_INVALID_TOKEN'      // 잘못된 토큰
'FORBIDDEN'               // 권한 없음

// 데이터
'SCRIPT_NOT_FOUND'        // 대본을 찾을 수 없음
'VIDEO_NOT_FOUND'         // 비디오를 찾을 수 없음
'USER_NOT_FOUND'          // 사용자를 찾을 수 없음

// 검증
'INVALID_PARAMETERS'      // 파라미터 누락/잘못됨
'INVALID_FORMAT'          // 잘못된 형식
'UNSUPPORTED_CONVERSION'  // 지원하지 않는 변환

// 비즈니스 로직
'INSUFFICIENT_CREDITS'    // 크레딧 부족
'DUPLICATE_EMAIL'         // 중복 이메일
'CONVERSION_FAILED'       // 변환 실패

// 서버
'INTERNAL_SERVER_ERROR'   // 서버 내부 에러
'DATABASE_ERROR'          // 데이터베이스 에러
```

### 11.3 HTTP 상태 코드 요약

| 상태 코드 | 사용 상황 | 예시 |
|----------|----------|------|
| **200** | 성공 | 데이터 조회/생성/수정 성공 |
| **400** | 잘못된 요청 | 파라미터 누락, 잘못된 형식, **데이터를 찾을 수 없음** |
| **401** | 인증 실패 | 로그인 필요, 잘못된 토큰 |
| **403** | 권한 없음 | 본인 데이터가 아님 |
| **404** | **엔드포인트 없음** | `/api/wrong-path` 호출 (Next.js가 자동 처리) |
| **500** | 서버 에러 | try-catch의 catch 블록, DB 에러 |

### 11.4 프론트엔드 에러 처리

**에러 코드를 활용한 조건 분기:**

```typescript
// Frontend: page.tsx
const handleConversion = async () => {
  try {
    const response = await fetch('/api/convert-format', {
      method: 'POST',
      body: JSON.stringify({ scriptId, targetFormat })
    });

    const data = await response.json();

    if (!response.ok) {
      // 에러 코드에 따라 다른 처리
      switch (data.errorCode) {
        case 'SCRIPT_NOT_FOUND':
          toast.error('대본을 찾을 수 없습니다. 대본 생성이 완료될 때까지 기다려주세요.');
          break;
        case 'INSUFFICIENT_CREDITS':
          toast.error('크레딧이 부족합니다. 충전 후 다시 시도해주세요.');
          router.push('/settings/credits');
          break;
        case 'AUTH_REQUIRED':
          toast.error('로그인이 필요합니다.');
          router.push('/auth');
          break;
        case 'FORBIDDEN':
          toast.error('권한이 없습니다.');
          break;
        default:
          toast.error(data.error || '오류가 발생했습니다.');
      }
      return;
    }

    // 성공 처리
    toast.success('대본 변환이 시작되었습니다.');
  } catch (error) {
    console.error('변환 요청 실패:', error);
    toast.error('네트워크 오류가 발생했습니다.');
  }
};
```

### 11.5 실전 예제: convert-format API

**Before (❌ 잘못된 예):**
```typescript
if (!originalScript) {
  return NextResponse.json(
    { error: '대본을 찾을 수 없습니다.' },
    { status: 404 }  // ❌ API 엔드포인트가 없는 것처럼 보임
  );
}
```

**After (✅ 올바른 예):**
```typescript
if (!originalScript) {
  return NextResponse.json(
    {
      error: '대본을 찾을 수 없습니다. 대본 생성이 완료되지 않았을 수 있습니다.',
      errorCode: 'SCRIPT_NOT_FOUND',
      scriptId: scriptId,
      suggestion: 'scripts_temp 테이블 확인 필요'
    },
    { status: 400 }  // ✅ Bad Request
  );
}
```

### 11.6 체크리스트

API 작성 시 확인사항:

- [ ] 404는 엔드포인트가 없을 때만 사용 (Next.js가 자동 처리)
- [ ] 데이터를 찾을 수 없는 경우: 400 + errorCode
- [ ] 모든 에러 응답에 errorCode 포함
- [ ] 에러 메시지는 한글로 작성 (사용자 친화적)
- [ ] 개발 환경에서는 상세 에러 정보(stack trace) 포함
- [ ] 프론트엔드에서 errorCode로 분기 처리 가능

---

## 12. 백그라운드 프로세스 중지 기능

### 🎯 핵심 원칙 (절대 잊지 말 것!)

⚠️ **중요: 중지 기능을 수행할 때는 연결된 백그라운드 프로세스도 반드시 중지시켜야 합니다!**

**문제:**
- 사용자가 "중지" 버튼을 클릭했을 때
- 프론트엔드에서는 중지된 것처럼 보이지만
- 실제로는 백엔드 프로세스(Python, DALL-E 등)가 계속 실행되는 문제

**해결:**
- 단순히 부모 프로세스만 kill하면 자식 프로세스는 계속 실행됨
- 이중 보호 메커니즘(Dual Protection Mechanism) 사용 필수

### 12.1 이중 보호 메커니즘 (Dual Protection Mechanism)

백그라운드 프로세스를 안전하게 중지하려면 **두 가지 방법을 동시에** 사용해야 합니다:

#### 1. 취소 플래그 파일 (Cancel Flag File) - Graceful Shutdown
**목적:** Python 스크립트가 주기적으로 확인하여 자연스럽게 종료

```typescript
// Frontend: DELETE handler in route.ts
const backendPath = path.join(process.cwd(), '..', 'trend-video-backend');
const inputFolders = await fs.readdir(path.join(backendPath, 'input'));
const jobFolder = inputFolders.find(f => f.includes(jobId.replace('upload_', '')));

if (jobFolder) {
  const cancelFilePath = path.join(backendPath, 'input', jobFolder, '.cancel');
  await fs.writeFile(cancelFilePath, 'cancelled by user');
  console.log(`✅ 취소 플래그 파일 생성: ${cancelFilePath}`);
}
```

```python
# Backend: Python script (create_video_from_folder.py)
# 이미지 생성 루프 내부
for scene_num, scene in missing_scenes:
    # 취소 플래그 파일 체크
    cancel_file = self.folder_path / '.cancel'
    if cancel_file.exists():
        logger.warning("🛑 취소 플래그 감지됨. 이미지 생성을 중단합니다.")
        raise KeyboardInterrupt("User cancelled the operation")

    # 이미지 생성 로직...

# 비디오 처리 루프 내부
for scene in scenes:
    # 취소 플래그 파일 체크
    cancel_file = self.folder_path / '.cancel'
    if cancel_file.exists():
        logger.warning("🛑 취소 플래그 감지됨. 영상 생성을 중단합니다.")
        raise KeyboardInterrupt("User cancelled the operation")

    # 비디오 처리 로직...
```

#### 2. 프로세스 트리 강제 종료 (Process Tree Kill) - Force Kill
**목적:** 무한 루프나 응답 없는 프로세스 강제 종료

```typescript
// Frontend: DELETE handler in route.ts
import kill from 'tree-kill';

const process = runningProcesses.get(jobId);

if (process && process.pid) {
  const pid = process.pid;
  console.log(`🛑 프로세스 트리 종료 시작: Job ${jobId}, PID ${pid}`);

  try {
    // tree-kill 라이브러리로 프로세스 트리 전체 강제 종료
    await new Promise<void>((resolve, reject) => {
      kill(pid, 'SIGKILL', (err) => {
        if (err) {
          console.error(`❌ tree-kill 실패: ${err.message}`);
          reject(err);
        } else {
          console.log(`✅ tree-kill 성공: PID ${pid} 및 모든 자식 프로세스 종료`);
          resolve();
        }
      });
    });

    // Windows 고아 Python 프로세스 정리
    if (process.platform === 'win32') {
      await execAsync('taskkill /F /FI "IMAGENAME eq python.exe" /FI "STATUS eq RUNNING" 2>nul');
      console.log('✅ Windows 좀비 프로세스 정리 완료');
    }
  } catch (error: any) {
    console.error(`❌ tree-kill 실패, taskkill 재시도: ${error.message}`);

    // 실패 시 taskkill 재시도
    if (process.platform === 'win32') {
      await execAsync(`taskkill /F /T /PID ${pid}`);
    }
  }

  runningProcesses.delete(jobId);
}
```

### 12.2 실행 순서가 중요합니다!

⚠️ **반드시 취소 플래그 파일을 먼저 생성하고, 그 다음 프로세스를 kill해야 합니다!**

```typescript
// ✅ 올바른 순서
// 1단계: 취소 플래그 파일 생성 (Graceful shutdown)
await fs.writeFile(cancelFilePath, 'cancelled by user');

// 2단계: 프로세스 강제 종료 (Force kill)
await kill(pid, 'SIGKILL');
```

**이유:**
- 플래그 파일을 먼저 생성하면 Python이 다음 루프에서 감지하고 자연스럽게 종료 시도
- 그래도 종료 안 되면 프로세스 kill로 강제 종료
- 순서가 바뀌면 graceful shutdown 기회를 놓침

### 12.3 완전한 구현 예시

**위치:** `trend-video-frontend/src/app/api/generate-video-upload/route.ts` - DELETE handler

```typescript
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get('jobId');

    if (!jobId) {
      return NextResponse.json(
        { error: 'jobId가 필요합니다.' },
        { status: 400 }
      );
    }

    // 사용자 인증 확인
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json(
        { error: '인증이 필요합니다.' },
        { status: 401 }
      );
    }

    // Job 정보 가져오기
    const job = await getJob(jobId);
    if (!job) {
      return NextResponse.json(
        { error: 'Job을 찾을 수 없습니다.' },
        { status: 400 }
      );
    }

    // 작업 소유권 확인
    if (job.userId !== user.userId) {
      return NextResponse.json(
        { error: '이 작업을 중지할 권한이 없습니다.' },
        { status: 403 }
      );
    }

    // 이미 완료된 작업은 취소 불가
    if (job.status === 'completed') {
      return NextResponse.json(
        { error: '이미 완료된 작업은 취소할 수 없습니다.' },
        { status: 400 }
      );
    }

    // 1단계: 취소 플래그 파일 생성 (Python이 체크하도록)
    try {
      const backendPath = path.join(process.cwd(), '..', 'trend-video-backend');
      const inputFolders = await fs.readdir(path.join(backendPath, 'input'));
      const jobFolder = inputFolders.find(f => f.includes(jobId.replace('upload_', '')));

      if (jobFolder) {
        const cancelFilePath = path.join(backendPath, 'input', jobFolder, '.cancel');
        await fs.writeFile(cancelFilePath, 'cancelled by user');
        console.log(`✅ 취소 플래그 파일 생성: ${cancelFilePath}`);
      }
    } catch (error: any) {
      console.error(`❌ 취소 플래그 파일 생성 실패: ${error.message}`);
    }

    // 2단계: 프로세스 강제 종료
    const process = runningProcesses.get(jobId);

    if (process && process.pid) {
      const pid = process.pid;
      console.log(`🛑 프로세스 트리 종료 시작: Job ${jobId}, PID ${pid}`);

      try {
        // tree-kill 라이브러리로 프로세스 트리 전체 강제 종료
        await new Promise<void>((resolve, reject) => {
          kill(pid, 'SIGKILL', (err) => {
            if (err) {
              console.error(`❌ tree-kill 실패: ${err.message}`);
              reject(err);
            } else {
              console.log(`✅ tree-kill 성공: PID ${pid} 및 모든 자식 프로세스 종료`);
              resolve();
            }
          });
        });

        // Windows 고아 Python 프로세스 정리
        if (process.platform === 'win32') {
          await execAsync('taskkill /F /FI "IMAGENAME eq python.exe" /FI "STATUS eq RUNNING" 2>nul');
          console.log('✅ Windows 좀비 프로세스 정리 완료');
        }
      } catch (error: any) {
        console.error(`❌ tree-kill 실패, taskkill 재시도: ${error.message}`);

        // 실패 시 taskkill 재시도
        if (process.platform === 'win32') {
          await execAsync(`taskkill /F /T /PID ${pid}`);
        }
      }

      runningProcesses.delete(jobId);
    } else {
      console.log(`⚠️ 실행 중인 프로세스 없음 (프로세스가 없어도 Job 상태는 업데이트)`);
    }

    // 3단계: Job 상태 업데이트
    await updateJob(jobId, {
      status: 'cancelled',
      endTime: Date.now(),
    });

    await addJobLog(jobId, '사용자가 작업을 취소했습니다.');

    return NextResponse.json({
      success: true,
      message: '작업이 취소되었습니다.',
    });

  } catch (error: any) {
    console.error('DELETE 핸들러 에러:', error);
    return NextResponse.json(
      { error: '작업 취소 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
```

### 12.4 자주 하는 실수 (Common Pitfalls)

#### ❌ 실수 1: 부모 프로세스만 kill
```typescript
// ❌ 잘못된 예 - 자식 프로세스는 계속 실행됨
process.kill(pid, 'SIGTERM');
```

```typescript
// ✅ 올바른 예 - tree-kill 사용
kill(pid, 'SIGKILL', callback);
```

#### ❌ 실수 2: 취소 플래그를 체크하지 않음
```python
# ❌ 잘못된 예 - 긴 루프에서 취소 불가
for i in range(1000):
    # 무거운 작업...
    generate_image()
```

```python
# ✅ 올바른 예 - 매 루프마다 취소 체크
for i in range(1000):
    # 취소 플래그 체크
    cancel_file = Path('.cancel')
    if cancel_file.exists():
        raise KeyboardInterrupt("User cancelled")

    # 무거운 작업...
    generate_image()
```

#### ❌ 실수 3: tree-kill을 import만 하고 사용 안 함
```typescript
// ❌ 잘못된 예
import kill from 'tree-kill';  // import만 함

// DELETE 핸들러에서
await execAsync(`taskkill /F /T /PID ${pid}`);  // tree-kill 안 씀
```

```typescript
// ✅ 올바른 예
import kill from 'tree-kill';

// DELETE 핸들러에서
await new Promise<void>((resolve, reject) => {
  kill(pid, 'SIGKILL', (err) => {
    if (err) reject(err);
    else resolve();
  });
});
```

#### ❌ 실수 4: 순서가 잘못됨
```typescript
// ❌ 잘못된 예 - kill을 먼저 하면 graceful shutdown 기회 없음
await kill(pid, 'SIGKILL');
await fs.writeFile(cancelFilePath, 'cancelled');  // 이미 프로세스 죽음
```

```typescript
// ✅ 올바른 예 - 플래그 파일을 먼저 생성
await fs.writeFile(cancelFilePath, 'cancelled');  // 먼저 플래그 생성
await kill(pid, 'SIGKILL');  // 그 다음 강제 종료
```

### 12.5 새로운 백그라운드 작업 추가 시 체크리스트

새로운 백그라운드 프로세스를 추가할 때는 다음을 반드시 구현하세요:

- [ ] **DELETE API 엔드포인트 생성**
  - 사용자 인증 확인
  - Job 소유권 확인
  - 이미 완료된 작업은 취소 불가 처리

- [ ] **취소 플래그 파일 메커니즘**
  - `.cancel` 파일을 작업 폴더에 생성
  - Python 스크립트에서 매 루프마다 체크
  - 플래그 감지 시 `KeyboardInterrupt` 발생

- [ ] **프로세스 kill 메커니즘**
  - `tree-kill` 라이브러리 import
  - `kill(pid, 'SIGKILL')` 사용
  - Windows 좀비 프로세스 정리 추가
  - `runningProcesses` Map에서 관리

- [ ] **실행 순서 보장**
  - 1단계: 취소 플래그 파일 생성
  - 2단계: 프로세스 강제 종료
  - 3단계: Job 상태를 'cancelled'로 업데이트

- [ ] **에러 처리**
  - 플래그 파일 생성 실패 시 에러 로그
  - tree-kill 실패 시 taskkill 재시도
  - 프로세스가 없어도 Job 상태는 업데이트

- [ ] **로깅**
  - 취소 시작 로그
  - 플래그 파일 생성 로그
  - tree-kill 성공/실패 로그
  - Windows 좀비 프로세스 정리 로그
  - Python에서 취소 감지 로그

- [ ] **리그레션 테스트 작성**
  - DELETE API 엔드포인트 검증
  - 취소 플래그 파일 생성 검증
  - tree-kill 사용 검증
  - Python 스크립트 취소 감지 검증
  - Job 상태 업데이트 검증
  - 이중 보호 메커니즘 검증

### 12.6 테스트 가이드

**리그레션 테스트 위치:**
- `__tests__/integration/cancel-video-generation.regression.test.ts`

**테스트 실행:**
```bash
# 전체 리그레션 테스트
npm test -- cancel-video-generation.regression

# 특정 섹션만 실행
npm test -- -t "취소 플래그 파일 생성"

# watch 모드
npm test -- --watch cancel-video-generation.regression
```

**테스트 커버리지:**
- ✅ DELETE API 엔드포인트 존재 확인
- ✅ 사용자 인증 확인
- ✅ Job 소유권 확인
- ✅ `.cancel` 파일 생성 로직
- ✅ tree-kill 라이브러리 import 및 사용
- ✅ runningProcesses Map 관리
- ✅ Python 스크립트 `.cancel` 체크
- ✅ `KeyboardInterrupt` 발생
- ✅ Job 상태 'cancelled' 업데이트
- ✅ 취소 플래그가 프로세스 kill보다 먼저 실행되는지
- ✅ 프로세스가 없어도 Job 상태 업데이트
- ✅ 이미 완료된 작업 취소 불가
- ✅ 로그 출력 확인

### 12.7 실제 버그 사례

**상황:** 사용자가 쇼츠 변환 중 "중지" 버튼 클릭

**문제:**
```
사용자: "내가 중지를 눌렀는데 중지는 front에서는 된거처럼 보이는데
        실상 서버에서는 다 진행하고 있어 중지가 안되는거지"

로그: [쇼츠 변환 job_xxx] INFO - HTTP Request: POST https://api.openai.com/v1/images/generations
로그: [쇼츠 변환 job_xxx] INFO - DALL-E 이미지 생성 시작...
로그: [쇼츠 변환 job_xxx] INFO - DALL-E 이미지 생성 시작...
```

**원인:**
- DELETE 핸들러가 `taskkill /F /T /PID` 사용 (불완전)
- `tree-kill` import만 하고 실제 사용 안 함
- Python 스크립트에서 취소 플래그 체크 안 함
- DALL-E subprocess가 계속 실행됨

**해결:**
- 이중 보호 메커니즘 구현
- `.cancel` 플래그 파일 생성
- Python에서 매 루프마다 플래그 체크
- `tree-kill(pid, 'SIGKILL')` 사용

**결과:**
- 중지 버튼 클릭 시 즉시 모든 프로세스 중지
- DALL-E API 호출도 중단됨
- Job 상태 정확히 'cancelled'로 업데이트

### 12.8 참고 자료

- **구현 파일:**
  - `trend-video-frontend/src/app/api/generate-video-upload/route.ts` (DELETE handler)
  - `trend-video-backend/create_video_from_folder.py` (취소 플래그 체크)

- **테스트 파일:**
  - `__tests__/integration/cancel-video-generation.regression.test.ts`

- **라이브러리:**
  - `tree-kill`: 프로세스 트리 전체 종료
  - `child_process.spawn`: Python 프로세스 실행

---

*Last Updated: 2025-01-20*
