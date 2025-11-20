# 자동화 상품 추가 프로세스 개발자 가이드

## 📋 개요

자동화 시스템에 상품을 추가할 때는 **반드시 딥링크를 먼저 받아야** 합니다.
쿠팡 베스트셀러 캐시를 활용하여 빠르게 상품을 선택하고 자동화에 추가하는 프로세스입니다.

---

## 🔄 전체 프로세스 플로우

```
[자동화 페이지]
    ↓
  🛍️ 상품 버튼 클릭
    ↓
[쿠팡 상품 관리 페이지]
    ↓
  📦 캐시된 베스트셀러 목록 표시 (1시간 캐시)
    ↓
  🔍 "내 목록에 없는 것만" 필터링
    ↓
  ✅ 사용자가 상품 선택
    ↓
  📝 1단계: 내 목록에 추가 (딥링크 발급)
    ↓
  🤖 2단계: 자동화 영역에 추가
    ↓
  ✅ 완료
```

---

## ⚠️ 중요: 왜 이 순서여야 하나?

### 1. 딥링크가 필요한 이유
- 쿠팡 제휴 링크는 **딥링크 API**를 통해 발급받아야 함
- 일반 상품 URL은 제휴 수익이 발생하지 않음
- 딥링크 없이 자동화에 추가하면 **수익화 불가**

### 2. 내 목록을 먼저 거치는 이유
- 내 목록에 추가하는 과정에서 **딥링크 자동 발급**
- DB에 `deep_link` 컬럼에 저장됨
- 자동화는 이 딥링크를 사용하여 상품 정보 전달

### 3. 캐시를 사용하는 이유
- 베스트셀러 API 호출 비용 절감
- 1시간 캐시로 빠른 응답
- localStorage에 저장: `bestseller_{categoryId}`

---

## 📁 주요 파일 및 코드 위치

### 1. **자동화 페이지** - 상품 버튼
**파일**: `src/app/automation/page.tsx`
**위치**: 새 제목 추가 폼 내부

```typescript
// ⚠️ CRITICAL: 자동화 상품 추가 버튼
// 쿠팡 베스트셀러 캐시에서 선택 → 내 목록 추가 (딥링크 발급) → 자동화 추가
```

**기능**:
- 쿠팡 상품 페이지로 이동 (`?tab=coupang&fromAutomation=true`)
- `fromAutomation=true` 파라미터로 자동화 모드 활성화

---

### 2. **쿠팡 상품 관리 페이지** - 메인 로직
**파일**: `src/app/admin/coupang-products/page.tsx`

#### A. 캐시 로직 (line ~3043-3089)
```typescript
const cacheKey = `bestseller_${categoryId || 'all'}`;
const cacheExpiry = 60 * 60 * 1000; // 1시간
```

**캐시 확인**:
- localStorage에서 캐시 조회
- 1시간 이내면 캐시 사용
- 만료되면 API 재호출

#### B. 자동화 버튼 (line ~2170-2194)
```typescript
// ⚠️ CRITICAL: 자동화 상품 추가 프로세스
// 1단계: 내 목록에 추가 (딥링크 발급)
// 2단계: 자동화 영역에 추가 (productData 전달)
```

**2단계 프로세스**:
1. **내 목록 추가 API 호출** (`/api/coupang/products`)
   - 딥링크 발급 요청
   - DB에 저장

2. **자동화 페이지로 이동** (`/automation?fromProduct=true`)
   - localStorage에 상품 정보 저장
   - productData에 UI 키 + 백엔드 키 모두 포함

---

## 🔑 ProductData 구조

### UI 표시용 키
```typescript
{
  productName: string,    // 상품명
  productImage: string,   // 이미지 URL
  productUrl: string,     // 딥링크 URL ⭐
  productPrice: string,   // 가격
  productId: string       // 상품 ID
}
```

### 백엔드 대본 생성용 키
```typescript
{
  title: string,          // 상품명
  thumbnail: string,      // 이미지 URL
  product_link: string,   // 딥링크 URL ⭐
  description: string     // 설명
}
```

**⚠️ 주의**: 두 가지 키 세트를 모두 포함해야 함!
- UI 키가 없으면 → 자동화 폼에서 상품 정보 안 보임
- 백엔드 키가 없으면 → 대본 생성 시 상품 정보 누락

---

## 🎯 필터링: "내 목록에 없는 것만"

**파일**: `src/app/admin/coupang-products/page.tsx`

```typescript
// 내 목록에 이미 있는 상품 필터링
const filteredProducts = allProducts.filter(product => {
  const alreadyInMyList = myProducts.some(
    myProduct => myProduct.product_url === product.product_url
  );
  return !alreadyInMyList;
});
```

**로직**:
- `myProducts`: DB에서 가져온 내 상품 목록
- `product_url` 기준으로 중복 체크
- 이미 있으면 필터링 제외

---

## 🛡️ 에러 처리

### 1. 딥링크 발급 실패
```typescript
if (!deepLinkData?.data?.[0]?.shortenUrl) {
  throw new Error('딥링크 발급 실패');
}
```

**대응**:
- 사용자에게 에러 alert
- 자동화 페이지로 이동하지 않음
- 내 목록에도 추가되지 않음

### 2. 자동화 추가 실패
```typescript
catch (error) {
  alert('상품 추가 실패: ' + error.message);
}
```

---

## 📊 데이터베이스 스키마

### `coupang_products` 테이블
```sql
CREATE TABLE coupang_products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  image_url TEXT,
  price TEXT,
  product_url TEXT NOT NULL,
  deep_link TEXT,              -- ⭐ 딥링크
  category_name TEXT,
  description TEXT,
  rocket_delivery INTEGER,
  free_shipping INTEGER,
  rating REAL,
  review_count INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### `automation_prefill` (localStorage)
```json
{
  "title": "상품명",
  "type": "product",
  "productData": {
    "productName": "...",
    "productImage": "...",
    "productUrl": "...",      // ⭐ 딥링크
    "productPrice": "...",
    "title": "...",
    "thumbnail": "...",
    "product_link": "...",    // ⭐ 딥링크
    "description": "..."
  }
}
```

---

## 🔧 디버깅 가이드

### 문제: 상품 정보가 자동화 폼에 안 보임
**원인**: UI 키 누락
**확인**:
```javascript
// 브라우저 콘솔
const data = JSON.parse(localStorage.getItem('automation_prefill'));
console.log(data.productData);
// productName, productImage, productUrl, productPrice 있는지 확인
```

### 문제: 대본에 상품 정보 안 들어감
**원인**: 백엔드 키 누락
**확인**:
```javascript
// 브라우저 콘솔
const data = JSON.parse(localStorage.getItem('automation_prefill'));
console.log(data.productData);
// title, thumbnail, product_link, description 있는지 확인
```

### 문제: 딥링크가 일반 URL임
**원인**: 내 목록 추가 API 실패
**확인**:
```sql
-- DB 확인
SELECT title, product_url, deep_link FROM coupang_products
WHERE id = [상품ID];
-- deep_link가 NULL이거나 일반 URL이면 문제
```

---

## ⚙️ 설정 및 환경 변수

필요한 쿠팡 API 키:
- `COUPANG_ACCESS_KEY`
- `COUPANG_SECRET_KEY`

딥링크 API 엔드포인트:
```
POST /api/coupang/deeplink
Body: { productUrl: string }
Response: { data: [{ shortenUrl: string }] }
```

---

## 🚀 개선 사항 (Future)

1. **일괄 추가**: 여러 상품을 한 번에 선택하여 자동화 추가
2. **카테고리별 캐시**: 카테고리마다 별도 캐시 유지
3. **딥링크 갱신**: 오래된 딥링크 자동 갱신
4. **중복 방지**: 같은 상품이 자동화에 중복 추가되지 않도록

---

## 📞 관련 이슈 및 문의

이 프로세스를 수정할 때는:
1. 반드시 이 문서를 업데이트할 것
2. 코드 주석도 함께 업데이트할 것
3. 딥링크 발급 순서를 절대 바꾸지 말 것

**⚠️ WARNING**: 딥링크 없이 자동화에 추가하면 수익화가 불가능합니다!

---

**문서 작성일**: 2025-11-17
**최종 수정일**: 2025-11-17
**작성자**: AI Assistant
