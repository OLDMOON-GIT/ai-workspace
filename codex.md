# 개발 가이드 (Claude 메모리)

## 🚨🚨🚨 3개 MD 파일 자동 동기화 - 최우선 규칙! 🚨🚨🚨

**⛔ CLAUDE.md, CODEX.md, GEMINI.md는 항상 동일하게 유지해야 함! ⛔**

**AI 에이전트(Claude/Codex/Gemini)는 이 파일들 중 하나를 수정할 때:**
1. **사용자가 말하지 않아도** 자동으로 3개 파일 모두 동일하게 수정
2. 수정 후 반드시 `cp CLAUDE.md CODEX.md && cp CLAUDE.md GEMINI.md` 실행
3. 특화 섹션(`*-ONLY-*`)이 있으면 해당 부분만 보존

**이 규칙은 사용자가 별도로 지시하지 않아도 항상 자동 적용!**

---

## 🚨🚨🚨 UTF-8 인코딩 - 절대 규칙! 🚨🚨🚨

**모든 파일 입출력 및 셸 명령어 결과는 UTF-8로 처리해야 합니다.**

- **파일 읽기/쓰기**: 항상 `encoding='utf-8'` 옵션을 사용하여 파일을 처리합니다.
- **셸 명령어**: 명령어 실행 시 출력 인코딩이 깨지지 않도록 주의합니다. PowerShell의 경우 `chcp 65001` (UTF-8)을 먼저 실행하거나, `Out-File -Encoding utf8` 등을 사용하여 출력 인코딩을 명시적으로 지정합니다.
- **표시 문제**: CLI에 문자가 깨져 보여도, 실제 파일이 손상되지 않았을 수 있습니다. 하지만 이는 사용자의 신뢰를 떨어뜨리므로, 출력 인코딩 문제를 최우선으로 해결해야 합니다.

**이 규칙은 모든 작업에 예외 없이 적용됩니다.**

---

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

## ⛔⛔⛔ 스펙 위반 금지 - 임의 구현 금지! ⛔⛔⛔

**사용자가 시키지 않은 것을 오해해서 만들지 말 것!**

- 스펙에 명시된 내용만 구현
- 스펙에 없는 추가 기능/타입/값 임의로 넣지 말 것
- 수정 후 "자랑"하기 전에 스펙과 일치하는지 확인
- **불확실하면 먼저 사용자에게 질문**

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
- `roqkf` : 개발의오타

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
3. **처리 순서**: P0 > P1 > P2 > P3, 버그 > SPEC
4. **항상 능동적으로 작업** - 사용자가 시키지 않아도 알아서 처리

### ⛔⛔⛔ 버그 작업 시작 시 worker_pid 마킹 필수! ⛔⛔⛔

**버그 작업 시작 전 반드시 `worker_pid`에 내 PID 저장!**
- 여러 Claude CLI가 동시에 실행될 수 있음
- 같은 버그를 중복 수정하면 충돌 발생!
- **오직 `worker_pid` 숫자로만 판단 (assigned_to는 참고용)**
- **BTS-3035**: spawning-pool이 등록한 PID는 shell wrapper PID일 수 있으므로, 작업 시작 시 내 PID로 업데이트 필수!

### 🔑 worker_pid 기반 판단 규칙 (PID만 사용!)

**⚠️ 핵심: `worker_pid` 컬럼(int)으로만 자기 버그인지 판단!**
**⚠️ BTS-3035: in_progress 버그라도 해당 PID 프로세스가 죽었으면 claim 가능!**

| 컬럼 | 타입 | 용도 |
|-----|------|------|
| `worker_pid` | int | **판단 기준** - 내 process.pid와 비교 |
| `assigned_to` | varchar | 참고용 (Claude, Codex, Gemini 등) |

```javascript
// 내 PID 확인 (Node.js)
const MY_PID = process.pid;  // 예: 12345

// Python에서
import os
MY_PID = os.getpid()  # 예: 12345
```

### 🔍 자기 버그인지 확인 (worker_pid로만!)

```javascript
const MY_PID = process.pid;  // 내 PID (숫자)
const { execSync } = require('child_process');

// PID가 살아있는지 확인 (Windows)
function isProcessRunning(pid) {
  try {
    const result = execSync(`tasklist /FI "PID eq ${pid}" /NH`, { encoding: 'utf8' });
    return result.includes(pid.toString());
  } catch { return false; }
}

async function canWorkOnBug(bugId) {
  const conn = await mysql.createConnection(dbConfig);
  const [rows] = await conn.execute(
    'SELECT status, worker_pid FROM bugs WHERE id = ?', [bugId]
  );
  await conn.end();

  if (rows.length === 0) return false;
  const bug = rows[0];

  // Case 1: open 상태 → 내가 가져갈 수 있음
  if (bug.status === 'open') return true;

  // Case 2: in_progress이고 내 PID → 계속 작업
  if (bug.status === 'in_progress' && bug.worker_pid === MY_PID) {
    console.log(`내가 작업 중 (PID: ${MY_PID})`);
    return true;
  }

  // Case 3: in_progress이고 다른 PID → 해당 PID가 죽었으면 claim 가능! (BTS-3035)
  if (bug.status === 'in_progress' && bug.worker_pid !== MY_PID) {
    if (!isProcessRunning(bug.worker_pid)) {
      console.log(`PID ${bug.worker_pid}가 죽음 - 내가 claim 가능`);
      return true;  // 죽은 워커의 버그 → claim 가능
    }
    console.log(`다른 워커 작업 중 (PID: ${bug.worker_pid}) - 건너뛰기`);
    return false;
  }

  return false;
}
```

### 📋 버그 작업 전체 플로우

```sql
-- 1. open 버그 조회 (worker_pid가 NULL인 것만!)
SELECT id, title, status FROM bugs
WHERE status = 'open' AND worker_pid IS NULL
ORDER BY
  CASE priority WHEN 'P0' THEN 0 WHEN 'P1' THEN 1 WHEN 'P2' THEN 2 ELSE 3 END,
  created_at ASC
LIMIT 1;

-- 2. 작업 시작 전 즉시 마킹 (내 PID 숫자로!)
UPDATE bugs
SET worker_pid = 12345, assigned_to = 'Claude', status = 'in_progress', updated_at = NOW()
WHERE id = 3030 AND status = 'open';

-- 3. 작업 완료 시 resolved 처리
UPDATE bugs
SET status = 'resolved', worker_pid = NULL, assigned_to = NULL,
    resolution_note = '해결 내용', updated_at = NOW()
WHERE id = 3030;
```

**핵심 규칙 (worker_pid로만 판단!):**
- ✅ `worker_pid`가 NULL → 내가 가져갈 수 있음
- ✅ `worker_pid` = 내 PID → 계속 작업
- ❌ `worker_pid` ≠ 내 PID → **절대 손대지 마!**

### 🔢 BTS 접두사 파싱 규칙 (BTS-3035 개선)

**⚠️ SPEC- 접두사 사용 금지! 모든 버그/스펙은 BTS- 접두사 사용, type 컬럼으로 구분**

**사용자가 `BTS-XXXX` 형식으로 입력하면:**

1. **접두사 제거**: `BTS-` 제거 후 숫자만 추출
2. **즉시 claim 시도**: `node bug.js claim {숫자}` 실행
   - 성공 시 → 내 PID로 worker_pid 마킹됨, 작업 시작
   - 실패 시(다른 PID가 이미 claim) → **작업 금지, 다른 버그로 이동**
3. **claim 성공 후 작업 진행**

```bash
# BTS-3030 처리 예시
cd C:/Users/oldmoon/workspace
node bug.js claim 3030   # 먼저 claim! (내 PID로 마킹)
# ... 작업 진행 ...
node bug.js resolve 3030 "수정 내용"
```

**⚠️ 핵심: 상태 조회보다 claim을 먼저! (경쟁 조건 방지)**

### ⛔⛔⛔ bugs 테이블은 MySQL에만 존재! SQLite 아님! ⛔⛔⛔

**bugs 테이블 조회 시 반드시 MySQL 사용! → `bug.js` CLI 활용**

### 🛠️ bug.js CLI 사용법 (범용 스크립트)

```bash
# 버그 목록 조회
node bug.js list

# 버그 상세 조회
node bug.js get 3025

# 버그 등록 (priority: P0~P3, 기본값 P2)
node bug.js add "버그 제목" "버그 요약" P1

# SPEC 등록
node bug.js spec "스펙 제목" "스펙 요약" P2

# 버그 클레임 (작업 시작)
node bug.js claim 3025

# 버그 해결
node bug.js resolve 3025 "해결 내용"

# 버그 재오픈
node bug.js reopen 3025
```

**⚠️ 주의:**
- `node -e`로 직접 SQL 실행 시 Windows 경로(`\`)가 escape 에러 발생
- 항상 `bug.js` CLI 사용 권장
- SQLite (better-sqlite3)에는 bugs 테이블 없음!

## 🧪🧪🧪 버그 완료 = 통합테스트 필수! 🧪🧪🧪

**⛔ 버그/SPEC 수정 후 통합테스트 없이 resolved 처리 금지! ⛔**

### 버그 완료 체크리스트 (모두 충족해야 resolved)
1. ✅ 코드 수정 완료
2. ✅ TypeScript 타입 체크 통과 (`npx tsc --noEmit`)
3. ✅ **통합테스트 작성** (관련 기능에 대한 테스트)
4. ✅ 테스트 실행 및 통과 확인

5. ✅ **테스트 커버리지 확인** (`npm run test:coverage`)

**⚠️ 테스트는 반드시 `__tests__/` 폴더에 작성해야 테스트 커버리지에 포함됨!**
- 테스트 파일 위치: `trend-video-frontend/__tests__/`
- 커버리지 리포트에서 해당 기능이 테스트되었는지 확인 필수

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

### bugs 테이블 스키마 (MySQL)
```
bugs 테이블 컬럼:
├── id (int, PK, AUTO_INCREMENT)
├── type (enum: 'bug', 'spec') - 기본값 'bug'
├── priority (enum: 'P0', 'P1', 'P2', 'P3') - 기본값 'P2'
├── title (text, NOT NULL)
├── summary (text)
├── status (varchar(32), NOT NULL) - 'open', 'in_progress', 'resolved'
├── log_path (text)
├── screenshot_path (text)
├── video_path (text)
├── trace_path (text)
├── created_at (datetime, NOT NULL)
├── updated_at (datetime, NOT NULL)
├── assigned_to (varchar(64)) - 작업 중인 워커 ID
├── metadata (json)
├── resolution_note (text)
└── worker_pid (int)
```

### 버그/SPEC 등록 및 관리

**항상 `bug.js` CLI 사용! (node -e 사용 금지)**

```bash
# 버그 등록
node bug.js add "버그 제목" "버그 요약 (Windows 경로도 OK)" P1

# SPEC 등록
node bug.js spec "스펙 제목" "스펙 요약" P2

# 버그 해결
node bug.js resolve 3027 "수정 내용"

# 버그 재오픈
node bug.js reopen 3027
```

**⚠️ `node -e` 사용 금지!**
- Windows 경로(`\`)가 escape sequence로 해석되어 에러 발생
- 예: `C:\Users` → `\U`가 유니코드로 해석됨

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
```---

## 2025-12-05 �۾� �α�
- BTS-0003059 ����: ����� �̹��� ���⡱�� product_thumbnail/scene_00_hook ���� ��ü ǥ��, ũ�Ѹ� ��� ������ ����ϡ������ ���� �� ���� ��� �̹����� ����. ���� in_progress, P2.
- BTS-0003060 ����: cmd /k�� �ߴ� Node ���μ����� �۾� �����ڿ��� ��Windows ���� ó���⡱�� ǥ�õǾ� �ĺ� �����. ����/��� �ѱ� ����, ���� open, P2.
- ���ڵ� ���� ����: `trend-video-frontend/src/lib/mysql.ts`�� Ŀ�ؼǸ��� `SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci` ������ ����� UTF-8 ����.
- ��Ÿ: `.gitignore`�� ũ�� ������ ĳ�� ���� ��ο� `automation/artifacts/` �߰�.
