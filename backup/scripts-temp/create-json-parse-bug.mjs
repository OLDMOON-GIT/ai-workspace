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

const title = 'JSON 파싱 오류 - 유도리 JSON 파서 처리 필요';

const summary = `story.json 파싱 중 따옴표 및 특수문자 처리 오류 발생. 유도리 JSON 파서에서 안전하게 처리해야 함.

주요 증상:
- Expected ',' or '}' after property value 에러
- JSON 문자열 내 따옴표 이스케이프 문제
- sora_prompt, image_prompt 등 긴 텍스트 필드에서 발생

영향:
- story.json 파일 로드 실패
- 자동화 파이프라인 중단
- 데이터 손실 가능성`;

const metadata = {
  severity: 'HIGH',
  priority: 'HIGH',
  category: 'data-parsing',
  source: 'story.json',
  error_type: 'JSON Parse Error',
  related_files: ['story.json', 'JSON 파서', '유도리'],
  full_content: `## 📋 기본 정보

- **발생일**: ${new Date().toLocaleString('ko-KR')}
- **심각도**: 🟠 **HIGH**
- **우선순위**: 🟠 **HIGH**
- **카테고리**: data-parsing
- **관련 파일**: \`story.json\`, JSON 파서, 유도리

## 증상

story.json 파싱 중 다음과 같은 오류 발생:

\`\`\`
Expected ',' or '}' after property value
\`\`\`

### 문제가 되는 데이터 구조

JSON 파일 내 긴 텍스트 필드(sora_prompt, image_prompt, narration 등)에 포함된:
- 작은따옴표 (')
- 큰따옴표 (")
- 특수문자
- 줄바꿈

이러한 문자들이 JSON 문자열로 제대로 이스케이프되지 않아 파싱 실패.

### 예시 데이터

\`\`\`json
{
  "sora_prompt": "Vertical 9:16 format, portrait orientation, cinematic product solution reveal, camera continues previous movement as the SAME KOREAN PERSON from previous scenes now wears the K2 Safety Basic Neck Gaiter, same winter coat confirming character continuity, same cold park or trail location, seamless transition as same Korean person's face with East Asian features comes into frame comfortably wearing the new product, close-up of neck gaiter showing soft, stretchable, knit fabric and full coverage up to the nose..."
}
\`\`\`

## 원인

1. **JSON.stringify() 미사용**: 문자열을 직접 삽입할 때 이스케이프 처리 누락
2. **수동 JSON 생성**: 템플릿 문자열로 JSON 생성 시 특수문자 처리 부족
3. **유효성 검증 부재**: 생성된 JSON의 유효성 검사 미실행

## 해결 방안

### 1. 유도리 JSON 파서 개선

\`\`\`javascript
// BAD: 수동 문자열 조합
const json = \`{
  "prompt": "\${userInput}"
}\`;

// GOOD: JSON.stringify 사용
const data = {
  prompt: userInput
};
const json = JSON.stringify(data, null, 2);
\`\`\`

### 2. 안전한 파싱

\`\`\`javascript
import { jsonrepair } from 'jsonrepair';

function safeJsonParse(jsonString) {
  try {
    return JSON.parse(jsonString);
  } catch (error) {
    console.warn('JSON 파싱 실패, 복구 시도:', error.message);
    try {
      const repaired = jsonrepair(jsonString);
      return JSON.parse(repaired);
    } catch (repairError) {
      console.error('JSON 복구 실패:', repairError.message);
      throw error;
    }
  }
}
\`\`\`

### 3. 스키마 검증

\`\`\`javascript
import Ajv from 'ajv';

const ajv = new Ajv();
const schema = {
  type: 'object',
  properties: {
    scenes: { type: 'array' },
    // ... 스키마 정의
  },
  required: ['scenes']
};

const validate = ajv.compile(schema);
if (!validate(data)) {
  console.error('스키마 검증 실패:', validate.errors);
}
\`\`\`

## 체크리스트

- [ ] JSON 생성 시 JSON.stringify() 사용
- [ ] jsonrepair 라이브러리 도입
- [ ] 파싱 전 유효성 검증
- [ ] 에러 핸들링 개선
- [ ] 로깅 추가 (어느 필드에서 오류 발생했는지)
- [ ] 기존 story.json 파일들 검증 및 복구

## 참고

- jsonrepair: https://github.com/josdejong/jsonrepair
- JSON.stringify MDN: https://developer.mozilla.org/ko/docs/Web/JavaScript/Reference/Global_Objects/JSON/stringify
- Ajv JSON schema validator: https://ajv.js.org/
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
