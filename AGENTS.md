# AI 개발 에이전트 가이드 (범용)

> 이 문서는 Claude, Codex, Gemini 등 모든 AI 에이전트가 사용하는 공통 가이드입니다.

---

## 🚨 시작 키워드 - 자동 버그 처리 시작

**다음 키워드 중 하나를 입력하면 즉시 버그 처리 작업 시작:**
- `개발가이드숙지`, `개발가이드`, `개발`
- `dev`, `debug`, `start`

### 시작 시 할 일
1. 이 문서(AGENTS.md) 읽기
2. MySQL bugs 테이블에서 open 상태 버그 확인
3. 가장 오래된 버그부터 순차 처리
4. 사용자에게 현재 상태 보고 후 작업 착수

---

## 📋 핵심 규칙

### 1. 버그/SPEC 등록 필수
**버그 발견 또는 기능 구현 시 반드시 DB에 먼저 등록!**

```sql
-- 버그 등록
INSERT INTO bugs (id, title, summary, type, status, metadata, created_at, updated_at)
VALUES ('BTS-0000XXX', '버그 제목', '버그 요약', 'bug', 'open', '{}', NOW(), NOW());

-- SPEC 등록
INSERT INTO bugs (id, title, summary, type, status, metadata, created_at, updated_at)
VALUES ('BTS-0000XXX', 'SPEC 제목', 'SPEC 내용', 'spec', 'open', '{}', NOW(), NOW());

-- 해결 후
UPDATE bugs SET status = 'resolved', resolution_note = '해결 내용', updated_at = NOW()
WHERE id = 'BTS-0000XXX';
```

### 2. 명령어 직접 실행
**파일 복사, 폴더 생성, git 명령어 등은 사용자에게 시키지 말고 직접 실행!**

### 3. 코드 수정 전 반드시 확인
**코드를 읽지 않고 수정 제안하지 말 것!**

---

## 🗄️ 프로젝트 정보

### 관리자 정보
- 이메일: moony75@gmail.com
- 작업공간: C:\Users\oldmoon\workspace

### MySQL 접속
- Host: localhost
- User: root
- Password: trend2024
- Database: trend_video

### Gmail SMTP (알림 발송용)
- 계정: moony75@gmail.com
- 앱 비밀번호: vpxj gajp qsnm txfr
- 호스트: smtp.gmail.com
- 포트: 587

---

## 🔑 통합 키 시스템

**핵심: task_id = content_id (동일한 UUID)**

### 테이블 구조
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
└── input_tokens, output_tokens

content_setting (제작 설정) - content_id = task_id
├── script_mode, media_mode, tts_voice, tts_speed
└── tags, settings, youtube_privacy
```

### ⛔ task 테이블 컬럼 추가 금지!
task 테이블은 최소화 상태 유지. 설정 컬럼은 content/content_setting에!

---

## 📝 코딩 컨벤션

### 네이밍 규칙
| 구분 | 컨벤션 | 예시 |
|------|--------|------|
| JSON 키 | camelCase | `{ "sceneNumber": 1 }` |
| JS/TS | camelCase | `const taskId = queue.taskId;` |
| DB 컬럼 | snake_case | `SELECT task_id FROM task` |
| Python | snake_case | `scene_number = data["sceneNumber"]` |

### SQL SELECT 시 AS alias로 변환
```sql
SELECT t.task_id as taskId,
       t.user_id as userId,
       c.prompt_format as promptFormat
FROM task t JOIN content c ON t.task_id = c.content_id
```

### MySQL 함수 사용 (frontend)
```typescript
// ✅ 올바른 사용
import { getAll, getOne, run } from '@/lib/mysql';
const rows = await getAll<any>('SELECT * FROM task');
const row = await getOne<any>('SELECT * FROM task WHERE task_id = ?', [id]);
await run('UPDATE task SET status = ?', ['completed']);

// ❌ query 함수 없음!
// ❌ better-sqlite3 사용 금지!
```

---

## 🚨 절대 수정 금지 규칙

### 쿠팡 딥링크 관련 (수익과 직결!)
1. 딥링크 없으면 상품 저장 불가
2. 딥링크 생성 실패 시 해당 상품 스킵
3. 원본 URL은 딥링크가 아님!

```sql
-- 딥링크 필터링 조건 (절대 삭제 금지!)
AND deep_link IS NOT NULL
AND deep_link != ''
AND deep_link LIKE '%link.coupang.com/%'
AND deep_link NOT LIKE '%/re/AFFSDP%'
AND deep_link NOT LIKE '%?lptag=%'
```

### 쿠팡 API 서명 datetime 형식
```javascript
// ✅ 올바른: yymmddTHHMMSSZ
const datetime = `${year}${month}${day}T${hours}${minutes}${seconds}Z`;

// ❌ 잘못된: ISO 형식 절대 사용 금지!
```

---

## 🐛 버그 처리 시스템

### 워커 스크립트 (mcp-debugger 폴더)
```bash
# 알림 워커 시작 (백그라운드)
cd mcp-debugger && node notification-worker.cjs

# 버그 목록 확인
node list-open-bugs.cjs

# 버그 개수만 확인 (토큰 절약)
node check-bug-count.cjs

# 버그 해결 처리
node resolve-bug.cjs <bug_id> "<해결 내용>"
```

### 버그 상태
- **open**: 새로 등록됨
- **in-progress**: 처리 중
- **resolved**: 해결 완료
- **closed**: 종료됨

### 처리 순서
1. 버그 분석 (관련 파일, 코드 확인)
2. 근본 원인 파악
3. 코드 수정 또는 설정 변경
4. `resolve-bug.cjs`로 DB 업데이트
5. resolution_note에 해결 내용 기록

### SPEC (type='spec') 처리
- **SPEC은 실제로 구현해야 함!**
- closed 처리 금지
- 코드 작성 완료 후 resolved 처리

---

## 🗂️ 폴더 구조

```
workspace/
├── trend-video-frontend/    # Next.js 프론트엔드
├── trend-video-backend/     # Python 백엔드
├── mcp-debugger/           # 버그 처리 워커
├── automation/             # 자동화 스크립트
├── md/                     # 문서
│   ├── DEBUGGING_GUIDE.md
│   └── workspace/specs/    # SPEC 문서
├── CLAUDE.md               # Claude 전용 가이드
├── AGENTS.md               # 범용 AI 가이드 (이 파일)
└── schema-mysql.sql        # DB 스키마
```

---

## 📚 참고 문서

- `md/DEBUGGING_GUIDE.md` - 디버깅 시스템 상세 가이드
- `md/workspace/specs/` - 각종 SPEC 문서
- `schema-mysql.sql` - MySQL 스키마 정의

---

**마지막 업데이트:** 2025-12-04
