# 개발 가이드 (Claude 메모리)

## ⚠️ 중요: 파일 인코딩

**🚨 이 파일은 반드시 UTF-8 (BOM 없음) 인코딩으로 저장해야 합니다!**

- **Gemini Codex가 이 가이드를 읽을 때 한글이 깨지지 않도록 필수!**
- 모든 .md 파일은 UTF-8 (no BOM) 인코딩 사용
- 파일 수정 시 인코딩 변경 금지
- VS Code 설정: 우측 하단 "UTF-8" 확인
- Git 설정: `.gitattributes`에서 `*.md text eol=lf`로 설정됨

**인코딩 확인 방법**:
```bash
# Windows PowerShell에서 확인
Get-Content .\CLAUDE.md -Encoding UTF8 | Select-Object -First 5

# 또는 VS Code에서 우측 하단 "UTF-8" 클릭 → "Save with Encoding" → "UTF-8"
```

---

## 프로젝트 정보
- 관리자: moony75@gmail.com
- 작업공간: C:\Users\oldmoon\workspace

## 통합 링크
- 워크스페이스 인덱스: `../WORKSPACE_INDEX.md`
- 프론트엔드 통합본: `../guides/FRONTEND_GUIDE.md`
- 백엔드 통합본: `../guides/BACKEND_GUIDE.md`

## 🚀 배치 파일 (.bat)

워크스페이스 루트에 있는 배치 파일들의 용도와 사용법입니다.

### az.bat - 자동 업데이트 + 서버 시작

**주요 기능**: Git Pull + 서버 자동 시작 + UI 자동 체크

**사용법**:
```bash
# 개발 모드 (로컬 변경사항 보존)
az.bat

# 강제 업데이트 모드 (초기 설치용, 로컬 변경사항 덮어쓰기)
az.bat --force
az.bat -f
```

**동작 순서**:
1. **Git Pull 작업** (3개 저장소)
   - Workspace (루트)
   - Frontend (서브모듈)
   - Backend (서브모듈)
   - 개발 모드: stash → pull → stash pop (로컬 변경사항 보존)
   - 강제 모드: fetch → reset --hard (로컬 변경사항 삭제)

2. **초기 셋업** (--force 모드만)
   - Root: npm install + Playwright 설치
   - Frontend: npm install
   - Backend: pip install -r requirements.txt
   - Playwright(Python): pip install playwright + chromium
   - AI 로그인 설정: ChatGPT, Gemini, Claude, Grok

3. **서버 구동**
   - 포트 2000 정리 (기존 프로세스 종료)
   - Frontend 서버 시작 (http://localhost:2000)
   - 통합 워커 자동 시작 (Script + Image + Video + YouTube)

4. **자동 UI 체크**
   - automation/auto-suite.js 실행
   - 스모크 테스트 + 버그 리스팅

**주의사항**:
- 개발 중에는 `az.bat`만 실행 (로컬 변경사항 보존)
- 초기 설치나 완전 리셋 시에만 `az.bat --force` 사용
- AI 로그인은 --force 모드에서만 자동 실행

---

### server.bat - 서버 관리 전용

**주요 기능**: Git Pull 없이 서버 시작/중지/상태 확인만 수행

**사용법**:
```bash
server.bat
# 메뉴 선택:
# [1] 서버 시작
# [2] 서버 중지
# [3] 서버 상태 확인
# [4] 종료
```

**동작 순서 (서버 시작 시)**:
1. **포트 정리**
   - 포트 2000 사용 중인 프로세스 종료

2. **MySQL 초기화** ⭐
   - MySQL80 서비스 시작 확인
   - 연결 테스트 (최대 3회 재시도)
   - **연결 실패 시 자동 복구**:
     - 원격 MySQL(192.168.0.30)에서 덤프
     - 로컬 MySQL에 복원
     - 사용자 권한 복원
   - 스키마 변경 감지 (MD5 해시)
   - 변경 시 schema-mysql.sql 자동 적용

3. **서버 시작**
   - Frontend 서버 (포트 2000)
   - 통합 워커 내장

**주의사항**:
- Git Pull이 필요하면 `az.bat` 사용
- MySQL 연결 실패 시 원격(192.168.0.30)에서 자동 복구 시도
- 스키마 변경은 자동 감지 및 적용

---

### 야간자동화.bat - 야간 자동 모니터링

**주요 기능**: 4개 자동화 서비스를 백그라운드로 실행

**실행 서비스**:
1. **Debugger** (mcp-debugger)
   - 로그 모니터링
   - 에러 큐 수집
   - `npm run monitor`

2. **Tester** (mcp-auto-tester)
   - 파일 변경 감지
   - 5분마다 자동 테스트
   - `npm run watch`

3. **AutoFix** (mcp-debugger)
   - Claude CLI 자동 수리
   - 에러 자동 해결 시도
   - `npm run auto-fix`

4. **TestGen** (mcp-debugger)
   - Claude CLI 테스트 생성
   - 10분마다 자동 실행
   - `npm run gen-test`

**사용 시나리오**:
- 퇴근 전 실행
- 다음 날 출근 시 `리포트.bat`으로 결과 확인

---

### 디버거.bat - 로그 모니터링

**주요 기능**: 에러 로그 실시간 모니터링

**실행 내용**:
```bash
cd C:\Users\oldmoon\workspace\mcp-debugger
npm run monitor
```

**기능**:
- 로그 파일 감시
- 에러 자동 수집
- error-queue.db에 저장

---

### 테스터.bat - 자동 테스트 워처

**주요 기능**: 파일 변경 감지 + 자동 테스트

**실행 내용**:
```bash
cd C:\Users\oldmoon\workspace\mcp-auto-tester
npm run watch
```

**기능**:
- 소스 파일 변경 감지
- 자동 테스트 실행 (5분 주기)
- 테스트 결과 저장

---

### 리포트.bat - 아침 버그 리포트

**주요 기능**: 야간 자동화 결과 종합 리포트

**실행 내용**:
1. **에러 큐 상태**
   - `npm run worker -- stats`
   - 수집된 에러 통계

2. **대기 중인 에러**
   - `npm run worker -- list 20`
   - 최근 20개 에러 목록

3. **테스트 결과**
   - `npm run cli -- stats`
   - 테스트 통계

4. **최근 테스트 실행 이력**
   - `npm run cli -- history`

5. **실패한 테스트 목록**
   - `npm run cli -- failed`

**사용 시나리오**:
- 출근 후 첫 작업
- 야간자동화.bat 실행 후 다음날 확인

---

### 배치 파일 실행 순서 권장

#### 일반 개발 시작
```bash
1. az.bat                 # Git Pull + 서버 시작 + UI 체크
2. (개발 작업)
3. server.bat [2]         # 서버 중지
```

#### 초기 설치 시
```bash
az.bat --force           # 강제 업데이트 + 의존성 설치 + AI 로그인 + 서버 시작
```

#### 서버만 재시작
```bash
server.bat               # [1] 서버 시작 선택
```

#### 야간 자동화 운영
```bash
# 퇴근 전
야간자동화.bat            # 4개 서비스 시작

# 다음날 출근
리포트.bat                # 결과 확인
```

#### 디버깅 시
```bash
디버거.bat               # 로그 모니터링
테스터.bat               # 자동 테스트
```

---

## 📋 문서

### 문서 저장 규칙
- **모든 .md 문서는 `md/` 폴더에 저장**
- BTS 문서: 워크스페이스 루트에 `BTS-XXXXXXX.md` 형식으로 생성
- 기타 가이드/스펙 문서: `md/` 폴더 하위에 적절한 분류로 저장
  - 예: `md/workspace/guides/`, `md/frontend/`, `md/backend/` 등
- 구현 아이디어: `md/구현하고싶은내용.md` (나중에 구현할 내용 기록용)

### Bug Tracking System (BTS)
- **위치**: 개별 버그는 `md/bts/BTS-XXXXXXX.md`, 전체 목록은 `md/bts.md`
- 발견된 버그는 즉시 등록
- 번호는 BTS-0000001부터 순차 증가
- 각 버그마다 원인 분석, 수정 내용, 해결 방법, 재발 방지 포함
- **DB 연동**: MySQL `bugs` 테이블(automation/bug-db.js)에도 동일하게 적재/업데이트하며 MCP/CLI/UI가 모두 이 DB를 조회함
  - MCP: `@디버깅` → bug.claim(할당) → 수정 후 `bug.update { id, status, note }` (note 있으면 `@디버깅`에서 바로 auto-update)
  - CLI: `npm run 디버깅 -- --worker <id>` (UI 체크 → bug.list → bug.claim → **수리/검증을 수행한 뒤** `bug-worker.js resolve/close` 또는 MCP `bug.update`로 상태/노트 기록). **CLI에서 발견한 버그도 반드시 이 bugs 테이블에 기록**(bug-worker의 `add` 또는 bug-db 직접 호출).
  - Admin UI: `/admin/bugs` (상태 필터/검색/링크; API `/api/bugs`)
- **@디버깅 명령 처리 규칙 (bugs 테이블 기준)**:
  1. `@디버깅` 호출 → bug.claim으로 티켓만 할당(`in_progress`).
  2. CLI 워커가 직접 코드 수정/테스트를 수행한다. (자동 수리 없음)
  3. 수정 완료 후 `bug.update` 또는 `bug-worker.js resolve <id> --worker <id> --note "해결 내용"`으로 상태/해결 내용을 기록한다. 필요 시 `resolution_note`에 자동 반영됨.

### ⚠️ 버그 발생 시 자동 처리 규칙 (중요!)

**사용자가 버그를 리포트하면 Claude는 즉시 다음 절차를 자동으로 실행:**

1. **BTS 번호 부여** - 마지막 번호 +1 (예: BTS-0000017)
2. **BTS 파일 생성** - 임시로 `BTS-XXXXXXX.md` 작성 (조사 중 내용 기록)
3. **원인 조사** - 코드 읽기, 로그 확인, 관련 파일 검색
4. **해결 방안 도출** - 여러 옵션 검토 및 최선책 선택
5. **코드 수정** - 해결 방안 구현
6. **BTS 파일 업데이트** - 해결 내용 추가 (✅ 해결 완료 섹션)
7. **bts.md 업데이트** - 전체 BTS 목록에 새 버그 추가

**⛔ 금지 사항:**
- 사용자에게 "버그 등록할까요?" 물어보지 말 것
- "BTS에 기록하겠습니다" 등의 불필요한 멘트 금지
- 바로 조사 시작하고 해결하면 됨

**예시:**
```
사용자: "재시도했는데 상태가 안 바뀜"
Claude: [즉시 BTS-0000016 생성 → 조사 → 해결 → 완료 보고]
```

**작업 순서:**
```
1. TodoWrite로 작업 계획
2. BTS-XXXXXXX.md 임시 파일 생성
3. 코드 조사 (Read, Grep 등)
4. 원인 파악 및 BTS 파일에 기록
5. 해결책 구현 (Edit)
6. BTS 파일에 해결 내용 추가
7. bts.md에 통합 (나중에 정리 시)
```

## 인증 정보

### Gmail SMTP (이메일 발송용)
- 계정: moony75@gmail.com
- 앱 비밀번호: vpxj gajp qsnm txfr
- 호스트: smtp.gmail.com
- 포트: 587

### 사용되는 프로젝트
- trend-video-frontend: 에러 알림 이메일
- mcp-title-patterns: 일간 진화 리포트 이메일

## 자동화 설정
- MCP-Pattern-Daily-Evolve: 매일 새벽 2시 패턴 진화 실행 + 이메일 발송

## 🔑 통합 키 시스템 (큐 스펙 v3)

**핵심: task_id = content_id (동일한 UUID)**

### 테이블 구조

### ⛔⛔⛔ task 테이블 컬럼 추가 금지! ⛔⛔⛔
**task 테이블은 최소화 상태 유지! 아래 컬럼만 존재해야 함:**
- task_id, user_id, scheduled_time, created_at, updated_at
- **설정 컬럼(category, tags, channel, script_mode 등)은 content/content_setting에!**
- **상태는 task_queue.status만 사용! task.status 제거됨!**
- **예약은 task.scheduled_time으로 관리! task_schedule 테이블 제거됨!**

```
task (최소화) - ID + user_id + scheduled_time
├── task_id (PK)
├── user_id
├── scheduled_time (예약 시간, NULL이면 예약 없음)
└── created_at, updated_at

content (메인 데이터) - content_id = task_id
├── user_id, title, original_title
├── prompt_format, ai_model, product_info, category
├── score, status, error, youtube_url
├── youtube_channel, youtube_publish_time
└── input_tokens, output_tokens

content_setting (제작 설정) - content_id = task_id
├── script_mode, media_mode
├── tts_voice, tts_speed, auto_create_shortform
├── tags, settings, youtube_privacy
└── created_at, updated_at

task_queue (큐 상태) - task_id (PK)
├── type (script/image/video/youtube) ⚠️ 'schedule' 타입 사용 안 함!
├── status (waiting/processing/completed/failed/cancelled)
├── created_at, user_id, error
└── 시간 기록은 task_time_log로 분리됨!

⭐ task_queue 생성 규칙:
- 일반 task 생성 시: task_queue 생성하지 않음!
- task_queue 없음 = 아직 시작 안 됨 (schedule 대기 상태)
- 자동화 스케줄러가 LEFT JOIN으로 task_queue IS NULL 찾아서 처리:
  - scheduled_time IS NULL → 즉시 실행 (task_queue에 script 추가)
  - scheduled_time <= NOW() → 예약 시간 도래 (task_queue에 script 추가)
  - scheduled_time > NOW() → 아직 대기
- 예외: shortform 변환은 video 단계로 task_queue 직접 추가 (이미지 준비 완료)

task_time_log (시간 기록) - (task_id + type + retry_cnt)
├── task_id, type, retry_cnt (재시도 횟수)
├── start_time, end_time
└── elapsed_time = end_time - start_time (계산으로 구함)
```

### 폴더 구조
```
tasks/{task_id}/
  ├── story.json
  ├── video.mp4
  └── thumbnail.png
```

### 🗑️ 삭제 규칙 (task_id = content_id)
- **content 삭제 시 → task도 함께 삭제** (content가 메인 데이터)
- **task 삭제 시 → content는 유지** (task는 예약/큐 정보만)
- **⚠️ 예외: content.status = 'draft'면 task 삭제 시 content도 삭제**
- 삭제 순서: task_queue → task_time_log → content_setting → task → content
- content 없이 task만 있을 수 있음 (예약만 생성된 상태)
- task 없이 content만 있을 수 없음 (task_id = content_id 필수)

### 🔄 Task Queue 플로우 (Phase Transitions)

⚠️ **핵심: completed 상태를 거치지 않고 바로 다음 phase의 waiting으로 전환!**

```
schedule waiting
  ↓ processPendingSchedules()
script waiting
  ↓ processQueue() 락 획득
script processing → (완료) → image waiting (바로!)
  ↓ processQueue() 락 획득
image processing → (완료) → video waiting (바로!)
  ↓ processQueue() 락 획득
video processing → (완료) → youtube waiting (바로!)
  ↓ processQueue() 락 획득
youtube processing → (완료) → youtube completed ✅ (최종 완료)
```

**실패/취소 시 전환 중단:**
- `script/image/video/youtube failed` ❌ → 더 이상 진행 안 함
- `script/image/video/youtube cancelled` ⛔ → 더 이상 진행 안 함

**핵심 원칙:**
- `processQueue()`가 작업 완료 시 **바로 다음 phase의 waiting으로 전환** (completed 거치지 않음!)
- `waiting` 상태는 `processQueue()`가 락을 획득하고 **processing**으로 변경
- `youtube completed`만 최종 완료 (더 이상 전환 없음)
- `failed`, `cancelled`는 전환되지 않음 (해당 단계에서 영구히 중단)
- `recoverOrphanedPipelines()`는 서버 중단/에러 시 복구용 (정상 플로우에서는 불필요)

**🔒 락 시스템 (각 타입에 processing 하나만):**
1. **processing 카운트 확인** → 이미 있으면 skip
2. **task_lock 테이블 확인** → 다른 워커가 작업 중이면 skip
3. waiting 큐 조회
4. **waiting → processing 변경**
5. **task_lock 획득** (다른 워커 충돌 방지)
6. executor 실행
7. 완료 후 **task_lock 해제**

## ⛔ 사용자에게 명령어 시키지 마라 ⛔

**파일 복사, 폴더 생성, git 명령어 등 직접 실행 가능한 작업은 사용자에게 시키지 말고 Claude가 직접 실행해라!**

```
❌ 잘못된 예:
"다음 명령어를 실행하세요: mkdir xxx && copy yyy"

✅ 올바른 예:
직접 Bash/PowerShell로 실행하고 결과만 알려줌
```

## 🗄️ MySQL 스키마 관리

### 서버 정보
| 서버 | IP | 사용자 | 작업공간 |
|------|----|----|---------|
| oldmoon PC | localhost | oldmoon | C:\Users\oldmoon\workspace |
| moony 서버 | 192.168.0.30 | moony | C:\Users\moony\workspace |

### MySQL 접속 정보
- User: `root`
- Password: `trend2024` (느낌표 없음!)
- Database: `trend_video`

### 스키마 변경 시
1. `schema-mysql.sql` 수정
2. `server.bat` 실행하면 자동 재적용 (CREATE TABLE IF NOT EXISTS)
3. 컬럼 추가/삭제는 별도 마이그레이션 SQL 실행 필요

### ⛔ 컬럼 추가/삭제 시 주의
- **schema-mysql.sql만 수정** (mysql.ts의 runMigrations()는 비워둠)
- 컬럼 추가/삭제는 별도 마이그레이션 스크립트 작성 후 직접 실행
- `.schema_hash` 파일은 사용하지 않음

## 📝 코딩 컨벤션

### 네이밍 규칙 (언어/환경별)
| 구분 | 컨벤션 | 예시 |
|------|--------|------|
| JSON 키 | **camelCase** | `{ "sceneNumber": 1, "imagePrompt": "..." }` |
| JS / TS | **camelCase** | `const taskId = queue.taskId;` |
| DB 컬럼 | **snake_case** | `SELECT task_id, user_id FROM task` |
| Python 변수 | **snake_case** | `scene_number = data["sceneNumber"]` |

### SQL SELECT 시 AS alias로 camelCase 변환
```typescript
// ✅ DB 컬럼은 snake_case, JS에서 사용할 땐 AS alias로 camelCase 변환
SELECT t.task_id as taskId,
       t.user_id as userId,
       c.prompt_format as promptFormat,
       c.product_info as productInfo

// ✅ JS 코드에서 camelCase 사용
const taskId = queue.taskId;

// ❌ JS 코드에서 snake_case 사용 금지
const taskId = queue.task_id;  // 금지!
```

### Python에서 JSON 읽을 때
```python
# ✅ JSON 키는 camelCase, Python 변수는 snake_case
data = json.load(f)
scene_number = data["sceneNumber"]
image_prompt = data["imagePrompt"]

# ❌ JSON 키를 snake_case로 쓰지 말 것
scene_number = data["scene_number"]  # 금지!
```

### 속성명 통일
- `productInfo` (O) / `productData` (X) / `product_data` (X)
- `promptFormat` (O) / `prompt_format` (X)
- `taskId` (O) / `task_id` (X)
- `sceneNumber` (O) / `scene_number` (X)

## 🚨🚨🚨 절대 삭제/수정 금지 규칙 🚨🚨🚨

### ⛔⛔⛔ SQL alias 수정 절대 금지 ⛔⛔⛔
**youtube_channel as youtubeChannel - 이 SQL alias를 절대 변경하지 마세요!**
**한번이라도 channel로 바꾸면 카테고리가 채널 이름("쇼츠왕")으로 표시되는 버그 발생!**

**절대 수정 금지 파일 및 라인:**
- `sql/automation.sql` (line 241): `c.youtube_channel as youtubeChannel` ✅
- `sql/scheduler.sql` (line 57): `c.youtube_channel as youtubeChannel` ✅
- `sql/scheduler.sql` (line 268): `c.youtube_channel as youtubeChannel` ✅
- `tests/sql-mapper-integration.test.ts` (line 227): 테스트 케이스에서도 `youtubeChannel` 사용 ✅

**⚠️ 절대 금지:**
```sql
-- ❌ 절대 이렇게 바꾸지 마세요!
c.youtube_channel as channel  -- 이거 하면 카테고리가 "쇼츠왕"으로 표시됨!

-- ✅ 반드시 이렇게 유지해야 합니다!
c.youtube_channel as youtubeChannel
```

### ⛔ 딥링크 관련 코드 수정 금지 ⛔
**아래 딥링크 관련 모든 로직은 절대 수정하지 마세요!**
**수정이 필요하면 반드시 사용자에게 먼저 확인받을 것!**

### 쿠팡 상품 딥링크 필수 규칙
**이 규칙을 절대 무시하거나 삭제하지 마세요!**

1. **딥링크가 없으면 상품을 내 목록(coupang_product)에 절대 저장할 수 없음**
2. **딥링크 생성 실패 시 해당 상품은 반드시 스킵해야 함**
3. **원본 URL(coupang.com/vp/products/...)은 딥링크가 아님!**
4. **이 규칙을 무시하면 파트너스 수익이 발생하지 않음**

관련 파일들 (딥링크 필터링 조건 절대 삭제 금지):
- `trend-video-frontend/src/app/api/coupang/products/add/route.ts`
- `trend-video-frontend/src/app/api/coupang-crawl-worker/route.ts`
- `trend-video-frontend/src/app/api/admin/coupang-products/route.ts`
- `trend-video-frontend/src/app/api/coupang/products/route.ts`
- `trend-video-frontend/src/lib/automation-scheduler.ts`

딥링크 필터링 SQL 조건 (절대 삭제 금지):
```sql
AND deep_link IS NOT NULL
AND deep_link != ''
AND deep_link LIKE '%link.coupang.com/%'
AND deep_link NOT LIKE '%/re/AFFSDP%'       -- 긴 형식 거부!
AND deep_link NOT LIKE '%?lptag=%'          -- 쿼리 파라미터 거부!
```

### 쿠팡 API 서명 규칙 (datetime 형식)
**이 형식을 절대 변경하지 마세요!**

```javascript
// ✅ 올바른 형식: yymmddTHHMMSSZ (예: 241129T123045Z)
const datetime = `${year}${month}${day}T${hours}${minutes}${seconds}Z`;

// ❌ 잘못된 형식: ISO 형식 (예: 2024-11-29T12:30:45Z)
// const datetime = new Date().toISOString().slice(0, -5) + 'Z'; // 절대 사용 금지!
```

### 딥링크 URL 형식 검증
**유효한 딥링크만 저장해야 함!**

```javascript
// ✅ 유효한 딥링크 (단축 URL):
//    link.coupang.com/{1-2글자}/XXXXX
//    예: /a/, /b/, /ab/, /cL/ 등
//
// ❌ 무효한 딥링크 (모두 거부!):
//    - link.coupang.com/re/AFFSDP?... (긴 형식 - 딥링크 아님!)
//    - ?lptag=, ?pageKey= 쿼리 파라미터 있는 경우

const isValidDeepLink = shortUrl &&
  shortUrl.includes('link.coupang.com/') &&
  !shortUrl.includes('/re/AFFSDP') &&
  !shortUrl.includes('?lptag=') &&
  !shortUrl.includes('?pageKey=');
```

### 상품 ID 추출 (pageKey 필수)
**베스트셀러 affiliate URL에서 pageKey를 반드시 추출해야 함!**

```javascript
// 베스트셀러 URL 예시:
// https://link.coupang.com/re/AFFSDP?lptag=AF5835292&pageKey=9118691083&...
// pageKey=9118691083 이 상품 ID임!

const pageKey = urlObj.searchParams.get('pageKey');
if (pageKey) return pageKey; // 이게 첫 번째로 체크되어야 함!
```
- # Error Type
Console Error

## Error Message
Each child in a list should have a unique "key" prop.

Check the render method of `AutomationPageContent`. See https://react.dev/link/warning-keys for more information.


    at tr (<anonymous>:null:null)
    at <unknown> (src/app/automation/page.tsx:2904:27)
    at Array.map (<anonymous>:null:null)
    at AutomationPageContent (src/app/automation/page.tsx:2903:37)
    at AutomationPage (src/app/automation/page.tsx:4639:7)

## Code Frame
  2902 |                       <tbody className="bg-slate-800">
  2903 |                         {poolTitles.map((title: any) => (
> 2904 |                           <tr key={title.id} className="border-b border-slate-700 hover:bg-slate-700">
       |                           ^
  2905 |                             <td className="px-4 py-3">
  2906 |                               <span className={`font-bold ${
  2907 |                                 title.score >= 95 ? 'text-green-400' :

Next.js version: 16.0.0 (Turbopack)
## 📡 UI 수동 실행 API 엔드포인트

UI에서 각 단계를 수동으로 실행할 수 있는 API 엔드포인트 목록입니다.

### 1. 대본 작성 (Script Generation)

**엔드포인트**: `POST /api/generate-script`

**파일**: `src/app/api/generate-script/route.ts`

**기능**: AI 모델(Claude/ChatGPT/Gemini)을 사용해 영상 대본을 생성합니다.

**요청 Body**:
```json
{
  "prompt": "대본 생성용 프롬프트",
  "topic": "주제 (선택)",
  "promptFormat": "longform | shortform | product | product-info | sora2",
  "model": "claude | chatgpt | gemini",
  "category": "카테고리 (선택)",
  "productInfo": "상품 정보 JSON (상품용)",
  "userId": "사용자 ID (내부 요청 시)"
}
```

**응답**:
```json
{
  "story": { "scenes": [...], "title": "..." },
  "scriptId": "uuid",
  "inputTokens": 1000,
  "outputTokens": 2000,
  "cost": 0.05
}
```

**비고**:
- 내부 요청 시 `X-Internal-Request: automation-system` 헤더 필요
- 비용 계산 후 자동 크레딧 차감
- AI 모델별 가격: Claude $3/$15, ChatGPT $2.5/$10, Gemini 무료

---

### 2. 이미지 크롤링 (Image Crawling)

**엔드포인트**: `POST /api/images/crawl`

**파일**: `src/app/api/images/crawl/route.ts`

**기능**: story.json의 각 씬에 맞는 이미지를 자동으로 수집합니다.

**요청 Body**:
```json
{
  "scenes": [
    {
      "sceneNumber": 1,
      "imagePrompt": "이미지 검색 키워드"
    }
  ],
  "contentId": "task_id",
  "useImageFX": true,
  "format": "longform | shortform | product",
  "productInfo": "상품 정보 (선택)",
  "metadata": {}
}
```

**응답**:
```json
{
  "taskId": "uuid",
  "status": "pending"
}
```

**비고**:
- Python 스크립트 `image_crawler_working.py` 실행
- format에 따라 aspect ratio 자동 결정 (longform: 16:9, 나머지: 9:16)
- `useImageFX` 옵션으로 ImageFX + Whisk 사용 가능
- 작업 상태는 `GET /api/images/logs?taskId=xxx`로 조회

---

### 3. 영상 제작 (Video Generation)

**엔드포인트**: `POST /api/video-merge`

**파일**: `src/app/api/video-merge/route.ts`

**기능**: story.json, 이미지, TTS 음성을 합성하여 최종 영상을 제작합니다.

**요청 Body** (FormData):
```
taskId: "task_id"
title: "영상 제목"
format: "longform | shortform | product"
scenes: JSON string (story.json scenes)
ttsVoice: "ko-KR-SoonBokNeural | ko-KR-SunHiNeural"
ttsSpeed: "+0% | +10% | -10%"
aiModel: "claude | chatgpt | gemini"
userId: "user_id"
```

**응답**:
```json
{
  "success": true,
  "jobId": "uuid",
  "videoPath": "tasks/xxx/video.mp4",
  "thumbnailPath": "tasks/xxx/thumbnail.png"
}
```

**비고**:
- Python 스크립트 `long_form_creator.py` 실행
- TTS 생성 → 이미지 + 음성 합성 → 썸네일 생성
- 10분 타임아웃 (대용량 영상 처리)
- 크레딧 차감 (영상 제작 비용)

---

### 4. 유튜브 업로드 (YouTube Upload)

**엔드포인트**: `POST /api/youtube/upload`

**파일**: `src/app/api/youtube/upload/route.ts`

**기능**: 완성된 영상을 YouTube에 자동 업로드합니다.

**요청 Body**:
```json
{
  "videoPath": "tasks/xxx/video.mp4",
  "title": "영상 제목",
  "description": "영상 설명",
  "pinnedComment": "고정 댓글 (선택)",
  "tags": ["태그1", "태그2"],
  "privacy": "public | unlisted | private",
  "categoryId": "27",
  "thumbnailPath": "tasks/xxx/thumbnail.png",
  "captionsPath": "tasks/xxx/captions.srt (선택)",
  "publishAt": "2024-12-25T15:00:00Z (예약 공개 시)",
  "channelId": "YouTube 채널 ID (선택)",
  "taskId": "task_id",
  "userId": "user_id",
  "type": "product | longform | shortform"
}
```

**응답**:
```json
{
  "success": true,
  "videoId": "YouTube Video ID",
  "videoUrl": "https://www.youtube.com/watch?v=xxx",
  "channelId": "YouTube Channel ID"
}
```

**비고**:
- Python 스크립트 `youtube_upload_cli.py` 실행
- OAuth 인증 필요 (채널별 토큰 파일)
- 예약 공개 지원 (`publishAt` 사용)
- 상품 영상은 자동으로 고정 댓글 추가

---

## 🔄 워커 시스템 (자동화)

UI 수동 실행 외에도 워커가 자동으로 큐를 처리합니다:

### Unified Worker (통합 워커)
- **파일**: `src/workers/unified-worker.js`
- **실행**: `npm run start:unified-worker`
- **기능**: 4개 타입(script/image/video/youtube)을 하나의 프로세스에서 병렬 처리
- **락 시스템**: `task_lock` 테이블로 동시성 제어

### 개별 TypeScript 워커
- `src/workers/script-worker.ts` - 대본 생성
- `src/workers/image-worker.ts` - 이미지 크롤링
- `src/workers/video-worker.ts` - 영상 제작
- `src/workers/youtube-worker.ts` - 유튜브 업로드

**공통 동작**:
1. `task_queue`에서 `type`과 `status='waiting'` 작업 조회
2. Lock 획득 (중복 실행 방지)
3. Python 스크립트 실행
4. 성공 시 다음 단계로 전환 (completed 없이 바로 다음 waiting)
5. 실패 시 `status='failed'` + 에러 로그 기록
6. 워커 중지 시 처리 중인 작업을 `cancelled` 상태로 변경


---

## 🎨 미디어 생성 옵션 (Media Mode)

영상 제작 단계에서 사용할 수 있는 미디어 생성 방식입니다.

### content_setting.media_mode

`content_setting` 테이블의 `media_mode` 컬럼으로 관리합니다.

| 옵션 | 설명 | 비용 | 사용 기술 |
|------|------|------|-----------|
| **crawl** | 이미지 크롤링 (기본값) | 무료 | Whisk + ImageFX (자동화) |
| **dalle3** | DALL-E 3 이미지 생성 | 유료 | OpenAI DALL-E 3 API |
| **imagen3** | Imagen 3 이미지 생성 | 유료 | Google Imagen 3 API |
| **sora2** | Sora 비디오 직접 생성 | 유료 | OpenAI Sora API |

### 상세 설명

#### 1. crawl (기본 - 무료)
- **단계**: 이미지 크롤링 → 영상 제작
- **이미지 소스**: image_crawler_working.py
- **기술**: Whisk 자동화 + ImageFX (선택)
- **장점**: 무료, 안정적
- **단점**: 크롤링 시간 소요

#### 2. dalle3 (AI 이미지 생성)
- **단계**: 이미지 크롤링 생략 → AI 이미지 생성 → 영상 제작
- **이미지 생성**: DALL-E 3 API
- **프롬프트**: story.json의 `imagePrompt` 또는 `dallеPrompt`
- **크기**: aspect ratio에 따라 자동 설정
  - longform (16:9): 1792x1024
  - shortform (9:16): 1024x1792
- **장점**: 고품질, 커스터마이징 가능
- **단점**: API 비용 발생

#### 3. imagen3 (Google AI 이미지)
- **단계**: 이미지 크롤링 생략 → AI 이미지 생성 → 영상 제작
- **이미지 생성**: Google Imagen 3 API
- **기본 크기**: 1024x1024 (정사각형만 지원)
- **비율 조정**: 생성 후 자동 크롭/리사이즈
- **환경변수**: `GOOGLE_API_KEY` 필요
- **장점**: Google의 최신 이미지 AI
- **단점**: 정사각형 제약, API 비용

#### 4. sora2 (비디오 직접 생성)
- **단계**: 이미지 생략 → Sora로 비디오 직접 생성 → 영상 병합
- **비디오 생성**: OpenAI Sora API
- **프롬프트**: story.json의 `soraPrompt` (전용 필드)
- **특징**: 
  - `soraPrompt`만 있고 `imagePrompt`가 없으면 이미지 생성 건너뜀
  - Sora가 scene별 영상을 직접 생성
  - TTS 음성과 자동 병합
- **장점**: 영상 직접 생성으로 품질 최고
- **단점**: API 비용 높음, 생성 시간 길음

### 구현 위치

**Python 스크립트**: `trend-video-backend/src/video_generator/long_form_creator.py`

**설정 위치**:
```python
# config.json
{
  "ai": {
    "image_generation": {
      "provider": "openai|replicate|huggingface|imagen3",
      "auto_generate": false
    }
  }
}
```

**환경변수**:
```bash
# DALL-E 3 (OpenAI)
OPENAI_API_KEY=sk-...

# Imagen 3 (Google)
GOOGLE_API_KEY=...

# Replicate (저렴한 대안)
REPLICATE_API_TOKEN=...

# Hugging Face (무료 대안)
HUGGINGFACE_API_KEY=...

# Sora (비디오 생성)
OPENAI_API_KEY=sk-...  # Sora도 OpenAI API 사용
```

### Story.json 필드

각 씬의 프롬프트 필드:

```json
{
  "scenes": [
    {
      "sceneNumber": 1,
      "narration": "나레이션 텍스트",
      "imagePrompt": "이미지 검색/크롤링 키워드",
      "dallePrompt": "DALL-E 3용 상세 프롬프트 (선택)",
      "soraPrompt": "Sora 비디오 생성용 프롬프트 (선택)",
      "visual_description": "시각적 묘사 (폴백용)"
    }
  ]
}
```

**우선순위**:
1. `soraPrompt` → Sora 비디오 생성 (이미지 생성 건너뜀)
2. `dallePrompt` → AI 이미지 생성 (dalle3/imagen3)
3. `imagePrompt` → 이미지 크롤링 (crawl)
4. `visual_description` → 폴백


---

## 🎯 핵심 기능 목록 (Quick Reference)

### 전체 파이프라인

```
1. 대본 작성 (Script)
   ↓
2. 미디어 생성 (Image/Video)
   ├─ crawl: 이미지 크롤링 (Whisk + ImageFX)
   ├─ dalle3: DALL-E 3 이미지 생성
   ├─ imagen3: Imagen 3 이미지 생성
   └─ sora2: Sora 비디오 직접 생성
   ↓
3. 영상 제작 (Video Merge)
   ├─ TTS 음성 생성
   ├─ 이미지/비디오 + 음성 합성
   └─ 썸네일 자동 생성
   ↓
4. 유튜브 업로드 (YouTube)
   ├─ OAuth 인증
   ├─ 예약 공개 설정
   └─ 자동 고정 댓글
```

### API 엔드포인트 요약

| 단계 | 엔드포인트 | 메서드 | 주요 파라미터 |
|------|-----------|--------|--------------|
| **대본** | `/api/generate-script` | POST | promptFormat, model, category |
| **이미지** | `/api/images/crawl` | POST | scenes, useImageFX, format |
| **영상** | `/api/video-merge` | POST | taskId, format, ttsVoice |
| **업로드** | `/api/youtube/upload` | POST | videoPath, privacy, channelId |

### 워커 프로세스

| 워커 | 파일 | 처리 타입 | 설명 |
|------|------|-----------|------|
| **Unified** | `unified-worker.js` | All (4개) | 통합 워커 (병렬 처리) |
| **Script** | `script-worker.ts` | script | 대본 생성 전용 |
| **Image** | `image-worker.ts` | image | 이미지 크롤링 전용 |
| **Video** | `video-worker.ts` | video | 영상 제작 전용 |
| **YouTube** | `youtube-worker.ts` | youtube | 업로드 전용 |

**실행 명령**:
```bash
npm run start:unified-worker   # 통합 워커 (권장)
npm run start:script-worker    # 대본 전용
npm run start:image-worker     # 이미지 전용
npm run start:video-worker     # 영상 전용
npm run start:youtube-worker   # 업로드 전용
```

### Python 스크립트 (Backend)

| 기능 | 파일 | 실행 방법 |
|------|------|-----------|
| **대본** | `src/ai_aggregator/main.py` | `python -m src.ai_aggregator.main <task_id>` |
| **이미지** | `src/image_crawler/image_crawler_working.py` | `python -m src.image_crawler.image_crawler_working <task_id>` |
| **영상** | `src/video_generator/long_form_creator.py` | `python -m src.video_generator.long_form_creator <task_id>` |
| **업로드** | `src/youtube/youtube_upload_cli.py` | `python -m src.youtube.youtube_upload_cli <task_id> <title> <privacy>` |

### 주요 테이블

| 테이블 | 용도 | 핵심 컬럼 |
|--------|------|-----------|
| `task` | 작업 기본 정보 | task_id, user_id, scheduled_time |
| `content` | 메인 데이터 | content_id (=task_id), title, prompt_format, youtube_url |
| `content_setting` | 제작 설정 | media_mode, tts_voice, youtube_privacy |
| `task_queue` | 큐 상태 | task_id, type, status |
| `task_time_log` | 시간 기록 | task_id, type, start_time, end_time |
| `task_lock` | 동시성 제어 | task_type, locked_by, locked_at |

### 미디어 생성 옵션

| media_mode | 설명 | API | 비용 |
|------------|------|-----|------|
| `crawl` | 이미지 크롤링 | Whisk + ImageFX | 무료 |
| `dalle3` | AI 이미지 생성 | OpenAI DALL-E 3 | 유료 |
| `imagen3` | AI 이미지 생성 | Google Imagen 3 | 유료 |
| `sora2` | AI 비디오 생성 | OpenAI Sora | 유료 (고가) |

### 큐 상태 (task_queue.status)

- `waiting`: 대기 중 (워커가 처리 가능)
- `processing`: 처리 중 (락 획득됨)
- `completed`: 완료 (마지막 단계만)
- `failed`: 실패 (에러 로그 기록)
- `cancelled`: 취소됨 (워커 중지 시)

### 상태 전환 규칙

```
script waiting → processing → image waiting
image waiting → processing → video waiting
video waiting → processing → youtube waiting
youtube waiting → processing → completed
```

**⚠️ 중요**: 중간 단계(script/image/video)는 completed 없이 바로 다음 단계의 waiting으로 전환됩니다!
# CLAUDE 안내 (문서 링크)
통합 문서가 `md` 폴더에 정리되었습니다. 아래 링크로 최신 버전을 확인하세요.
- 워크스페이스 인덱스: `md/workspace/WORKSPACE_INDEX.md`
- 프론트엔드 통합본: `md/workspace/FRONTEND_GUIDE.md`
- 백엔드 통합본: `md/workspace/BACKEND_GUIDE.md`

아래는 기존에 적어둔 상세 메모(레거시)를 그대로 보관한 영역입니다.

---

