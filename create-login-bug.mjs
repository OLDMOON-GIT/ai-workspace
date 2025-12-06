#!/usr/bin/env node
import mysql from 'mysql2/promise';

const conn = await mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: 'trend2024',
  database: 'trend_video'
});

// Get next bug ID
await conn.execute(`UPDATE bug_sequence SET next_number = next_number + 1 WHERE id = 1`);
const [rows] = await conn.execute(`SELECT next_number FROM bug_sequence WHERE id = 1`);
const nextNum = rows[0].next_number;
const bugId = `BTS-${String(nextNum).padStart(7, '0')}`;

const title = 'Claude.ai 로그인 만료 시 자동 재로그인 프롬프트 필요';

const summary = `Claude.ai 세션이 만료되었을 때 에러 메시지만 표시되고, 사용자가 수동으로 setup_login.py를 실행해야 하는 불편함.

주요 증상:
- "Claude.ai login required. Please run setup_login.py first" 에러 메시지
- 사용자가 수동으로 Python 스크립트 실행 필요
- 자동화 작업이 중단되고 재개가 어려움

영향:
- 사용자 경험 저하
- 자동화 흐름이 중단됨
- 비기술 사용자는 해결 방법을 모를 수 있음`;

const metadata = {
  severity: 'MEDIUM',
  priority: 'MEDIUM',
  category: 'ux-improvement',
  source: 'backend claude api',
  error_type: 'Authentication',
  related_files: [
    'trend-video-backend/setup_login.py',
    'trend-video-backend/src/ai_aggregator/claude_client.py'
  ],
  full_content: `## 📋 기본 정보

- **발생일**: ${new Date().toLocaleString('ko-KR')}
- **심각도**: 🟡 **MEDIUM**
- **우선순위**: 🟡 **MEDIUM**
- **카테고리**: ux-improvement
- **관련 파일**:
  - \`trend-video-backend/setup_login.py\`
  - \`trend-video-backend/src/ai_aggregator/claude_client.py\`

## 증상

Claude.ai 세션이 만료되었을 때:

\`\`\`
[오전 7:24:53] [Claude] Failed to send question: Claude.ai login required.
Please run setup_login.py first to save your session.
\`\`\`

### 현재 동작

1. 에러 메시지만 콘솔에 출력
2. 사용자가 수동으로 \`python setup_login.py\` 실행 필요
3. 자동화 작업이 중단되고 실패 처리됨

### 문제점

- 비직관적: 사용자가 Python 스크립트를 직접 실행해야 함
- 자동화 중단: 작업이 중간에 멈추고 재개 불가
- 에러 복구 어려움: 어떻게 해결해야 할지 명확하지 않음

## 원인 분석

### 1. Claude.ai 세션 쿠키 만료

- 브라우저 세션 쿠키는 일정 시간 후 만료
- 현재는 만료 감지만 하고 자동 갱신 없음

### 2. 에러 핸들링 부족

\`\`\`python
# claude_client.py (추정)
if not session_cookie:
    raise Exception("Claude.ai login required. Please run setup_login.py first")
\`\`\`

에러만 던지고 복구 시도 없음

## 해결 방안

### 방안 1: 자동 로그인 프롬프트 (권장)

**백엔드에서 브라우저 자동 실행:**

\`\`\`python
# claude_client.py
import subprocess
import sys

def ensure_login():
    """Claude.ai 로그인 확인 및 자동 프롬프트"""
    if not is_session_valid():
        print("⚠️  Claude.ai 세션이 만료되었습니다.")
        print("🌐 브라우저를 열어 로그인해주세요...")

        # setup_login.py 자동 실행
        try:
            subprocess.run([sys.executable, "setup_login.py"], check=True)
            print("✅ 로그인 완료!")
            return True
        except Exception as e:
            print(f"❌ 로그인 실패: {e}")
            return False
    return True

# 사용
def send_message(message):
    if not ensure_login():
        raise Exception("로그인이 필요합니다")

    # ... 메시지 전송
\`\`\`

### 방안 2: 프론트엔드 알림

**에러 발생 시 프론트엔드에 알림:**

\`\`\`typescript
// 자동화 작업 중 에러 처리
if (error.message.includes('login required')) {
  // 모달 또는 알림 표시
  alert('⚠️ Claude.ai 로그인이 필요합니다.\\n\\n백엔드 콘솔에서 브라우저가 열립니다.');

  // 백엔드에 재로그인 요청
  await fetch('/api/claude/relogin', { method: 'POST' });
}
\`\`\`

### 방안 3: 세션 자동 갱신

**주기적으로 세션 유효성 확인:**

\`\`\`python
import schedule
import time

def refresh_session():
    """세션 갱신"""
    if should_refresh_session():
        print("🔄 Claude.ai 세션 갱신 중...")
        ensure_login()

# 1시간마다 세션 체크
schedule.every(1).hours.do(refresh_session)

while True:
    schedule.run_pending()
    time.sleep(60)
\`\`\`

### 방안 4: API 키 사용 (장기 해결책)

Claude API 키를 사용하여 브라우저 세션 의존성 제거:

\`\`\`python
import anthropic

client = anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY"))

message = client.messages.create(
    model="claude-3-5-sonnet-20241022",
    max_tokens=1024,
    messages=[
        {"role": "user", "content": "Hello, Claude"}
    ]
)
\`\`\`

**장점:**
- 세션 만료 없음
- 더 안정적
- 프로그래밍 방식으로 관리 가능

**단점:**
- API 비용 발생
- 환경 변수 설정 필요

## 구현 우선순위

1. **즉시 (방안 1)**: 자동 로그인 프롬프트 - 사용자 경험 개선
2. **단기 (방안 2)**: 프론트엔드 알림 추가 - 에러 가시성
3. **중기 (방안 3)**: 세션 자동 갱신 - 안정성 향상
4. **장기 (방안 4)**: API 키 전환 - 근본적 해결

## 체크리스트

- [ ] ensure_login() 함수 구현
- [ ] setup_login.py 자동 실행 로직 추가
- [ ] 프론트엔드에 로그인 필요 알림 표시
- [ ] 세션 유효성 주기 체크 (optional)
- [ ] API 키 방식 전환 검토 (optional)
- [ ] 로그인 실패 시 재시도 로직
- [ ] 에러 로그에 해결 방법 명시

## 테스트 시나리오

1. **세션 만료 상태 테스트**
   - 쿠키 삭제 → 자동화 실행 → 브라우저 프롬프트 확인

2. **자동 로그인 테스트**
   - setup_login.py 자동 실행 → 세션 저장 → 작업 재개

3. **프론트엔드 알림 테스트**
   - 로그인 에러 발생 → 알림 표시 확인

## 참고

- 현재 에러: "Claude.ai login required. Please run setup_login.py first"
- setup_login.py는 Playwright로 브라우저 열어서 수동 로그인 받음
- 세션 쿠키를 파일에 저장하여 재사용
- 사용자 피드백: "이게 필요하면 저걸 띄워" - 자동화 요구

## 예상 효과

- 🚀 사용자 경험 크게 개선
- ⏱️ 작업 중단 시간 최소화
- 🔄 자동화 안정성 향상
- 📉 수동 개입 횟수 감소
`
};

await conn.execute(
  `INSERT INTO bugs (
    id, title, summary, status,
    metadata,
    created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, NOW(), NOW())`,
  [
    bugId,
    title,
    summary,
    'open',
    JSON.stringify(metadata)
  ]
);

console.log(`✅ 버그 등록 완료: ${bugId}`);
console.log(`📋 제목: ${title}`);
console.log(`🔗 URL: http://localhost:2000/admin/bugs`);

await conn.end();
