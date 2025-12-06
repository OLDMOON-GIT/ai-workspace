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

const title = 'useImageFX 변수 undefined - 크롤링 실패';

const summary = `이미지 크롤링 API 응답 메시지에서 useImageFX 변수 참조 오류.

주요 증상:
- ReferenceError: useImageFX is not defined
- POST /api/images/crawl 실패

원인:
- route.ts:40에서 imageMode로 파라미터 받음
- route.ts:191에서 useImageFX 사용 (정의되지 않은 변수)

해결:
- useImageFX → imageMode === 'imagefx' 변경 필요`;

const metadata = {
  severity: 'CRITICAL',
  priority: 'P0',
  category: 'api',
  source: 'Runtime Error',
  error_type: 'ReferenceError',
  related_files: [
    'trend-video-frontend/src/app/api/images/crawl/route.ts'
  ],
  related_bts: 'BTS-0000034',
  full_content: `## 📋 기본 정보

- **발생일**: ${new Date().toLocaleString('ko-KR')}
- **심각도**: 🔴 **CRITICAL**
- **우선순위**: 🔴 **P0**
- **카테고리**: api
- **관련 파일**: trend-video-frontend/src/app/api/images/crawl/route.ts

## 증상

이미지 크롤링 실행 시 useImageFX 변수 undefined 에러 발생.

### 에러 메시지
\`\`\`
ReferenceError: useImageFX is not defined
\`\`\`

### 재현 방법
1. 자동화 페이지에서 이미지 크롤링 실행
2. 모달에서 ImageFX 또는 Whisk 선택
3. API 호출 시 에러 발생

## 원인 분석

### 문제 코드

**route.ts:40** (파라미터 - 정상):
\`\`\`typescript
const { scenes, contentId, imageMode, format, productInfo, metadata, category } = body;
// ✅ imageMode로 받음
\`\`\`

**route.ts:191** (문제):
\`\`\`typescript
message: useImageFX ? 'ImageFX + Whisk 자동화가 시작되었습니다.' : 'Whisk 자동화가 시작되었습니다.'
// ❌ useImageFX 변수가 정의되지 않음!
\`\`\`

### 원인
- BTS-0000034에서 useImageFX → imageMode로 변경됨
- 응답 메시지 부분만 수정 누락됨

## 해결 방안

\`\`\`typescript
// 수정 전
message: useImageFX ? 'ImageFX + Whisk 자동화가 시작되었습니다.' : 'Whisk 자동화가 시작되었습니다.'

// 수정 후
message: imageMode === 'imagefx' ? 'ImageFX + Whisk 자동화가 시작되었습니다.' : imageMode === 'flow' ? 'Flow 자동화가 시작되었습니다.' : 'Whisk 자동화가 시작되었습니다.'
\`\`\`

## 영향 범위

- 이미지 크롤링 전체 기능 마비
- 자동화 워크플로우 중단
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
console.log(`🔴 심각도: CRITICAL`);
console.log(`📋 제목: ${title}`);

await conn.end();
