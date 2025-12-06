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

const title = 'story.json 파일이 malformed JSON으로 생성됨 (closing braces 누락)';

const summary = `story.json 파일이 생성될 때 마지막 closing braces가 누락되어 JSON 파싱 실패.

주요 증상:
- unified-worker에서 story.json 파싱 실패
- "Expected ',' or '}' after property value in JSON" 오류
- 이미지 크롤링/영상 생성 실패

원인:
- story.json 생성 시 quality_evaluation 객체의 closing brace 누락
- root 객체의 closing brace 누락

해결:
- story.json 파일에 누락된 closing braces 추가`;

const metadata = {
  severity: 'MEDIUM',
  priority: 'P2',
  category: 'script-generation',
  source: 'Claude Code',
  error_type: 'JSON Generation',
  related_files: [
    'trend-video-backend/tasks/6f66d786-ec0c-41f1-9397-05cdf759bdb7/story.json'
  ],
  full_content: `## 📋 기본 정보

- **발생일**: ${new Date().toLocaleString('ko-KR')}
- **심각도**: 🟡 **MEDIUM**
- **우선순위**: 🟡 **P2**
- **카테고리**: script-generation
- **관련 파일**:
  - \`trend-video-backend/tasks/6f66d786-ec0c-41f1-9397-05cdf759bdb7/story.json\`

## 증상

story.json 파일이 생성될 때 JSON 형식이 malformed 상태로 생성됨.

### 재현 방법

1. 스크립트 생성 (대본 자동 생성)
2. story.json 파일 생성됨
3. **JSON 마지막에 closing braces 누락**
4. unified-worker가 story.json 파싱 시도
5. **파싱 실패: "Expected ',' or '}' after property value in JSON"**

### 에러 메시지

\`\`\`
[2025-12-03 09:18:52] ❌ 에러: story.json 파싱 실패: JSON 파싱 실패: Expected ',' or '}' after property value in JSON at position 17387 (line 135 column 4)
\`\`\`

### 기대 동작

- story.json이 valid JSON 형식으로 생성됨
- quality_evaluation 객체가 제대로 닫힘
- root 객체가 제대로 닫힘

### 실제 동작

- quality_evaluation 객체의 closing brace 누락
- root 객체의 closing brace 누락
- JSON 파싱 실패로 task 전체 실패

## 원인 분석

### 문제 코드

**생성된 malformed JSON** (story.json line 144):
\`\`\`json
  "quality_evaluation": {
    "hook_strength": 9,
    "emotional_arc": 9,
    "three_act_structure": 10,
    "retention_points": 9,
    "pacing": 9,
    "visual_variety": 9,
    "total_score": 55,
    "grade": "S",
    "comments": "훅과 3막 구조가 완벽합니다. 붉은 보자기가 트라우마의 상징에서 치유의 매개체로 변하는 반전과, 화해 대신 이해를 선택한 결말이 깊은 카타르시스를 제공합니다. 서사 전개가 입체적이며, 인물들의 모순적인 고통이 잘 드러났습니다.",
  // ❌ 여기서 끝남! closing braces 없음
\`\`\`

**문제점**:
- \`"comments"\` 필드가 comma로 끝남
- \`quality_evaluation\` 객체의 \`}\` 누락
- root 객체의 \`}\` 누락

### 영향 범위

- **이미지 크롤링 실패**: story.json을 읽을 수 없어서 실패
- **영상 생성 실패**: story.json 파싱 불가
- **unified-worker 전체 중단**: JSON 파싱 예외로 worker 종료

### 발생 위치

\`\`\`
unified-worker.js:490:15
  at UnifiedWorker.processTask
\`\`\`

## 해결 방안

### ✅ 적용된 해결책: JSON 수동 수정

\`\`\`json
  "quality_evaluation": {
    "hook_strength": 9,
    "emotional_arc": 9,
    "three_act_structure": 10,
    "retention_points": 9,
    "pacing": 9,
    "visual_variety": 9,
    "total_score": 55,
    "grade": "S",
    "comments": "훅과 3막 구조가 완벽합니다. 붉은 보자기가 트라우마의 상징에서 치유의 매개체로 변하는 반전과, 화해 대신 이해를 선택한 결말이 깊은 카타르시스를 제공합니다. 서사 전개가 입체적이며, 인물들의 모순적인 고통이 잘 드러났습니다."
  }  // ✅ closing brace 추가
}  // ✅ root closing brace 추가
\`\`\`

### 근본 원인 수정 (TODO)

story.json을 생성하는 스크립트를 찾아서 JSON generation 로직 수정 필요:

1. **대본 생성 API 확인**
   - Claude Code가 story.json을 생성하는 위치 확인
   - JSON.stringify() 사용 여부 확인
   - 수동 JSON string concatenation 사용 여부 확인

2. **JSON 생성 로직 수정**
   - JSON.stringify() 사용 (자동으로 올바른 JSON 생성)
   - 또는 template literal 사용 시 closing braces 검증

3. **JSON validation 추가**
   - story.json 생성 후 JSON.parse() 테스트
   - 파싱 실패 시 재생성

## 영향 분석

**변경 전 (malformed JSON)**:
- ❌ story.json 파싱 실패
- ❌ 이미지 크롤링 실패
- ❌ 영상 생성 실패
- ❌ task 전체 실패

**변경 후 (valid JSON)**:
- ✅ story.json 파싱 성공
- ✅ 이미지 크롤링 가능
- ✅ 영상 생성 가능
- ✅ task 정상 진행

## 체크리스트

- [x] story.json 파일 JSON 수동 수정
- [x] JSON 파싱 테스트
- [ ] story.json 생성 스크립트 찾기
- [ ] JSON generation 로직 수정
- [ ] JSON validation 추가
- [ ] 테스트: 스크립트 생성 → story.json 검증

## 테스트 시나리오

1. **수동 수정 검증**
   - story.json 파일 읽기
   - JSON.parse() 성공 확인
   - unified-worker 재실행
   - 파싱 성공 확인

2. **근본 원인 수정 후 테스트**
   - 새 스크립트 생성
   - story.json 파일 생성 확인
   - JSON 형식 검증
   - 파싱 성공 확인

3. **회귀 테스트**
   - 여러 스크립트 생성
   - 모든 story.json 파일 JSON validation
   - 파싱 실패 없는지 확인

## 교훈

**JSON 생성 시 주의사항**:
- 수동 string concatenation 지양
- JSON.stringify() 사용 권장
- 생성 후 반드시 validation
- 에러 처리로 조기 발견

**story.json 구조**:
- quality_evaluation 객체는 root의 마지막 필드
- comments 필드가 마지막이므로 comma 불필요
- 반드시 closing braces 2개 필요 (quality_evaluation, root)

## 참고

- **발생 task**: 6f66d786-ec0c-41f1-9397-05cdf759bdb7
- **발생 시각**: 2025-12-03 09:18:52
- **에러 위치**: JSON position 17387 (line 135 column 4)
- **수정 방법**: Edit tool로 closing braces 추가
- **상태**: 해당 파일 수정 완료 (근본 원인 미수정)
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
console.log(`🐛 타입: BUG (OPEN - 근본 원인 미수정)`);
console.log(`📋 제목: ${title}`);
console.log(`🔗 URL: http://localhost:2000/admin/bugs`);

await conn.end();
