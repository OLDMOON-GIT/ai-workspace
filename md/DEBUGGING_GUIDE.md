# @디버깅해 - 자동 버그 처리 시스템

## 📋 개요

`@디버깅해`는 Claude가 워커 역할을 수행하여 버그를 자동으로 감지하고 처리하는 시스템입니다.

**핵심 기능:**
- 10초마다 MySQL bugs 테이블 자동 모니터링
- 미해결 버그 실시간 알림
- 버그 분석 및 자동 해결
- 해결 과정 DB에 자동 기록

---

## 🚀 사용 방법

### 1. 워커 시작

```
@디버깅해
```

Claude가 자동으로:
1. 알림 워커 시작 (백그라운드에서 10초마다 체크)
2. 현재 미해결 버그 목록 확인
3. 버그를 1개씩 분석 및 해결
4. 해결 완료 시 DB에 자동 마킹

### 2. 워커 동작 방식

**알림 워커 (`notification-worker.cjs`)**
- 10초 간격으로 MySQL `bugs` 테이블 조회
- `status != 'resolved' AND status != 'closed'` 조건으로 미해결 버그 확인
- 버그 개수 변경 시 자동 알림 (최대 5개 상세 표시)
- 백그라운드에서 계속 실행

**버그 처리 프로세스:**
1. 버그 상세 정보 확인 (id, title, summary, metadata)
2. 관련 파일 및 코드 분석
3. 근본 원인 파악
4. 해결책 적용 (코드 수정, 설정 변경 등)
5. DB 업데이트 (`status='resolved'`, `resolution_note` 기록)

---

## 📊 버그 처리 예시

### 예시 1: 코드 오류 수정

```markdown
버그: BTS-0000043 - UI check failed: az-smoke
원인: JSX 파싱 오류 (닫는 태그 누락)
해결: 코드 확인 결과 이미 수정됨
```

### 예시 2: 설정 문제

```markdown
버그: BTS-0000020 - PYTHONPATH import 실패
원인: 워커 프로세스가 재시작 안 됨
해결: 코드는 수정됨, az.bat 실행 시 자동 해결됨
```

### 예시 3: DB/코드 검증

```markdown
버그: BTS-0000040 - 상품 YouTube 설명 업로드 안 됨
분석:
  - DB 확인: prompt_format='product' ✅
  - 코드 확인: unified-worker.js:766 체크 로직 정상 ✅
해결: 코드 및 DB 모두 정상 확인
```

---

## 🗂️ DB 구조

### bugs 테이블

```sql
CREATE TABLE bugs (
  id VARCHAR(64) PRIMARY KEY,
  title TEXT NOT NULL,
  summary TEXT,
  status VARCHAR(32) NOT NULL,  -- open, in-progress, resolved, closed
  log_path TEXT,
  screenshot_path TEXT,
  video_path TEXT,
  trace_path TEXT,
  resolution_note TEXT,         -- 해결 방법 기록
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  assigned_to VARCHAR(64),
  metadata JSON
)
```

---

## 🛠️ 워커 스크립트

### notification-worker.cjs

**기능:**
- 10초마다 bugs 테이블 조회
- 미해결 버그 감지 및 알림
- 실시간 모니터링

**사용:**
```bash
cd mcp-debugger
node notification-worker.cjs
```

**출력 예시:**
```
╔══════════════════════════════════════════════════════════════╗
║           🔔 버그 알림 워커 (10초마다 체크)                  ║
║           DB: MySQL trend_video.bugs                         ║
╚══════════════════════════════════════════════════════════════╝

[오전 6:42:44] 🚨 미해결 버그: 11건
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔴 BTS-0000044
   📝 UI check failed: test-fail
   💬 HTTP 404 Not Found...
   📄 C:\Users\oldmoon\workspace\automation\artifacts\test-fail.log

[오전 6:55:06] ✅ 모든 버그 처리 완료!
```

### resolve-bug.cjs

**기능:**
- 특정 버그를 resolved로 마킹
- resolution_note 기록

**사용:**
```bash
cd mcp-debugger
node resolve-bug.cjs <bug_id> <resolution_note>
```

**예시:**
```bash
node resolve-bug.cjs BTS-0000044 "의도적인 404 테스트 케이스 - 정상 동작"
```

### list-open-bugs.cjs

**기능:**
- 현재 미해결 버그 목록 출력

**사용:**
```bash
cd mcp-debugger
node list-open-bugs.cjs
```

---

## 🔄 버그 상태 관리

### 상태 종류

1. **open**: 새로 등록된 버그
2. **in-progress**: 조사 중 또는 수정 중
3. **resolved**: 해결 완료
4. **closed**: 종료됨

### 상태 전환

```
open → in-progress → resolved
  ↓
closed
```

---

## ✅ 해결 기준

### 즉시 Resolved 처리

1. **코드 이미 수정됨** - 과거 로그, 현재 코드 정상
2. **설정 문제** - 재시작 시 자동 해결
3. **테스트 케이스** - 의도적인 실패 (예: 404 테스트)
4. **더미/테스트 버그** - 실제 버그 아님

### In-Progress 처리

1. **조사 필요** - 재현 단계 불명확
2. **외부 의존성** - 서버 재시작, 사용자 확인 필요
3. **기능 요청** - 버그가 아닌 기능 추가

---

## 📝 Resolution Note 작성 가이드

**좋은 예시:**
```
코드 및 DB 확인 완료. unified-worker.js:766에서 prompt_format 체크 정상 작동.
DB에 모든 상품이 prompt_format='product'로 저장됨. 실제 업로드 시 로그 확인 권장.
```

**포함 사항:**
- 원인 파악 결과
- 수정 내용 (파일명:라인번호)
- 검증 방법
- 추가 확인 사항 (옵션)

---

## 🎯 워크플로우

### Claude의 @디버깅해 실행 시

1. **워커 시작**
   ```
   [오전 6:42:44] 🚨 미해결 버그: 11건
   ```

2. **버그 1개씩 처리**
   ```
   BTS-0000044 분석 중...
   ✅ BTS-0000044 resolved (11건 → 10건)

   BTS-0000043 분석 중...
   ✅ BTS-0000043 resolved (10건 → 9건)
   ...
   ```

3. **완료**
   ```
   [오전 6:55:06] ✅ 모든 버그 처리 완료!
   ```

---

## 🔧 az.bat 연동

`az.bat` 실행 시 자동으로 MCP Debugger Server 시작:

```batch
echo [4/4] 자동 UI 체크 + 버그 리포트...
cd /d "%~dp0mcp-debugger"
start "MCP Debugger" cmd /k "npm run start"
```

**자동 실행 내용:**
- MCP Server 시작 (Claude Code 연동)
- automation/auto-suite.js 실행 (UI 체크)
- 버그 자동 등록

---

## 🚨 중요 규칙

### 1. 버그 해결 시 항상 마킹

❌ **잘못된 방법:**
```
"코드를 수정했습니다" (DB 업데이트 없음)
```

✅ **올바른 방법:**
```
1. 코드 수정
2. DB 업데이트 (resolve-bug.cjs 실행)
3. resolution_note 기록
```

### 2. 근본 원인 파악

단순히 증상만 보지 말고:
- DB 스키마 확인
- 실제 데이터 확인
- 코드 로직 확인
- 통합 테스트 실행

### 3. 검증 후 처리

추측하지 말고:
- 실제 파일 읽기
- DB 조회 실행
- 테스트 스크립트 실행

---

## 📚 관련 문서

- `md/bts/` - 개별 버그 문서
- `automation/bug-db.js` - 버그 DB API
- `automation/auto-suite.js` - 자동 UI 테스트

---

## 💡 팁

### 버그 우선순위

1. **CRITICAL** - 기능 완전 차단 (즉시 처리)
2. **HIGH** - 주요 기능 영향 (우선 처리)
3. **MEDIUM** - 일부 기능 영향
4. **LOW/MINOR** - UX 개선, 사소한 버그

### 효율적인 처리

- 비슷한 유형 버그 묶어서 처리
- 테스트/더미 버그는 일괄 처리
- 이미 해결된 버그는 빠르게 마킹

---

**마지막 업데이트:** 2025-12-03
**작성자:** Claude (Automated Debugging System)
