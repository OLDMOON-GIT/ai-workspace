# 타입 시스템 가이드

## 문제 해결: DB 스키마 변경 시 자동 에러 감지

### 🎯 목표
DB 스키마를 변경하면 TypeScript 컴파일 에러가 발생해서 **즉시** 관련 코드를 찾아낼 수 있습니다.

### ✅ 적용 완료 (2025-01-12)

**중앙화된 타입 정의**: `src/types/content.ts`
- 모든 Content 관련 타입이 한 곳에 정의됨
- DB 스키마 변경 시 여기를 먼저 수정

**타입 적용된 파일**:
1. `src/types/content.ts` - 타입 정의
2. `src/lib/content.ts` - DB 로직에 타입 적용
3. `src/app/api/scripts/[id]/route.ts` - API에 타입 적용
4. `src/app/page.tsx` - UI에 타입 적용

---

## 실제 사례: 상품정보 버그

### 과거 (타입 없음)
```typescript
// ❌ any 타입으로 컴파일 에러 없음
const script = data.script;  // any
const extractedProductInfo = script.productInfo;  // any

// 실수로 잘못된 필드 접근
const wrongInfo = script.product_info;  // 에러 안남!
```

**결과**: 런타임에만 버그 발견, 디버깅에 1시간 소요

### 현재 (타입 적용)
```typescript
// ✅ 타입 명시
const script: Content = data.script;
const extractedProductInfo: ProductInfo | undefined = script.productInfo;

// 잘못된 필드 접근 시 컴파일 에러!
const wrongInfo = script.product_info;
// ❌ TypeScript Error: Property 'product_info' does not exist on type 'Content'
```

**결과**: 코드 작성 중 VS Code에서 빨간 밑줄 표시, 즉시 수정

---

## DB 스키마 변경 시 체크리스트

### 1단계: 타입 정의 업데이트 (필수)
**파일**: `src/types/content.ts`

예시: `productInfo` 필드에 `title` 추가
```typescript
export interface ProductInfo {
  title?: string;        // ⭐ 추가
  thumbnail?: string;
  product_link?: string;
  description?: string;
}
```

### 2단계: DB 마이그레이션
**파일**: `src/lib/sqlite.ts` 또는 직접 SQL

```sql
ALTER TABLE contents ADD COLUMN product_info TEXT;
```

### 3단계: DB 함수 업데이트
**파일**: `src/lib/content.ts:396` - `rowToContent()` 함수

```typescript
function rowToContent(row: any): Content {
  let productInfo: ProductInfo | undefined = undefined;
  if (row.product_info) {
    productInfo = JSON.parse(row.product_info);
  }

  return {
    ...
    productInfo: productInfo,  // ⭐ 자동으로 타입 체크됨
  };
}
```

### 4단계: TypeScript 컴파일 확인
```bash
npm run build
# 또는
npx tsc --noEmit
```

**에러가 발생하면**: 관련된 모든 코드 위치가 표시됨!
```
src/app/page.tsx:566:52 - error TS2339: Property 'title' does not exist on type 'ProductInfo'
```

### 5단계: 실제 기능 테스트
- [ ] 버튼 클릭해서 실제 동작 확인
- [ ] 브라우저 콘솔에서 데이터 확인

---

## 타입 사용법

### API 응답 타입 사용
```typescript
// ✅ 올바른 방법
import type { GetScriptResponse } from '@/types/content';

fetch(`/api/scripts/${id}`)
  .then(res => res.json() as Promise<GetScriptResponse>)
  .then((data: GetScriptResponse) => {
    const script = data.script;  // Content 타입
    // script.productInfo는 자동완성 작동!
  });
```

### Content 타입 가드 사용
```typescript
import { hasProductInfo, isValidProductInfo } from '@/types/content';

// 상품 정보가 있는지 확인
if (hasProductInfo(content)) {
  // 여기서 content.productInfo는 확정적으로 존재
  console.log(content.productInfo.thumbnail);
}

// 유효한 상품 정보인지 확인
if (isValidProductInfo(content.productInfo)) {
  // 필수 필드 중 하나 이상 존재
  console.log('유효한 상품 정보');
}
```

### 새로운 필드 추가 시
```typescript
// 1. src/types/content.ts에 먼저 추가
export interface Content {
  ...
  newField?: string;  // ⭐ 새 필드
}

// 2. TypeScript가 모든 관련 코드를 찾아줌
// - rowToContent()에서 newField 매핑 안함 → 에러
// - API 응답에 newField 없음 → 에러
```

---

## 타입 적용 우선순위

### 🔥 최우선 (이미 적용됨)
- [x] 상품정보 플로우 (버그 발생했던 부분)
- [x] Content CRUD 기본 로직

### 📋 추가 적용 추천
- [ ] `/api/contents` (내콘텐츠 목록 조회)
- [ ] `/api/scripts/generate` (대본 생성)
- [ ] `/api/video/generate` (영상 생성)

### 추가 적용 예시
```typescript
// src/app/api/contents/route.ts
import type { GetContentsResponse } from '@/types/content';

export async function GET(request: NextRequest): Promise<NextResponse<GetContentsResponse>> {
  const contents = getContentsByUserId(userId);
  return NextResponse.json<GetContentsResponse>({
    contents,
    total: contents.length
  });
}
```

---

## VS Code 자동완성 활용

타입을 명시하면:

1. **자동완성 작동**
```typescript
const script: Content = ...;
script.  // ← 여기서 Ctrl+Space → productInfo, title, status 등 표시
```

2. **잘못된 필드 접근 시 빨간 밑줄**
```typescript
script.product_info  // ❌ 빨간 밑줄
script.productInfo   // ✅ 자동완성으로 입력
```

3. **타입 힌트**
```typescript
// 마우스 올리면 타입 정보 표시
const info = script.productInfo;  // ProductInfo | undefined
```

---

## 효과 측정

### Before (타입 없음)
- DB 스키마 변경 → 런타임 에러 → 디버깅 1시간
- 관련 코드 수동으로 찾기 (Ctrl+F로 검색)
- 버그 발견 시점: 사용자가 버튼 클릭할 때

### After (타입 적용)
- DB 스키마 변경 → 타입 업데이트 → `npm run build` → 에러 목록 표시
- TypeScript가 자동으로 모든 관련 코드 찾아줌
- 버그 발견 시점: 코드 작성 중 (VS Code에서 빨간 밑줄)

**시간 절약**: 1시간 → 5분

---

## 주의사항

### ⚠️ any 타입 사용 금지
```typescript
// ❌ 나쁜 예
const data: any = await res.json();
const script: any = data.script;

// ✅ 좋은 예
const data: GetScriptResponse = await res.json();
const script: Content = data.script;
```

### ⚠️ 타입 단언 남용 금지
```typescript
// ❌ 나쁜 예 (타입 체크 우회)
const script = data.script as any;

// ✅ 좋은 예 (타입 체크 활용)
const script: Content = data.script;
```

### ⚠️ optional chaining 남용 주의
```typescript
// ❌ 에러 숨기기
const title = script?.productInfo?.title;  // undefined일 수 있음

// ✅ 명시적 체크
if (hasProductInfo(script)) {
  const title = script.productInfo.title;  // 타입 안전
}
```

---

## 문제 발생 시

### TypeScript 에러가 너무 많이 나올 때
1. 한 파일씩 점진적으로 타입 추가
2. 가장 중요한 플로우부터 시작 (예: 상품정보 전달)
3. `// @ts-ignore`로 임시 회피 (나중에 제거)

### 타입이 맞지 않을 때
1. `src/types/content.ts`와 DB 스키마 비교
2. `rowToContent()` 함수에서 올바르게 매핑하는지 확인
3. API 응답 구조와 타입 정의가 일치하는지 확인

---

## 참고 자료

- **타입 정의**: `src/types/content.ts`
- **플로우 문서**: `PRODUCT_INFO_FLOW.md`
- TypeScript Handbook: https://www.typescriptlang.org/docs/handbook/intro.html
