# 개발 가이드 (Claude 메모리)

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

## ⛔ DB 컬럼 삭제 시 주의사항 ⛔

**컬럼 삭제 요청 시 반드시 2곳을 같이 처리해야 함!**

1. **DB에서 컬럼 삭제** (ALTER TABLE 또는 테이블 재생성)
2. **sqlite.ts의 runMigrations()에서 해당 ADD COLUMN 코드도 삭제/주석처리**

안 그러면 서버 재시작할 때마다 `ALTER TABLE ADD COLUMN`으로 다시 생성됨!

```javascript
// ❌ 이 코드가 남아있으면 컬럼 삭제해도 다시 생김
try {
  db.exec(`ALTER TABLE xxx ADD COLUMN yyy TEXT;`);
} catch (e) {}

// ✅ 컬럼 삭제 시 이 코드도 같이 삭제하거나 주석처리
// try {
//   db.exec(`ALTER TABLE xxx ADD COLUMN yyy TEXT;`);
// } catch (e) {}
```

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