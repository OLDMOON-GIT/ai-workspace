# 상품자동화 기능목록 (Product Automation Feature List)

## 📋 목차

1. [기능 흐름도](#1-기능-흐름도)
2. [주요 기능](#2-주요-기능)
3. [구현 현황](#3-구현-현황)
4. [알려진 이슈](#4-알려진-이슈)
5. [데이터베이스 스키마](#5-데이터베이스-스키마)
6. [API 엔드포인트](#6-api-엔드포인트)

---

## 1. 기능 흐름도

### 전체 자동화 파이프라인

```
┌─────────────────────────────────────────────────────────────┐
│                    상품자동화 전체 흐름                      │
└─────────────────────────────────────────────────────────────┘

1️⃣ 상품 등록
   │
   ├─ 사용자가 쿠팡 상품 URL 제공
   ├─ 딥링크 생성 (쿠팡 API)
   └─ coupang_products 테이블에 저장
        │
        ↓
2️⃣ 타이틀 생성
   │
   ├─ 상품 정보 조회
   ├─ AI가 타이틀 자동 생성 (또는 사용자 입력)
   └─ video_titles 테이블에 저장
        │
        ↓
3️⃣ 스케줄 생성
   │
   ├─ 채널/카테고리별 스케줄 생성
   ├─ video_schedules 테이블에 저장
   └─ YouTube 프라이버시 설정
        │
        ↓
4️⃣ 자동화 스케줄러 실행
   │
   ├─ pending 상태의 스케줄 조회
   ├─ 대본 생성 (script generation)
   ├─ 영상 생성 (video generation)
   └─ automation_pipelines 테이블에 진행상황 기록
        │
        ↓
5️⃣ YouTube 업로드
   │
   ├─ 영상 파일 업로드
   ├─ 메타데이터 설정
   └─ youtube_videos 테이블에 기록
        │
        ↓
6️⃣ 완료
   │
   └─ 상태: completed/failed
```

---

## 2. 주요 기능

### 2.1 상품 등록 (Product Registration)

**기능**: 쿠팡 상품 URL을 받아 자동화 시스템에 등록

**제약사항**:
- ✅ 상품 URL 필수
- ✅ 딥링크 생성 필수 (쿠팡 파트너스)
- ✅ 한 사용자당 여러 상품 등록 가능
- ❌ 중복 상품 등록 체크 필요

**구현 파일**:
- `src/app/api/coupang-products/route.ts` - 상품 추가/조회/수정
- `src/lib/coupang-deeplink.ts` - 딥링크 생성 로직

**현재 상태**: ⚠️ **딥링크 생성 실패** (url convert failed)

---

### 2.2 타이틀 자동 생성 (Auto Title Generation)

**기능**: 상품 정보를 기반으로 AI가 자동으로 타이틀 생성

**구현 단계**:
1. 상품 정보 조회 (product_data JSON)
2. AI 프롬프트 생성
3. Claude/ChatGPT API 호출
4. 타이틀 결과 저장

**구현 파일**:
- `src/app/api/automation/titles/route.ts` - 타이틀 조회/생성
- `src/lib/automation.ts` - 타이틀 관련 DB 쿼리
- Prompt: `/api/automation/get-story` 또는 별도 프롬프트

**현재 상태**: ⚠️ **부분 구현**
- 타이틀 수동 입력: ✅ 완료
- 타이틀 자동 생성: ❓ 상태 불명확

---

### 2.3 스케줄 관리 (Schedule Management)

**기능**: 자동화된 영상 생성 일정 관리

**스케줄 상태 (Status)**:
- `pending` - 대기 중
- `processing` - 처리 중
- `completed` - 완료
- `failed` - 실패
- `cancelled` - 취소
- `waiting_for_upload` - 업로드 대기

**구현 파일**:
- `src/app/api/automation/schedules/route.ts` - 스케줄 조회/생성
- `src/app/api/automation/calendar/route.ts` - 캘린더 조회
- `src/lib/automation-scheduler.ts` - 스케줄러 실행

**기능**:
- 채널별 스케줄 조회
- 날짜별 스케줄 생성
- 수동 실행 (force-execute)
- 스케줄 취소

**현재 상태**: ✅ **기본 기능 완료**

---

### 2.4 자동화 스케줄러 (Automation Scheduler)

**기능**: 대기 중인 스케줄을 자동으로 처리

**동작**:
1. 3초마다 pending 스케줄 확인
2. 대본 생성 API 호출
3. 영상 생성 API 호출
4. 완료/실패 상태 업데이트

**파이프라인 상태**:
- `initialized` - 초기화됨
- `title_added` - 타이틀 추가됨
- `script_generated` - 대본 생성됨
- `video_generated` - 영상 생성됨
- `ready_for_upload` - 업로드 준비됨
- `uploaded` - 업로드됨
- `published` - 발행됨
- `failed` - 실패

**구현 파일**:
- `src/lib/automation-scheduler.ts` (1200+ 라인)
  - `startAutomationScheduler()` - 스케줄러 시작
  - `processPendingSchedules()` - pending 스케줄 처리
  - `checkAndCreateAutoSchedules()` - 자동 스케줄 생성
  - 에러 처리 및 이메일 알림

**현재 상태**: ✅ **기본 기능 완료**

---

### 2.5 YouTube 업로드 (YouTube Upload)

**기능**: 생성된 영상을 YouTube에 자동으로 업로드

**구현**:
- OAuth 인증
- 영상 메타데이터 (제목, 설명, 태그, 카테고리, 프라이버시)
- 썸네일 업로드
- 재시도 로직

**구현 파일**:
- `src/app/api/youtube/oauth-start/route.ts` - OAuth 시작
- `src/app/api/youtube/oauth-callback/route.ts` - OAuth 콜백
- `src/app/api/youtube/upload/route.ts` - 업로드 실행
- `src/app/api/automation/regenerate-video/route.ts` - 영상 재생성

**현재 상태**: ✅ **기본 기능 완료**

---

### 2.6 로깅 및 모니터링 (Logging & Monitoring)

**기능**: 자동화 진행 상황 기록

**로그 타입**:
- 파이프라인 로그 (pipeline_logs)
- 타이틀 로그 (title_logs)
- 스케줄 로그 (schedule_logs)

**구현 파일**:
- `src/app/api/automation/logs/route.ts` - 로그 조회
- `src/lib/automation.ts` - `addPipelineLog()`, `addTitleLog()`

**현재 상태**: ✅ **기본 기능 완료**

---

## 3. 구현 현황

### 파일별 구현 상태

| 파일 | 라인 수 | 상태 | 설명 |
|------|--------|------|------|
| `automation-scheduler.ts` | 1200+ | ✅ | 스케줄러 메인 로직 |
| `automation.ts` | 800+ | ✅ | DB 쿼리 및 헬퍼 함수 |
| `coupang-deeplink.ts` | 150+ | ❌ | 딥링크 생성 (실패) |
| `automation/schedules` | 200+ | ✅ | 스케줄 관리 API |
| `automation/titles` | 200+ | ⚠️ | 타이틀 API (부분) |
| `automation/calendar` | 150+ | ✅ | 캘린더 API |
| `automation/force-execute` | 150+ | ✅ | 수동 실행 API |
| `youtube/upload` | 300+ | ✅ | YouTube 업로드 |
| `automation/logs` | 100+ | ✅ | 로그 조회 API |

### 데이터베이스 테이블

```
✅ coupang_products      - 등록된 상품
✅ video_titles          - 생성된 타이틀
✅ video_schedules       - 스케줄
✅ automation_pipelines  - 파이프라인 진행상황
✅ pipeline_logs         - 파이프라인 로그
✅ title_logs            - 타이틀 로그
✅ youtube_videos        - 업로드된 영상
```

---

## 4. 알려진 이슈

### ❌ 심각한 이슈

#### 4.1 딥링크 생성 실패

**에러 메시지**:
```
상품 조회 실패: 상품을 찾을 수 없습니다
딥링크 생성 실패: url convert failed
```

**원인**: 쿠팡 API의 URL 변환 실패

**영향 범위**:
- 상품 등록 불가능
- 상품자동화 파이프라인 시작 불가능

**해결 방안**:
- [ ] 쿠팡 API 인증정보 확인
- [ ] 쿠팡 API 문서 업데이트 확인
- [ ] URL 변환 로직 재검토
- [ ] 대체 딥링크 생성 방식 검토

**파일**: `src/lib/coupang-deeplink.ts`

---

### ⚠️ 중요 이슈

#### 4.2 타이틀 자동 생성 미구현

**현재**: 사용자가 타이틀을 수동으로 입력
**필요**: AI 기반 자동 타이틀 생성

**구현 필요**:
- 상품 정보 → 프롬프트 생성
- Claude/ChatGPT API 호출
- 결과 저장

---

#### 4.3 에러 복구 불충분

**문제**:
- 중간에 실패한 파이프라인 자동 재시도 없음
- 수동으로만 force-execute 가능

**필요**:
- 지수 백오프 재시도 로직
- 자동 복구 메커니즘

---

## 5. 데이터베이스 스키마

### coupang_products (상품)

```sql
CREATE TABLE coupang_products (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  product_name TEXT NOT NULL,
  deep_link TEXT NOT NULL,        -- ❌ 생성 실패 문제
  category_id TEXT,
  image_url TEXT,
  original_price INTEGER,
  discount_price INTEGER,
  status TEXT DEFAULT 'active',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### video_titles (타이틀)

```sql
CREATE TABLE video_titles (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  type TEXT NOT NULL,              -- 'shortform', 'longform', 'shorts'
  category TEXT,
  product_url TEXT,                -- 쿠팡 URL
  product_data TEXT,               -- JSON (상품 정보)
  status TEXT DEFAULT 'pending',   -- pending, scheduled, processing, completed, failed
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### video_schedules (스케줄)

```sql
CREATE TABLE video_schedules (
  id TEXT PRIMARY KEY,
  title_id TEXT NOT NULL,
  product_url TEXT,
  channel TEXT,
  youtube_privacy TEXT DEFAULT 'public',
  status TEXT DEFAULT 'pending',   -- pending, processing, completed, failed, cancelled
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (title_id) REFERENCES video_titles(id)
);
```

### automation_pipelines (파이프라인)

```sql
CREATE TABLE automation_pipelines (
  id TEXT PRIMARY KEY,
  schedule_id TEXT,
  title_id TEXT,
  status TEXT,                     -- initialized, title_added, script_generated, ...
  video_output_path TEXT,
  error_message TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

---

## 6. API 엔드포인트

### 상품 관리

```
POST   /api/coupang-products              - 상품 추가
GET    /api/coupang-products              - 상품 목록 조회
GET    /api/coupang-products/[id]         - 상품 상세 조회
PUT    /api/coupang-products/[id]         - 상품 수정
DELETE /api/coupang-products/[id]         - 상품 삭제
```

### 타이틀 관리

```
POST   /api/automation/titles              - 타이틀 생성
GET    /api/automation/titles              - 타이틀 목록 조회
GET    /api/automation/titles/[id]         - 타이틀 상세 조회
PUT    /api/automation/titles/[id]         - 타이틀 수정
DELETE /api/automation/titles/[id]         - 타이틀 삭제
```

### 스케줄 관리

```
POST   /api/automation/schedules           - 스케줄 생성
GET    /api/automation/schedules           - 스케줄 목록 조회
PUT    /api/automation/schedules/[id]      - 스케줄 수정
DELETE /api/automation/schedules/[id]      - 스케줄 취소
```

### 자동화 실행

```
POST   /api/automation/force-execute       - 수동 실행
POST   /api/automation/scheduler           - 스케줄러 제어
GET    /api/automation/scheduler-status    - 스케줄러 상태 조회
```

### YouTube

```
GET    /api/youtube/oauth-start            - OAuth 인증 시작
GET    /api/youtube/oauth-callback         - OAuth 콜백
POST   /api/youtube/upload                 - 영상 업로드
GET    /api/youtube/channels               - 채널 목록 조회
```

### 로깅

```
GET    /api/automation/logs                - 로그 조회
```

---

## 다음 단계

### 1순위 (필수)
- [ ] 딥링크 생성 실패 문제 해결 (`coupang-deeplink.ts`)
- [ ] 상품 등록 기능 복구

### 2순위 (중요)
- [ ] 타이틀 자동 생성 구현
- [ ] 에러 복구 로직 개선

### 3순위 (개선)
- [ ] 전체 자동화 테스트 커버리지 향상
- [ ] 성능 최적화
- [ ] UI 개선

---

## 참고

**관련 문서**:
- `DEVELOPMENT_GUIDE.md` - 개발 패턴
- `TEST_GUIDE.md` - 테스트 작성 방법
- `AUTOMATION_GUIDE.md` - 자동화 가이드 (있으면)
- `src/tests/product-automation-integration.test.ts` - 통합 테스트

**테스트 코드**:
- `automation-scheduler-full.test.ts` (13 tests)
- `product-automation-integration.test.ts` (14 tests)
- `youtube-upload-integration.test.ts` (16 tests)
