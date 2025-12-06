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

const title = 'useImageFX 변수 undefined - imageMode로 변경 필요';

const summary = `이미지 크롤링 API에서 useImageFX 변수를 사용하나 정의되지 않음.

주요 증상:
- ReferenceError: useImageFX is not defined
- BTS-0000034에서 imageMode로 변경되었으나 메시지에서 useImageFX 사용

원인:
- 파라미터는 imageMode로 받음
- 응답 메시지에서 useImageFX 사용

해결:
- useImageFX → imageMode === 'imagefx'로 변경`;

const metadata = {
  severity: 'MEDIUM',
  priority: 'P2',
  category: 'api',
  source: 'MCP-Debugger Auto Detection',
  error_type: 'Reference Error',
  related_files: [
    'trend-video-frontend/src/app/api/images/crawl/route.ts'
  ],
  full_content: `## 📋 기본 정보

- **발생일**: ${new Date().toLocaleString('ko-KR')}
- **심각도**: 🟡 **MEDIUM**
- **우선순위**: 🟡 **P2**
- **카테고리**: api
- **관련 파일**:
  - \`trend-video-frontend/src/app/api/images/crawl/route.ts\`

## 증상

이미지 크롤링 API 응답 생성 시 useImageFX 변수 undefined 에러.

### 에러 메시지

\`\`\`
ReferenceError: useImageFX is not defined
\`\`\`

### 재현 방법

1. POST /api/images/crawl 호출
2. 응답 메시지 생성
3. **useImageFX 변수 참조 시 undefined**

## 원인 분석

### 문제 코드

**route.ts line 40** (파라미터):
\`\`\`typescript
const { scenes, contentId, imageMode, format, productInfo, metadata, category } = body; // ✅ imageMode 사용
\`\`\`

**route.ts line 191** (수정 전):
\`\`\`typescript
message: useImageFX ? 'ImageFX + Whisk 자동화가 시작되었습니다.' : 'Whisk 자동화가 시작되었습니다.'
// ❌ useImageFX 변수가 정의되지 않음!
\`\`\`

**문제점**:
- BTS-0000034에서 useImageFX → imageMode로 변경
- 파라미터는 imageMode로 받고 있음
- 응답 메시지에서만 useImageFX를 사용하려고 함
- 변수명 불일치로 ReferenceError 발생

## 해결 방안

### ✅ 적용된 해결책

\`\`\`typescript
message: imageMode === 'imagefx' ? 'ImageFX + Whisk 자동화가 시작되었습니다.' : 'Whisk 자동화가 시작되었습니다.'
\`\`\`

### imageMode 값

- \`'imagefx'\`: ImageFX + Whisk 조합
- \`'whisk'\`: Whisk만 사용 (기본값)

## 영향 분석

**변경 전**:
- ❌ ReferenceError 발생
- ❌ 응답 메시지 생성 실패 가능성

**변경 후**:
- ✅ imageMode에 따라 올바른 메시지 표시
- ✅ 에러 없음

## 체크리스트

- [x] useImageFX → imageMode === 'imagefx' 변경
- [x] 테스트: imageMode='imagefx' 메시지 확인
- [x] 테스트: imageMode='whisk' 메시지 확인

## 교훈

**변수명 통일 필요**:
- useImageFX는 deprecated (BTS-0000034)
- imageMode 사용 권장
- 전체 코드베이스에서 useImageFX 제거 필요

## 참고

- **관련 BTS**: BTS-0000034 (imageMode 지원)
- **감지**: MCP-Debugger 자동 감지
- **상태**: 해결 완료 (${new Date().toLocaleString('ko-KR')})
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
    'resolved',
    JSON.stringify(metadata)
  ]
);

console.log(`✅ 버그 등록 완료: ${bugId}`);
console.log(`🐛 타입: BUG (RESOLVED)`);
console.log(`📋 제목: ${title}`);
console.log(`🔗 URL: http://localhost:2000/admin/bugs`);

await conn.end();
