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

const title = '자동화 작업 재시도 후 로그가 제대로 어팬드되지 않음';

const summary = `자동화 페이지에서 실패한 작업을 재시도할 때 로그가 제대로 추가(append)되지 않는 문제.

주요 증상:
- 재시도 버튼 클릭 후 로그가 새로 시작되거나
- 이전 로그가 덮어씌워지거나
- 로그가 전혀 표시되지 않음

영향:
- 재시도 작업의 진행 상황을 확인할 수 없음
- 디버깅 어려움
- 사용자 경험 저하`;

const metadata = {
  severity: 'MEDIUM',
  priority: 'HIGH',
  category: 'automation-ui',
  source: 'automation page',
  error_type: 'Log Display',
  related_files: [
    'src/app/automation/page.tsx',
    'src/app/api/automation/retry/route.ts',
    'src/app/api/automation/logs/route.ts'
  ],
  full_content: `## 📋 기본 정보

- **발생일**: ${new Date().toLocaleString('ko-KR')}
- **심각도**: 🟡 **MEDIUM**
- **우선순위**: 🟠 **HIGH**
- **카테고리**: automation-ui
- **관련 파일**:
  - \`src/app/automation/page.tsx\`
  - \`src/app/api/automation/retry/route.ts\`
  - \`src/app/api/automation/logs/route.ts\`

## 증상

자동화 페이지에서 실패한 작업을 재시도할 때 로그가 제대로 어팬드(추가)되지 않음.

### 재현 방법

1. 자동화 페이지에서 작업 실행
2. 작업 실패 발생
3. "재시도" 버튼 클릭
4. 결과: 로그가 제대로 표시되지 않음

### 기대 동작

- 재시도 시 "--- 재시도 시작 ---" 같은 구분선 추가
- 이전 로그 유지하면서 새 로그 어팬드
- 실시간 로그 스트리밍 정상 작동

### 실제 동작

- 로그가 새로 시작되거나
- 이전 로그가 사라지거나
- 로그가 전혀 표시되지 않음

## 원인 분석

### 1. 재시도 시 로그 파일 초기화

\`\`\`typescript
// retry/route.ts (추정)
// 재시도 시 로그 파일을 truncate하거나 새로 생성
fs.writeFileSync(logPath, ''); // ❌ 기존 로그 삭제
\`\`\`

### 2. 프론트엔드 로그 상태 초기화

\`\`\`typescript
// automation/page.tsx (추정)
// 재시도 버튼 클릭 시
const handleRetry = () => {
  setLogs([]); // ❌ 로그 상태 초기화
  // ...
};
\`\`\`

### 3. 로그 폴링 offset 문제

\`\`\`typescript
// 로그 폴링 시 offset이 재시작되어 이전 로그를 다시 읽음
const fetchLogs = async () => {
  const res = await fetch(\`/api/automation/logs?id=\${taskId}&offset=0\`);
  // offset=0으로 시작하면 이전 로그부터 다시 읽음
};
\`\`\`

## 해결 방안

### 방안 1: 재시도 시 로그에 구분선 추가 (권장)

**백엔드 (retry/route.ts):**
\`\`\`typescript
export async function POST(request: NextRequest) {
  const { id } = await request.json();

  // 재시도 전 로그 파일에 구분선 추가
  const logPath = getLogPath(id);
  if (fs.existsSync(logPath)) {
    const separator = \`\\n\\n${'='.repeat(80)}\\n재시도 시작: \${new Date().toLocaleString('ko-KR')}\\n${'='.repeat(80)}\\n\\n\`;
    fs.appendFileSync(logPath, separator); // ✅ append 사용
  }

  // 재시도 로직...
}
\`\`\`

### 방안 2: 프론트엔드에서 로그 상태 유지

**프론트엔드 (automation/page.tsx):**
\`\`\`typescript
const handleRetry = async (taskId: string) => {
  // ❌ setLogs([]) 하지 않음

  // 구분선 추가
  setLogs(prev => [
    ...prev,
    {
      timestamp: new Date().toISOString(),
      message: '\\n--- 재시도 시작 ---\\n',
      level: 'info'
    }
  ]);

  // 재시도 API 호출
  await fetch('/api/automation/retry', {
    method: 'POST',
    body: JSON.stringify({ id: taskId })
  });

  // 로그 폴링은 계속 진행 (offset 유지)
};
\`\`\`

### 방안 3: 로그 offset 관리

\`\`\`typescript
// 재시도 시에도 offset 유지
const [logOffset, setLogOffset] = useState<Record<string, number>>({});

useEffect(() => {
  if (!selectedTitle?.id) return;

  const pollLogs = async () => {
    const currentOffset = logOffset[selectedTitle.id] || 0;

    const res = await fetch(
      \`/api/automation/logs?id=\${selectedTitle.id}&offset=\${currentOffset}\`
    );

    const data = await res.json();
    if (data.logs?.length > 0) {
      setLogs(prev => [...prev, ...data.logs]);
      setLogOffset(prev => ({
        ...prev,
        [selectedTitle.id]: currentOffset + data.logs.length
      }));
    }
  };

  const interval = setInterval(pollLogs, 1000);
  return () => clearInterval(interval);
}, [selectedTitle?.id, logOffset]);
\`\`\`

### 방안 4: 로그 파일 append 모드 보장

**백엔드 프로세스:**
\`\`\`python
# 로그 파일 open 시 'a' (append) 모드 사용
with open(log_file, 'a', encoding='utf-8') as f:
    f.write(f"[{timestamp}] {message}\\n")
    f.flush()  # 즉시 디스크에 쓰기
\`\`\`

## 구현 우선순위

1. **방안 1 + 2 조합** (가장 확실)
   - 백엔드: 재시도 시 구분선 추가
   - 프론트엔드: 로그 상태 유지

2. **방안 3** (offset 관리로 안정성 향상)

3. **방안 4** (로그 파일 append 보장)

## 체크리스트

- [ ] 재시도 API에서 로그 구분선 추가
- [ ] 프론트엔드 재시도 핸들러에서 setLogs([]) 제거
- [ ] 로그 offset 관리 로직 추가
- [ ] 백엔드 로그 파일 open 모드 확인 ('a' 모드)
- [ ] 재시도 후 로그 표시 테스트
- [ ] 여러 번 재시도해도 로그가 누적되는지 확인

## 테스트 시나리오

1. **기본 재시도 테스트**
   - 작업 실패 → 재시도 → 로그 누적 확인

2. **여러 번 재시도**
   - 3번 재시도 → 모든 로그가 순서대로 표시되는지 확인

3. **실시간 로그 스트리밍**
   - 재시도 중 로그가 실시간으로 어팬드되는지 확인

4. **페이지 새로고침 후 재시도**
   - 페이지 새로고침 → 재시도 → 로그 표시 확인

## 참고

- 현재: 재시도 후 로그가 제대로 어팬드되지 않음
- 사용자 피드백: "재시도한 후 로그가 제대로 어팬드가 안된다구"
- 우선순위 높음: 디버깅 및 모니터링에 중요
`
};

await conn.execute(
  `INSERT INTO bugs (
    id, type, title, summary, status,
    metadata,
    created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())`,
  [
    bugId,
    'bug',
    title,
    summary,
    'open',
    JSON.stringify(metadata)
  ]
);

console.log(`✅ 버그 등록 완료: ${bugId}`);
console.log(`🐛 타입: BUG`);
console.log(`📋 제목: ${title}`);
console.log(`🔗 URL: http://localhost:2000/admin/bugs`);

await conn.end();
