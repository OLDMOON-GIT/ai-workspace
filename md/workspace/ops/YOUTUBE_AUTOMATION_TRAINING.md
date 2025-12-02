# YouTube 자동화 시스템 마스터 과정

## 4일 집중 교육 커리큘럼

**교육 대상**: 유튜브 채널 운영자, 콘텐츠 크리에이터, 자동화 시스템 관리자
**선수 지식**: 기본적인 컴퓨터 활용 능력, 유튜브 채널 보유
**교육 목표**: 완전 자동화 유튜브 채널 운영 시스템 구축 및 관리 능력 습득

---

# Day 1: 시스템 이해 및 환경 구축

## 1교시: 시스템 개요 (2시간)

### 학습 목표
- 완전 자동화 시스템의 아키텍처 이해
- 각 구성 요소의 역할 파악
- 자동화 파이프라인 흐름 이해

### 1.1 완전 자동화란?

**기존 방식 (반자동화)**
```
[매번 수동 작업 필요]
1. /automation 페이지 접속
2. 제목 수동 입력 (또는 AI 제목 생성 후 선택)
3. 채널 선택
4. 스케줄 시간 설정
5. 스케줄 추가 버튼 클릭
↓
[자동화 시스템]
6. 시간 도래 → 대본 → 영상 → 업로드
```

**완전 자동화 방식**
```
[초기 설정 - 딱 1번만!]
1. 채널 선택
2. 주기 설정 (예: 3일마다)
3. 카테고리 설정 (예: ["시니어사연", "복수극"])
↓
[이후 완전 자동]
- AI가 제목 자동 생성
- 다음 스케줄 자동 추가
- 대본 자동 생성
- 영상 자동 생성
- YouTube 자동 업로드
- 예약 공개 자동 설정
```

### 1.2 시스템 아키텍처

```
┌─────────────────────────────────────────────────────────────────┐
│                     YOUTUBE 자동화 시스템                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐         │
│  │  Frontend   │────│   Backend   │────│  Database   │         │
│  │  (Next.js)  │    │  (Python)   │    │  (SQLite)   │         │
│  └─────────────┘    └─────────────┘    └─────────────┘         │
│         │                  │                                    │
│         ▼                  ▼                                    │
│  ┌─────────────┐    ┌─────────────┐                            │
│  │  Scheduler  │    │ AI Services │                            │
│  │  (60초 주기) │    │ (Gemini 등) │                            │
│  └─────────────┘    └─────────────┘                            │
│         │                  │                                    │
│         ▼                  ▼                                    │
│  ┌─────────────────────────────────────────────┐               │
│  │              파이프라인 워커                  │               │
│  │  Script → Image → Video → YouTube Upload    │               │
│  └─────────────────────────────────────────────┘               │
│                           │                                     │
│                           ▼                                     │
│                    ┌─────────────┐                              │
│                    │   YouTube   │                              │
│                    │   Channel   │                              │
│                    └─────────────┘                              │
└─────────────────────────────────────────────────────────────────┘
```

### 1.3 자동화 파이프라인 단계

| 단계 | 이름 | 설명 | 소요 시간 |
|------|------|------|----------|
| 1 | Script | AI 기반 대본 생성 | 30초~2분 |
| 2 | Image | 이미지 크롤링/생성 | 2~5분 |
| 3 | Video | 영상 합성 (TTS + 자막) | 3~10분 |
| 4 | Upload | YouTube 업로드 | 1~3분 |

### 1.4 핵심 데이터베이스 테이블

```sql
-- 제목 관리
video_titles (id, title, type, category, channel, status)

-- 스케줄 관리
video_schedules (id, title_id, scheduled_time, status)

-- 채널 설정
youtube_channel_settings (channel_id, posting_mode, interval, categories)

-- 파이프라인 실행 기록
automation_pipelines (id, schedule_id, stage, status)

-- 작업 큐
task_queue (task_id, type, status, priority)
```

---

## 2교시: 환경 구축 실습 (2시간)

### 학습 목표
- 개발 환경 설정
- 서버 실행 및 확인
- 기본 UI 탐색

### 2.1 필수 소프트웨어 설치

**체크리스트**
- [ ] Node.js 18+ 설치
- [ ] Python 3.10+ 설치
- [ ] Git 설치
- [ ] Chrome 브라우저 (자동화용)
- [ ] VS Code (권장)

### 2.2 프로젝트 구조

```
workspace/
├── trend-video-frontend/     # Next.js 프론트엔드
│   ├── src/
│   │   ├── app/              # 페이지 & API 라우트
│   │   ├── components/       # UI 컴포넌트
│   │   ├── lib/              # 핵심 라이브러리
│   │   └── workers/          # 워커 프로세스
│   └── data/
│       └── database.sqlite   # SQLite 데이터베이스
│
├── trend-video-backend/      # Python 백엔드
│   ├── src/
│   │   ├── ai_aggregator/    # AI 서비스 통합
│   │   ├── image_crawler/    # 이미지 크롤링
│   │   └── video_maker/      # 영상 제작
│   └── tasks/                # 작업 결과물 저장
│       └── {task_id}/
│           ├── story.json
│           ├── script.log
│           ├── image_crawl.log
│           ├── video.log
│           └── *.mp4
```

### 2.3 서버 실행

**Terminal 1 - Frontend**
```bash
cd trend-video-frontend
npm install
npm run dev
```
확인: http://localhost:3000

**Terminal 2 - Backend**
```bash
cd trend-video-backend
python -m venv venv
venv\Scripts\activate  # Windows
# source venv/bin/activate  # Mac/Linux
pip install -r requirements.txt
python -m uvicorn main:app --reload --port 8000
```
확인: http://localhost:8000/docs

### 2.4 UI 탐색 실습

**메인 페이지 구성**
- 영상 제작 모드 선택 (create/merge)
- JSON 업로드 영역
- 이미지/비디오 업로드 영역
- 실행 버튼

**자동화 페이지 (/automation)**
- 탭 1: 진행 큐 (대기/진행/완료)
- 탭 2: 스케줄 관리 (제목 풀/스케줄/채널 설정)
- 탭 3: 설정

---

## 3교시: 데이터베이스 이해 (1.5시간)

### 학습 목표
- SQLite 기본 사용법
- 핵심 테이블 구조 이해
- 데이터 조회 실습

### 3.1 SQLite 접속

```bash
cd trend-video-frontend/data
sqlite3 database.sqlite

# 테이블 목록 확인
.tables

# 테이블 구조 확인
.schema video_titles
```

### 3.2 주요 쿼리 실습

**제목 목록 조회**
```sql
SELECT id, title, type, category, status, created_at
FROM video_titles
ORDER BY created_at DESC
LIMIT 10;
```

**스케줄 현황 조회**
```sql
SELECT
  s.id,
  t.title,
  s.scheduled_time,
  s.status,
  s.youtube_privacy
FROM video_schedules s
JOIN video_titles t ON s.title_id = t.id
WHERE s.status IN ('pending', 'processing')
ORDER BY s.scheduled_time;
```

**채널 설정 확인**
```sql
SELECT
  channel_name,
  posting_mode,
  interval_value,
  interval_unit,
  categories,
  is_active
FROM youtube_channel_settings;
```

### 3.3 로그 파일 시스템

```
tasks/{task_id}/
├── script.log        # 대본 생성 로그
├── image_crawl.log   # 이미지 크롤링 로그
├── video.log         # 영상 제작 로그
└── youtube_upload.log # 유튜브 업로드 로그
```

**로그 형식**
```
[2025-11-27T12:00:00.000Z] 메시지 내용
```

---

## 4교시: Day 1 실습 과제 (1.5시간)

### 과제 1: 환경 구축 완료
- [ ] Frontend 서버 정상 실행 확인
- [ ] Backend 서버 정상 실행 확인
- [ ] 메인 페이지 접속 확인
- [ ] 자동화 페이지 접속 확인

### 과제 2: 데이터베이스 탐색
- [ ] SQLite 접속 성공
- [ ] video_titles 테이블 조회
- [ ] youtube_channel_settings 테이블 조회
- [ ] 테이블 관계도 이해

### 과제 3: 로그 파일 확인
- [ ] tasks 폴더 구조 확인
- [ ] 기존 로그 파일 내용 확인
- [ ] 로그 형식 이해

---

# Day 2: 채널 설정 및 스케줄링

## 1교시: YouTube 채널 연동 (2시간)

### 학습 목표
- YouTube API 인증 이해
- 채널 연동 프로세스 학습
- 토큰 관리 방법 이해

### 1.1 YouTube API 인증 구조

```
┌─────────────────────────────────────────────────┐
│                OAuth 2.0 Flow                   │
├─────────────────────────────────────────────────┤
│                                                 │
│  사용자 → Google 로그인 → 권한 승인             │
│                    ↓                            │
│           Authorization Code                    │
│                    ↓                            │
│  시스템 → Access Token + Refresh Token          │
│                    ↓                            │
│           YouTube API 호출                      │
│                                                 │
└─────────────────────────────────────────────────┘
```

### 1.2 토큰 관리

**토큰 저장 위치**
```
trend-video-frontend/data/tokens/
└── youtube_tokens.json
```

**토큰 구조**
```json
{
  "access_token": "ya29.xxx...",
  "refresh_token": "1//xxx...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "scope": "https://www.googleapis.com/auth/youtube.upload"
}
```

### 1.3 채널 연동 실습

1. `/automation` → 설정 탭
2. "YouTube 채널 연동" 버튼 클릭
3. Google 계정 로그인
4. 채널 접근 권한 승인
5. 연동 완료 확인

---

## 2교시: 채널 설정 심화 (2시간)

### 학습 목표
- 채널별 자동화 설정
- 주기 설정 옵션 이해
- 카테고리 관리

### 2.1 채널 설정 UI

**경로**: `/automation` → 스케줄 관리 → 채널 설정

### 2.2 주기 설정 옵션

**옵션 A: 고정 주기**
```
주기: [N] [단위]마다
- 1시간마다
- 6시간마다
- 1일마다
- 3일마다
- 7일마다
```

**옵션 B: 요일/시간 지정**
```
요일: [월] [화] [수] [목] [금] [토] [일]
시간: [HH:MM]

예시:
- 매주 월/수/금 12:00
- 매일 09:00, 18:00
```

### 2.3 카테고리 설정

**프리셋 카테고리**
```
시니어사연, 복수극, 패션, 뷰티, 요리,
건강, 여행, 동물, 일상, 감동
```

**커스텀 카테고리 추가**
```
입력 필드에 직접 입력 → [추가] 클릭
예: "운동", "재테크", "자기계발"
```

### 2.4 완전 자동화 활성화 조건

```
✅ 채널 설정 완료
✅ 주기 설정 완료
✅ 카테고리 1개 이상 선택
   ↓
🤖 "완전 자동화" 배지 표시
```

### 2.5 실습: 채널 설정

**시나리오: 시니어 사연 채널**
```
1. 채널 선택: "내 채널"
2. 주기: 고정 주기 → 3일마다
3. 카테고리: [시니어사연] [복수극] [감동] 선택
4. [저장] 클릭
5. "🤖 완전 자동화" 배지 확인
```

---

## 3교시: 스케줄러 관리 (2시간)

### 학습 목표
- 스케줄러 동작 원리 이해
- 스케줄러 제어 방법 학습
- 자동 생성 로직 이해

### 3.1 스케줄러 동작 원리

```
┌─────────────────────────────────────────────────┐
│             Automation Scheduler                │
├─────────────────────────────────────────────────┤
│                                                 │
│  [60초마다 체크]                                 │
│       ↓                                         │
│  1. 활성화된 채널 조회                           │
│       ↓                                         │
│  2. 각 채널별 주기 확인                          │
│       ↓                                         │
│  3. 주기 도래 시:                                │
│     - 카테고리에서 랜덤 선택                     │
│     - AI로 제목 생성                            │
│     - 제목 DB에 추가                            │
│     - 다음 스케줄 자동 추가                      │
│       ↓                                         │
│  4. 스케줄 시간 도래 시:                         │
│     - 대본 생성 시작                            │
│     - 이미지 크롤링                             │
│     - 영상 생성                                 │
│     - YouTube 업로드                            │
│                                                 │
└─────────────────────────────────────────────────┘
```

### 3.2 스케줄러 제어

**활성화**
```sql
UPDATE automation_settings
SET value = 'true'
WHERE key = 'enabled';
```

**비활성화**
```sql
UPDATE automation_settings
SET value = 'false'
WHERE key = 'enabled';
```

**UI에서 제어**
```
/automation → 설정 → 스케줄러 시작/중지
```

### 3.3 스케줄러 로그 확인

**정상 동작 로그**
```
✅ Automation scheduler started (checking every 60s)
[AutoScheduler] Checking 2 active channels for auto-scheduling
[AutoScheduler] Channel 내 채널: Generating title for category "시니어사연"
[AutoScheduler] Channel 내 채널: Generated title "예비 며느리를 시험하려..."
[AutoScheduler] ✅ Channel 내 채널: Auto-scheduled "..." for 2025-11-20T12:00:00
```

### 3.4 수동 스케줄 추가

**UI에서 추가**
```
1. /automation → 스케줄 관리 → 스케줄 탭
2. 제목 선택 (드롭다운)
3. 실행 시간 선택
4. 유튜브 공개 설정 선택
5. [스케줄 추가] 클릭
```

---

## 4교시: Day 2 실습 과제 (1시간)

### 과제 1: 채널 설정 완료
- [ ] 채널 1개 이상 설정 완료
- [ ] 주기 설정 (3일마다 또는 요일 지정)
- [ ] 카테고리 3개 이상 선택
- [ ] "완전 자동화" 배지 확인

### 과제 2: 스케줄러 테스트
- [ ] 스케줄러 활성화
- [ ] 스케줄러 로그 확인
- [ ] 자동 제목 생성 확인

### 과제 3: 수동 스케줄 추가
- [ ] 테스트 제목 1개 추가
- [ ] 5분 후 스케줄 설정
- [ ] 파이프라인 실행 확인

---

# Day 3: 콘텐츠 파이프라인 심화

## 1교시: 대본 생성 (Script) (2시간)

### 학습 목표
- AI 대본 생성 프로세스 이해
- 프롬프트 구조 학습
- 대본 형식 이해

### 1.1 대본 생성 흐름

```
제목 입력 → 카테고리 분석 → 프롬프트 생성 → AI 호출 → JSON 파싱 → 저장
```

### 1.2 대본 형식 (story.json)

```json
{
  "title": "영상 제목",
  "version": "shortform-1.0",
  "metadata": {
    "genre": "시니어사연",
    "format": "shortform"
  },
  "scenes": [
    {
      "scene_id": "scene_00_hook",
      "scene_type": "hook",
      "narration": "나레이션 텍스트",
      "image_prompt": "이미지 생성 프롬프트",
      "duration": 5
    },
    {
      "scene_id": "scene_01_problem",
      "scene_type": "problem",
      "narration": "...",
      "image_prompt": "...",
      "duration": 8
    }
    // ... 추가 씬
  ]
}
```

### 1.3 영상 타입별 씬 구성

**Shortform (숏폼)**
```
scene_00_hook     - 후킹 (관심 유발)
scene_01_problem  - 문제 제시
scene_02_solution - 해결 과정
scene_03_cta      - Call to Action
```

**Longform (롱폼)**
```
scene_00_intro    - 인트로
scene_01_setup    - 배경 설정
scene_02_rising   - 전개
scene_03_climax   - 클라이맥스
scene_04_falling  - 결말
scene_05_outro    - 아웃트로
```

### 1.4 대본 로그 확인

**script.log 예시**
```
[2025-11-27T12:00:00.000Z] 🚀 대본 생성 시작
[2025-11-27T12:00:01.000Z] 📋 제목: 예비 며느리를 시험하려...
[2025-11-27T12:00:02.000Z] 🤖 AI 모델: gemini-2.0-flash
[2025-11-27T12:00:30.000Z] ✅ 대본 생성 완료 (4개 씬)
```

---

## 2교시: 이미지 크롤링 (Image) (2시간)

### 학습 목표
- 이미지 크롤링 프로세스 이해
- Whisk 자동화 학습
- 이미지 관리 방법

### 2.1 이미지 크롤링 흐름

```
story.json 읽기 → 씬별 image_prompt 추출 → Whisk 자동화 → 이미지 다운로드 → 저장
```

### 2.2 Whisk 자동화

**Whisk란?**
- Google의 AI 이미지 생성 도구
- 프롬프트 기반 이미지 생성
- 스타일 참조 이미지 지원

**자동화 프로세스**
```
1. Chrome 브라우저 제어 (Puppeteer)
2. Whisk 페이지 접속
3. 프롬프트 입력
4. 생성 대기
5. 이미지 다운로드
6. 다음 씬으로 반복
```

### 2.3 이미지 파일 구조

```
tasks/{task_id}/
├── scene_00_hook.png
├── scene_01_problem.png
├── scene_02_solution.png
├── scene_03_cta.png
└── product_thumbnail.jpg  # 상품 영상의 경우
```

### 2.4 이미지 크롤링 로그

**image_crawl.log 예시**
```
[2025-11-27T12:01:00.000Z] 🚀 이미지 크롤링 시작...
[2025-11-27T12:01:01.000Z] 📋 4개 씬 발견 (format: shortform, ratio: 9:16)
[2025-11-27T12:01:05.000Z] 🔍 실행 중인 Chrome 찾는 중...
[2025-11-27T12:01:10.000Z] 📐 비율 선택 시도: 9:16
[2025-11-27T12:02:00.000Z] ✅ scene_00_hook 이미지 저장 완료
...
[2025-11-27T12:05:00.000Z] ✅ 4개 이미지 파일 저장 확인
```

---

## 3교시: 영상 생성 (Video) (2시간)

### 학습 목표
- 영상 합성 프로세스 이해
- TTS 시스템 학습
- 자막 생성 이해

### 3.1 영상 생성 흐름

```
이미지 + story.json → TTS 생성 → 자막 생성 → 영상 합성 → 최종 렌더링
```

### 3.2 TTS (Text-to-Speech)

**지원 TTS 엔진**
- Google Cloud TTS
- CLOVA Voice
- Edge TTS (무료)

**TTS 설정**
```json
{
  "voice": "ko-KR-Standard-A",
  "speed": 1.0,
  "pitch": 0
}
```

### 3.3 자막 생성

**자막 스타일**
```json
{
  "font": "Pretendard",
  "fontSize": 48,
  "color": "#FFFFFF",
  "strokeColor": "#000000",
  "strokeWidth": 2,
  "position": "bottom"
}
```

### 3.4 영상 합성 (FFmpeg)

**합성 프로세스**
```
1. 이미지 → 비디오 클립 변환
2. TTS 오디오 동기화
3. 자막 오버레이
4. 트랜지션 효과 적용
5. 최종 인코딩
```

### 3.5 영상 로그

**video.log 예시**
```
[2025-11-27T12:10:00.000Z] 🎬 영상 생성 시작
[2025-11-27T12:10:05.000Z] 🔊 TTS 생성 중... (씬 1/4)
[2025-11-27T12:10:30.000Z] 📝 자막 생성 완료
[2025-11-27T12:11:00.000Z] 🎞️ FFmpeg 인코딩 시작
[2025-11-27T12:15:00.000Z] ✅ 영상 생성 완료: output.mp4
```

---

## 4교시: YouTube 업로드 (1시간)

### 학습 목표
- 업로드 프로세스 이해
- 메타데이터 설정
- 예약 공개 설정

### 4.1 업로드 프로세스

```
영상 파일 → 메타데이터 생성 → YouTube API 호출 → 업로드 → 상태 확인
```

### 4.2 메타데이터

```json
{
  "title": "영상 제목",
  "description": "영상 설명\n\n#해시태그1 #해시태그2",
  "tags": ["태그1", "태그2"],
  "categoryId": "22",  // People & Blogs
  "privacyStatus": "private"  // private, unlisted, public
}
```

### 4.3 공개 설정 옵션

| 옵션 | 설명 |
|------|------|
| private | 비공개 (본인만 시청) |
| unlisted | 일부 공개 (링크 있는 사람만) |
| public | 전체 공개 |
| scheduled | 예약 공개 (특정 시간에 자동 공개) |

### 4.4 업로드 로그

**youtube_upload.log 예시**
```
[2025-11-27T12:20:00.000Z] 🚀 YouTube 업로드 시작
[2025-11-27T12:20:01.000Z] 📁 파일: output.mp4 (150MB)
[2025-11-27T12:20:05.000Z] 📤 업로드 진행: 25%
[2025-11-27T12:20:10.000Z] 📤 업로드 진행: 50%
[2025-11-27T12:20:15.000Z] 📤 업로드 진행: 75%
[2025-11-27T12:20:20.000Z] 📤 업로드 진행: 100%
[2025-11-27T12:20:25.000Z] ✅ 업로드 완료: https://youtu.be/xxxxx
```

---

# Day 4: 운영 및 트러블슈팅

## 1교시: 모니터링 (2시간)

### 학습 목표
- 실시간 모니터링 방법
- 로그 분석 기법
- 알림 설정

### 1.1 모니터링 대시보드

**진행 큐 페이지**
```
/automation → 진행 큐

[대기] - 실행 예정 작업
[진행] - 현재 실행 중인 작업
[완료] - 완료된 작업
[실패] - 실패한 작업
```

### 1.2 로그 실시간 확인

**UI에서 확인**
```
1. 진행 큐 → 작업 선택
2. "로그 보기" 클릭
3. 실시간 로그 스트림 확인
```

**터미널에서 확인**
```bash
# 실시간 로그 확인
tail -f tasks/{task_id}/script.log
tail -f tasks/{task_id}/image_crawl.log
tail -f tasks/{task_id}/video.log
```

### 1.3 상태 코드

| 상태 | 설명 |
|------|------|
| pending | 대기 중 |
| processing | 진행 중 |
| completed | 완료 |
| failed | 실패 |
| cancelled | 취소됨 |

### 1.4 알림 설정

**이메일 알림**
```sql
UPDATE automation_settings
SET value = 'your@email.com'
WHERE key = 'alert_email';
```

---

## 2교시: 에러 처리 (2시간)

### 학습 목표
- 일반적인 에러 유형 파악
- 에러 해결 방법 학습
- 재시도 메커니즘 이해

### 2.1 일반적인 에러 유형

**1. 대본 생성 실패**
```
원인: AI API 오류, 네트워크 문제
해결: 재시도 또는 API 키 확인
```

**2. 이미지 크롤링 실패**
```
원인: Chrome 연결 실패, Whisk 정책 위반
해결: Chrome 재시작, 프롬프트 수정
```

**3. 영상 생성 실패**
```
원인: FFmpeg 오류, 메모리 부족
해결: 파일 확인, 서버 리소스 확인
```

**4. 업로드 실패**
```
원인: 토큰 만료, 할당량 초과
해결: 토큰 갱신, 시간 간격 조정
```

### 2.2 자동 재시도

```
실패 → 5초 대기 → 재시도 1
실패 → 10초 대기 → 재시도 2
실패 → 15초 대기 → 재시도 3
실패 → 최종 실패 처리 + 알림
```

### 2.3 수동 재시도

**UI에서 재시도**
```
1. 실패한 작업 선택
2. "재시도" 버튼 클릭
3. 특정 단계부터 재시작 가능
```

### 2.4 트러블슈팅 체크리스트

**스케줄러 문제**
```sql
-- 스케줄러 상태 확인
SELECT * FROM automation_settings WHERE key = 'enabled';

-- 채널 설정 확인
SELECT * FROM youtube_channel_settings WHERE is_active = 1;

-- 대기 중인 스케줄 확인
SELECT * FROM video_schedules WHERE status = 'pending';
```

**파이프라인 문제**
```bash
# 로그 파일 확인
cat tasks/{task_id}/script.log | grep -i error
cat tasks/{task_id}/image_crawl.log | grep -i error
cat tasks/{task_id}/video.log | grep -i error
```

---

## 3교시: 고급 운영 팁 (1.5시간)

### 학습 목표
- 효율적인 운영 방법
- 성능 최적화
- 베스트 프랙티스

### 3.1 효율적인 카테고리 설정

**팁 1: 균형 잡힌 카테고리**
```
✅ 좋은 예: ["시니어사연", "복수극", "감동", "일상"]
❌ 나쁜 예: ["시니어사연"] (단일 카테고리)
```

**팁 2: 채널 특성에 맞는 카테고리**
```
시니어 채널: 시니어사연, 복수극, 감동, 건강
뷰티 채널: 패션, 뷰티, 스타일링, 트렌드
```

### 3.2 최적의 스케줄 간격

```
권장 간격: 최소 6시간 이상
이유:
- API 할당량 관리
- 서버 리소스 분산
- YouTube 알고리즘 최적화
```

### 3.3 리소스 관리

**디스크 공간**
```bash
# 오래된 작업 폴더 정리
find tasks/ -mtime +30 -type d -exec rm -rf {} \;
```

**데이터베이스 최적화**
```sql
-- 오래된 로그 정리
DELETE FROM automation_logs WHERE created_at < date('now', '-30 days');

-- 데이터베이스 압축
VACUUM;
```

### 3.4 백업 전략

```bash
# 일일 백업 스크립트
cp data/database.sqlite backups/database_$(date +%Y%m%d).sqlite
cp -r data/tokens backups/tokens_$(date +%Y%m%d)
```

---

## 4교시: Q&A 및 총정리 (1.5시간)

### 4.1 교육 내용 총정리

**Day 1 복습**
- 시스템 아키텍처
- 환경 구축
- 데이터베이스 구조

**Day 2 복습**
- 채널 연동
- 채널 설정
- 스케줄러 관리

**Day 3 복습**
- 대본 생성 (Script)
- 이미지 크롤링 (Image)
- 영상 생성 (Video)
- YouTube 업로드

**Day 4 복습**
- 모니터링
- 에러 처리
- 운영 팁

### 4.2 자주 묻는 질문 (FAQ)

**Q1: 자동 생성이 안 됩니다**
```
A: 다음을 확인하세요:
1. 스케줄러 활성화 여부
2. 채널 설정에 카테고리 있는지
3. 다음 스케줄이 이미 있는지 않은지
```

**Q2: 제목이 중복됩니다**
```
A: 카테고리를 더 다양하게 설정하세요.
향후 중복 체크 로직이 추가될 예정입니다.
```

**Q3: 영상 품질을 높이고 싶습니다**
```
A: 다음을 조정하세요:
1. 이미지 해상도 설정
2. TTS 음성 설정
3. 인코딩 품질 설정 (video_maker/config)
```

**Q4: 여러 채널을 운영하려면?**
```
A: 각 채널별로 별도 설정 가능합니다.
1. 채널 설정 페이지에서 각 채널 개별 설정
2. 서로 다른 주기와 카테고리 지정
```

### 4.3 추가 학습 자료

**문서**
- `COMPLETE_AUTO_GUIDE.md` - 전체 개발 가이드
- `QUICK_START_GUIDE.md` - 빠른 시작 가이드
- `AUTOMATION_GUIDE.md` - 자동화 상세 가이드

**API 문서**
- http://localhost:8000/docs - Backend API
- YouTube Data API v3 공식 문서

### 4.4 최종 체크리스트

**환경**
- [ ] Frontend 서버 실행
- [ ] Backend 서버 실행
- [ ] Chrome 브라우저 준비

**설정**
- [ ] YouTube 채널 연동
- [ ] 채널별 주기/카테고리 설정
- [ ] 스케줄러 활성화

**운영**
- [ ] 로그 모니터링 방법 숙지
- [ ] 에러 처리 방법 숙지
- [ ] 백업 전략 수립

---

# 부록

## A. 명령어 요약

### 서버 실행
```bash
# Frontend
cd trend-video-frontend && npm run dev

# Backend
cd trend-video-backend && venv\Scripts\activate && python -m uvicorn main:app --reload --port 8000
```

### 데이터베이스 접속
```bash
sqlite3 trend-video-frontend/data/database.sqlite
```

### 유용한 SQL 쿼리
```sql
-- 스케줄러 상태
SELECT * FROM automation_settings WHERE key = 'enabled';

-- 채널 설정
SELECT * FROM youtube_channel_settings;

-- 대기 스케줄
SELECT * FROM video_schedules WHERE status = 'pending';

-- 최근 제목
SELECT * FROM video_titles ORDER BY created_at DESC LIMIT 10;
```

## B. 문제 해결 가이드

| 증상 | 원인 | 해결 |
|------|------|------|
| 스케줄러 미작동 | enabled = false | DB에서 true로 변경 |
| 채널 목록 안 보임 | 토큰 만료 | 재인증 |
| 이미지 크롤링 실패 | Chrome 미실행 | Chrome 실행 후 재시도 |
| 업로드 실패 | 할당량 초과 | 24시간 대기 |

## C. 용어 사전

| 용어 | 설명 |
|------|------|
| Pipeline | 대본→이미지→영상→업로드 일련의 프로세스 |
| Scheduler | 예약된 작업을 실행하는 백그라운드 프로세스 |
| TTS | Text-to-Speech, 텍스트를 음성으로 변환 |
| Whisk | Google의 AI 이미지 생성 도구 |
| OAuth | 인증 프로토콜 (YouTube API 인증에 사용) |

---

**교육 문의**: 시스템 관리자에게 문의

**버전**: 1.0.0
**최종 수정**: 2025-11-27
