# 개발 가이드 (Claude 메모리)

## 🚨🚨🚨 CLAUDE.md 동기화 필수! 🚨🚨🚨

**CLAUDE.md를 수정할 때 반드시 CODEX.md와 GEMINI.md에도 동일하게 복사해야 함!**

### 동기화 전 diff 확인 필수!

```bash
# 1. 동기화 전 각 파일의 차이점 확인
diff CLAUDE.md CODEX.md
diff CLAUDE.md GEMINI.md

# 2. 특화 내용이 없으면 단순 복사
cp CLAUDE.md CODEX.md && cp CLAUDE.md GEMINI.md

# 3. 특화 내용이 있으면 수동으로 병합 (아래 섹션 참고)
```

### 에이전트별 특화 섹션 (동기화 시 보존!)

각 파일에 아래 특화 섹션이 있으면 **절대 덮어쓰지 말고 보존**해야 함:

| 파일 | 특화 섹션 표시 |
|---|---|
| CLAUDE.md | `<!-- CLAUDE-ONLY-START -->` ~ `<!-- CLAUDE-ONLY-END -->` |
| CODEX.md | `<!-- CODEX-ONLY-START -->` ~ `<!-- CODEX-ONLY-END -->` |
| GEMINI.md | `<!-- GEMINI-ONLY-START -->` ~ `<!-- GEMINI-ONLY-END -->` |

**동기화 시 특화 섹션 처리 방법:**
1. 먼저 `diff`로 차이점 확인
2. 특화 섹션(`*-ONLY-*`)이 있으면 해당 내용 백업
3. 공통 내용만 복사
4. 특화 섹션 복원

- CODEX.md: OpenAI Codex용
- GEMINI.md: Google Gemini용
- **공통 내용은 동일하게, 특화 내용은 각자 보존!**

**한글로 표현 필수 - 매우중요**

## ⛔⛔⛔ Node.js 프로세스 전체 종료 금지! ⛔⛔⛔

**`taskkill /F /IM node.exe` 또는 모든 node 프로세스를 죽이는 명령 절대 금지!**

- Codex, Gemini 등 다른 AI 에이전트도 Node.js로 실행 중
- 전체 node 프로세스 종료 시 모든 AI 에이전트가 죽음
- **특정 프로세스만 종료해야 할 경우**: PID를 확인하고 해당 PID만 종료

```bash
# ❌ 절대 금지!
taskkill /F /IM node.exe
pkill node
killall node

# ✅ 올바른 방법: 특정 PID만 종료
tasklist | findstr node     # PID 확인
taskkill /PID 12345 /F      # 특정 PID만 종료
```

---

## 🚨🚨🚨 "개발가이드숙지" 키워드 - 자동 BTS 작업 시작 🚨🚨🚨

**사용자가 다음 중 하나를 입력하면 즉시 아래 작업을 수행:**
- `개발가이드숙지`
- `개발가이드`
- `개발`
- `dev`

1. **CLAUDE.md 읽기** (자동으로 됨)
2. **BTS 워커 백그라운드 시작**:
   ```bash
   cd mcp-debugger && node notification-worker.cjs &
   ```
3. **open 버그 목록 조회** 후 가장 오래된 것부터 순차 처리 시작
4. **사용자에게 현재 상태 간략히 보고** 후 바로 작업 착수

**핵심: 사용자가 아무 말 안해도 자동으로 버그 수정 작업 시작!**

---

## 🚨🚨🚨 가장 중요 - 자동 버그/SPEC 처리 🚨🚨🚨

**Claude 시작 시 할 일이 없으면 자동으로 버그 수정과 SPEC 구현을 진행한다!**

1. **세션 시작 시** → `bugs` 테이블에서 open 상태 버그/SPEC 확인
2. **사용자 지시 없으면** → 가장 오래된 open 버그부터 순차 처리
3. **처리 순서**: P1 > P2 > P3, 버그 > SPEC
4. **항상 능동적으로 작업** - 사용자가 시키지 않아도 알아서 처리

```sql
-- open 버그/SPEC 확인
SELECT id, title, status FROM bugs WHERE status = 'open' ORDER BY created_at ASC;
```

## 🧪🧪🧪 버그 완료 = 통합테스트 필수! 🧪🧪🧪

**⛔ 버그/SPEC 수정 후 통합테스트 없이 resolved 처리 금지! ⛔**

### 버그 완료 체크리스트 (모두 충족해야 resolved)
1. ✅ 코드 수정 완료
2. ✅ TypeScript 타입 체크 통과 (`npx tsc --noEmit`)
3. ✅ **통합테스트 작성** (관련 기능에 대한 테스트)
4. ✅ 테스트 실행 및 통과 확인

### 통합테스트 작성 위치
```
trend-video-frontend/__tests__/
├── api/           # API 라우트 테스트
├── components/    # 컴포넌트 테스트
├── integration/   # 통합 테스트
└── unit/          # 유닛 테스트
```

### 테스트 작성 예시
```typescript
// __tests__/integration/bug-BTS-XXXXXXX.test.ts
describe('BTS-XXXXXXX: 버그 제목', () => {
  it('수정된 기능이 정상 동작해야 함', async () => {
    // 테스트 코드
  });
});
```

### 테스트 실행
```bash
cd trend-video-frontend
npm test -- --testPathPattern="bug-BTS-XXXXXXX"
```

**핵심: 테스트 없는 버그 수정은 미완료!**

## 🚨🚨🚨 최우선 규칙 - 버그/SPEC 등록 🚨🚨🚨

**버그 발견 또는 기능 구현 시 반드시 DB에 먼저 등록!**

1. **버그 발견 즉시** → `bugs` 테이블에 INSERT (status='open')
2. **SPEC 작업 시작 전** → `bugs` 테이블에 INSERT (type='spec', status='open')
3. **수정 완료 후** → status='resolved'로 UPDATE
4. **등록 없이 수정만 하면 안 됨!** 무조건 등록 먼저!

### 🤖 모델 변경 (Model Change) - 자동 수정
모델 변경과 관련된 작업은 사용자에게 묻지 않고 자동으로 수정 및 적용합니다.

```sql
-- 버그 등록 예시
INSERT INTO bugs (id, title, summary, status, metadata, created_at, updated_at)
VALUES ('BTS-0000XXX', '버그 제목', '버그 요약', 'open', '{}', NOW(), NOW());

-- 해결 후
UPDATE bugs SET status = 'resolved', updated_at = NOW() WHERE id = 'BTS-0000XXX';
```

## 🐛 @디버깅해 명령어

사용자가 `@디버깅해`라고 하면 자동 버그 처리 시스템 실행:

1. **가이드 확인**: `md/DEBUGGING_GUIDE.md` 읽기
2. **워커 시작**: `cd mcp-debugger && node notification-worker.cjs &` (백그라운드)
3. **버그 목록 확인**: `node list-open-bugs.cjs` 또는 MySQL 직접 조회
4. **버그 1개씩 처리**: 분석 → 수정 → `node resolve-bug.cjs <bug_id> "<해결내용>"` 실행
5. **SPEC(type='spec')도 구현 필수** - closed 처리 금지, 실제 코드 작성 후 resolved

## 프로젝트 정보
- 관리자: moony75@gmail.com
- 작업공간: C:\Users\oldmoon\workspace

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
- task_id, status, user_id, created_at, updated_at
- **설정 컬럼(category, tags, channel, script_mode 등)은 content/content_setting에!**
- **sqlite.ts에 ALTER TABLE task ADD COLUMN 절대 추가하지 마세요!**

```
task (최소화) - ID + status + user_id
├── task_id (PK)
├── status (draft/active/completed/archived/cancelled)
├── user_id
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
├── type, status, created_at, started_at, completed_at
├── user_id, error, elapsed_time
└── script/image/video/youtube_completed_at

task_schedule (예약 스케줄) - schedule_id (PK)
├── task_id, scheduled_time, status
└── created_at, updated_at
```

### 폴더 구조
```
tasks/{task_id}/
  ├── story.json
  ├── video.mp4
  └── thumbnail.png
```

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
- Password: `trend2024`
- Database: `trend_video`

### 스키마 변경 시
1. `schema-mysql.sql` 수정
2. **양쪽 서버에서** `.schema_hash` 파일 삭제
3. `server.bat` 실행하면 자동 재적용

```bash
# 스키마 강제 재적용 (양쪽 서버 모두 실행)
del .schema_hash
server.bat
```

### ⛔ 컬럼 추가/삭제 시 주의
- **schema-mysql.sql만 수정** (mysql.ts의 runMigrations()는 비워둠)
- 양쪽 서버 모두 `.schema_hash` 삭제 필요

### ⛔ MySQL 함수 사용 규칙 (frontend)
**`@/lib/mysql`에서 제공하는 함수만 사용! `query` 함수는 없음!**

```typescript
// ✅ 올바른 사용법
import { getAll, getOne, run } from '@/lib/mysql';

const rows = await getAll<any>('SELECT * FROM task');     // 여러 행 조회
const row = await getOne<any>('SELECT * FROM task WHERE task_id = ?', [id]);  // 단일 행
await run('UPDATE task SET status = ? WHERE task_id = ?', ['completed', id]); // INSERT/UPDATE/DELETE

// ❌ 잘못된 사용법 (query 함수 없음!)
import { query } from '@/lib/mysql';  // 에러 발생!

// ❌ better-sqlite3 절대 사용 금지!
import Database from 'better-sqlite3';  // 이 프로젝트는 MySQL 사용!
```

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