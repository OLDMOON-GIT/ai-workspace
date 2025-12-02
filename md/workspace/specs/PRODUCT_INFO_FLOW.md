# 상품정보 전달 플로우

## 전체 흐름

```
내콘텐츠 페이지 → 메인 페이지 → AI 대본 생성
```

## 상세 단계

### 1. 사용자가 "🛍️ 상품정보" 버튼 클릭
**파일**: `trend-video-frontend/src/app/my-content/page.tsx:2899`
```typescript
window.location.href = `/?promptType=product-info&generateProductInfo=${item.data.id}`;
```
- `generateProductInfo` 파라미터에 스크립트 ID 전달

### 2. 메인 페이지에서 URL 파라미터 감지
**파일**: `trend-video-frontend/src/app/page.tsx:521-526`
```typescript
useEffect(() => {
  const urlParams = new URLSearchParams(window.location.search);
  const scriptId = urlParams.get('generateProductInfo');
  if (scriptId) { ... }
}, []);
```

### 3. API로 스크립트 데이터 조회
**파일**: `trend-video-frontend/src/app/page.tsx:536`
```typescript
fetch(`/api/scripts/${scriptId}`)
```

**API 엔드포인트**: `trend-video-frontend/src/app/api/scripts/[id]/route.ts:54`
```typescript
const content = findContentById(contentId);
return NextResponse.json({ script: content });
```

### 4. DB에서 데이터 로드
**파일**: `trend-video-frontend/src/lib/content.ts:150-158`
```typescript
export function findContentById(contentId: string): Content | null {
  const stmt = db.prepare(`SELECT * FROM contents WHERE id = ?`);
  const row = stmt.get(contentId);
  return rowToContent(row);  // product_info 컬럼을 productInfo로 변환
}
```

**파일**: `trend-video-frontend/src/lib/content.ts:396-429`
```typescript
function rowToContent(row: any): Content {
  let productInfo: any = undefined;
  if (row.product_info) {
    productInfo = JSON.parse(row.product_info);  // JSON 파싱
  }
  return {
    ...
    productInfo: productInfo,  // ⭐ 여기서 반환
  };
}
```

### 5. productInfo 추출 및 상태 저장
**파일**: `trend-video-frontend/src/app/page.tsx:561-592`
```typescript
// ⚠️ 버그 발생 지점 (2025-01-12 수정됨)
const extractedProductInfo = script.productInfo;  // ✅ 수정 후: 직접 사용

if (extractedProductInfo) {
  const productInfoData = {
    title: script.title,
    thumbnail: extractedProductInfo.thumbnail || '',
    product_link: extractedProductInfo.product_link || '',
    description: extractedProductInfo.description || ''
  };
  setProductInfo(productInfoData);
  localStorage.setItem('pendingProductInfoData', JSON.stringify(productInfoData));
}
```

## DB 스키마

### contents 테이블
```sql
CREATE TABLE contents (
  ...
  product_info TEXT,  -- JSON 문자열로 저장
  ...
);
```

### product_info JSON 형식
```json
{
  "title": "상품명",
  "thumbnail": "https://...",
  "product_link": "https://...",
  "description": "상품 설명"
}
```

## 과거 버그 이력

### 2025-01-12: script.content 파싱 버그
**증상**: 상품정보 버튼 클릭 시 데이터가 메인 페이지로 전달 안됨

**원인**:
```typescript
// ❌ 잘못된 코드 (수정 전)
const scriptData = JSON.parse(script.content);  // content는 텍스트, JSON 아님
if (scriptData.product_info) { ... }  // 절대 실행 안됨
```

**해결**:
```typescript
// ✅ 올바른 코드 (수정 후)
const extractedProductInfo = script.productInfo;  // API가 이미 파싱해서 반환
```

**교훈**: DB 스키마 변경 시 API는 업데이트했지만 UI 코드 업데이트 누락

## 테스트 체크리스트

상품정보 기능 수정 시 반드시 확인:

- [ ] DB에 product_info 컬럼 존재하는지 확인
- [ ] `rowToContent` 함수가 productInfo 반환하는지 확인
- [ ] API `/api/scripts/[id]`가 productInfo 포함하는지 확인
- [ ] page.tsx에서 `script.productInfo` 사용하는지 확인
- [ ] **실제로 버튼 클릭해서 메인 페이지로 이동 테스트**
- [ ] 브라우저 콘솔에서 `✅ product_info 추출 완료` 로그 확인
- [ ] localStorage에 `pendingProductInfoData` 저장되는지 확인

## 관련 파일

- `trend-video-frontend/src/app/my-content/page.tsx:2899` - 버튼 클릭
- `trend-video-frontend/src/app/page.tsx:521-640` - 파라미터 감지 및 처리
- `trend-video-frontend/src/app/api/scripts/[id]/route.ts` - API 엔드포인트
- `trend-video-frontend/src/lib/content.ts:150,396` - DB 조회 및 변환
- `trend-video-frontend/data/database.sqlite` - contents 테이블
