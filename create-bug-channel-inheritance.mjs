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

const title = '숏폼 YouTube 채널 강제 상속 문제';

const summary = `숏폼이 롱폼에서 변환될 때 롱폼의 YouTube 채널을 강제로 상속받아 사용자 설정 무시.

주요 문제:
- 롱폼 채널 A, 숏폼 채널 B로 설정해도 채널 A에 업로드됨
- parentChannelId가 사용자 channelId보다 우선
- 숏폼 전용 채널 설정 불가능

영향:
- 사용자가 의도하지 않은 채널에 업로드
- 채널 전략 수립 불가`;

const metadata = {
  severity: 'HIGH',
  priority: 'P1',
  category: 'youtube-channel',
  source: 'youtube upload',
  error_type: 'Logic Error',
  related_files: [
    'trend-video-frontend/src/app/api/youtube/upload/route.ts'
  ],
  full_content: `## 📋 기본 정보

- **발생일**: ${new Date().toLocaleString('ko-KR')}
- **심각도**: 🔴 **HIGH**
- **우선순위**: 🔴 **P1**
- **카테고리**: youtube-channel
- **관련 파일**:
  - \`trend-video-frontend/src/app/api/youtube/upload/route.ts\` (355-356번 줄)

## 증상

숏폼을 특정 YouTube 채널에 업로드하려 해도, 롱폼의 채널로 강제 업로드됨.

### 재현 방법

1. 롱폼 영상 생성 → YouTube 채널 A에 업로드
2. 롱폼→숏폼 변환
3. 숏폼을 YouTube 채널 B에 업로드 설정
4. **실제로는 채널 A에 업로드됨**

### 기대 동작

- 사용자가 선택한 채널(B)에 업로드
- 롱폼과 숏폼의 독립적인 채널 설정

### 실제 동작

- 롱폼 채널(A)이 강제 적용됨
- 사용자 설정 무시

## 원인 분석

### 문제 코드

\`\`\`typescript
// route.ts:182-193
// 롱폼 채널 조회
const [taskRows] = await db.query(
  'SELECT channel FROM task WHERE task_id = ?',
  [sourceContentId]
);

if (taskRows.length > 0 && taskRows[0].channel) {
  parentChannelId = taskRows[0].channel;
  console.log('[롱폼 채널 발견]', parentChannelId);
}

// route.ts:355-356
// 숏폼이 롱폼에서 파생된 경우 롱폼 채널 우선 사용
let effectiveChannelId = parentChannelId || channelId;
console.log('[최종 채널]', effectiveChannelId, '(parent:', parentChannelId, 'user:', channelId, ')');
\`\`\`

### 근본 원인

**잘못된 우선순위 로직**:
\`\`\`typescript
effectiveChannelId = parentChannelId || channelId;
// ❌ 롱폼 채널이 있으면 무조건 사용
// ❌ 사용자가 명시적으로 다른 채널 선택해도 무시
\`\`\`

**올바른 로직**:
\`\`\`typescript
effectiveChannelId = channelId || parentChannelId;
// ✅ 사용자 선택 우선
// ✅ 사용자가 선택 안하면 롱폼 채널 fallback
\`\`\`

## 해결 방안

### 1. 우선순위 변경 (권장)

\`\`\`typescript
// 사용자 선택 채널을 우선으로
let effectiveChannelId = channelId || parentChannelId;

console.log('[채널 선택]', {
  user: channelId,
  parent: parentChannelId,
  effective: effectiveChannelId
});

if (!effectiveChannelId) {
  return NextResponse.json(
    { error: 'YouTube 채널을 선택해주세요.' },
    { status: 400 }
  );
}
\`\`\`

### 2. 명시적 채널 선택 옵션 추가

UI에서 사용자에게 선택권 제공:

\`\`\`typescript
// API 요청 body
{
  videoId: '...',
  channelId: 'UC...', // 사용자가 명시적으로 선택
  useParentChannel: false // 롱폼 채널 사용 여부
}

// 서버 로직
let effectiveChannelId: string;

if (body.useParentChannel && parentChannelId) {
  effectiveChannelId = parentChannelId;
  console.log('[롱폼 채널 사용]', effectiveChannelId);
} else if (body.channelId) {
  effectiveChannelId = body.channelId;
  console.log('[사용자 선택 채널]', effectiveChannelId);
} else {
  return NextResponse.json(
    { error: 'YouTube 채널을 선택해주세요.' },
    { status: 400 }
  );
}
\`\`\`

### 3. 프론트엔드 UI 개선

\`\`\`tsx
// 숏폼 업로드 모달
<div className="mb-4">
  <label className="block text-sm font-medium mb-2">
    YouTube 채널 선택
  </label>

  {parentChannelId && (
    <div className="mb-2 p-3 bg-blue-50 rounded">
      <label className="flex items-center gap-2">
        <input
          type="radio"
          name="channel"
          value={parentChannelId}
          checked={useParentChannel}
          onChange={() => setUseParentChannel(true)}
        />
        <span>롱폼과 같은 채널 사용 ({parentChannelName})</span>
      </label>
    </div>
  )}

  <div className="mb-2">
    <label className="flex items-center gap-2">
      <input
        type="radio"
        name="channel"
        checked={!useParentChannel}
        onChange={() => setUseParentChannel(false)}
      />
      <span>다른 채널 선택</span>
    </label>
  </div>

  {!useParentChannel && (
    <select
      value={selectedChannelId}
      onChange={(e) => setSelectedChannelId(e.target.value)}
      className="w-full border rounded px-3 py-2"
    >
      <option value="">채널 선택...</option>
      {channels.map(ch => (
        <option key={ch.id} value={ch.id}>{ch.title}</option>
      ))}
    </select>
  )}
</div>
\`\`\`

## 영향 분석

### 사용 사례

1. **같은 채널 운영** (현재 동작 OK)
   - 롱폼, 숏폼 모두 같은 채널
   - 문제 없음

2. **분리 채널 운영** (현재 동작 ❌)
   - 롱폼: 메인 채널
   - 숏폼: 쇼츠 전용 채널
   - **불가능** → 롱폼 채널로 강제 업로드

3. **테스트 환경** (현재 동작 ❌)
   - 롱폼: 프로덕션 채널
   - 숏폼: 테스트 채널
   - **불가능** → 프로덕션 채널에 강제 업로드

## 체크리스트

- [ ] 채널 선택 우선순위 변경 (\`channelId || parentChannelId\`)
- [ ] 프론트엔드에 채널 선택 UI 추가
- [ ] \`useParentChannel\` 플래그 지원
- [ ] 채널 선택 로직 테스트
- [ ] 기존 작업들 영향도 확인
- [ ] 문서 업데이트

## 테스트 시나리오

1. **사용자 채널 명시 선택**
   - channelId 지정
   - effectiveChannelId === channelId 확인

2. **롱폼 채널 사용**
   - useParentChannel: true
   - effectiveChannelId === parentChannelId 확인

3. **채널 미선택**
   - channelId, parentChannelId 모두 없음
   - 에러 응답 확인

4. **Fallback 동작**
   - channelId 없음, parentChannelId 있음
   - effectiveChannelId === parentChannelId 확인

## 참고

- **현재 상태**: 롱폼 채널이 무조건 우선
- **위험도**: 사용자가 의도하지 않은 채널에 업로드
- **우선순위**: P1 (빠른 수정 필요)
- **회귀 위험**: 낮음 (기본 동작은 유지)
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
