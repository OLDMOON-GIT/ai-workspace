# 자동화 상품 등록 프로세스 (Product Automation Process)

## 📋 개요
자동화 시스템에서 상품이 등록될 때부터 예약 큐에 추가될 때까지의 전체 프로세스를 정의합니다.
**핵심 원칙**: 모든 상품은 **반드시 딥링크(Deep Link)를 포함**해야 하며, 쿠팡 일반 URL은 절대 사용되면 안 됩니다.

---

## 🔄 프로세스 플로우

```
1. 상품 자동 등록 요청 (자동화 페이지)
   ↓
2. 쿠팡 베스트셀러 API에서 상품 조회
   ↓
3. 내 목록(coupang_products)에 등록 + 딥링크 생성
   ↓
4. 딥링크를 포함하여 상품정보 생성
   ↓
5. 예약 큐(video_titles)에 등록
   ↓
6. 자동화 스케줄러 실행
```

---

## 🔑 핵심 규칙

### Rule 1: 딥링크 생성은 필수
- **쿠팡 베스트셀러**: 쿠팡에서 제공하는 일반 URL → 반드시 딥링크로 변환 필요
- **내 목록 상품**: 이미 딥링크가 저장되어 있음 (deep_link 컬럼)
- **검증**: productUrl이 쿠팡 일반 링크면 오류 발생 시켜야 함

### Rule 2: 상품 정보 저장 구조
```
coupang_products 테이블 (내 목록):
├── product_id: 상품 ID
├── product_name: 상품명
├── deep_link: ⭐ 딥링크 (affiliate URL with commission)
├── category_id: 카테고리 ID
├── image_url: 상품 이미지
├── original_price: 원가
├── discount_price: 할인가
└── created_at: 생성일시

video_titles 테이블 (예약 큐):
├── id: 제목 ID
├── title: 제목
├── type: 'product' (상품 타입)
├── product_url: ⭐ 딥링크 (coupang_products.deep_link와 동일)
├── category: 카테고리 ID
├── status: 'scheduled'
└── product_data: JSON {
    productId: string,
    productName: string,
    productPrice: number,
    productImage: string,
    productUrl: string (딥링크),
    productDescription: string (AI 생성)
}
```

### Rule 3: 상품 정보 생성 순서
1. **상품 메타데이터** 확인 (이미지, 가격, 설명)
2. **상품설명 프롬프트** 실행 → AI 생성 설명
3. **Product 프롬프트** 실행 → AI 생성 대본
4. **YouTube 설명** 자동 생성
5. 모든 데이터를 **product_data**에 JSON으로 저장

---

## 📌 데이터 흐름 상세

### Step 1: 자동화 페이지에서 상품 등록 요청
```typescript
// automation/page.tsx
const handleAddTitle = async () => {
  // type === 'product' 선택
  // category 선택 (예: '3331')
  // 자동으로 "내 목록"에서 상품 조회

  const response = await fetch('/api/admin/coupang-products'); // ⭐ 내 목록에서만
  const filteredProducts = data.products.filter(p => p.category_id === newTitle.category);

  // productUrl은 반드시 p.deep_link 사용!
  const selectedProduct = {
    productId: p.product_id,
    productUrl: p.deep_link, // ⭐ 딥링크만 사용
    productName: p.product_name,
    ...
  };
};
```

### Step 2: 쿠팡 베스트셀러 → 내 목록 등록 (자동화)
**조건**: 자동화에서 새로운 상품이 필요할 때
```typescript
// Step A: 베스트셀러 조회
const bestsellers = await getCoupangBestsellers(userId, categoryId);

// Step B: 내 목록에 추가 + 딥링크 생성
for (const product of bestsellers) {
  // 1. 이미 내 목록에 있는지 확인
  const existing = await db.query('SELECT * FROM coupang_products WHERE user_id=? AND product_id=?');

  if (!existing) {
    // 2. 딥링크 생성
    const deepLink = await generateAffiliateDeepLink(userId, product.productUrl);

    if (!deepLink.includes('partner=')) {
      throw new Error('딥링크 생성 실패'); // 반드시 딥링크여야 함
    }

    // 3. 내 목록에 저장
    await db.prepare(`
      INSERT INTO coupang_products
      (product_id, user_id, product_name, deep_link, category_id, image_url, ...)
      VALUES (?, ?, ?, ?, ?, ?, ...)
    `).run(product.id, userId, product.name, deepLink, categoryId, ...);
  }
}
```

### Step 3: 상품정보 생성
```typescript
// automation-scheduler.ts
async function generateProductInfo(productData) {
  // 1. 상품 메타데이터 확인
  const metadata = {
    name: productData.productName,
    price: productData.productPrice,
    image: productData.productImage,
    url: productData.productUrl // ⭐ 딥링크 확인
  };

  // 2. productUrl 검증 (필수!)
  if (!metadata.url.includes('partner=')) {
    throw new Error(`❌ 상품 URL이 딥링크가 아닙니다: ${metadata.url}`);
  }

  // 3. 상품설명 AI 생성
  const productDescription = await generateProductDescription(metadata);

  // 4. Product 프롬프트 생성 (story.json의 youtube_description 포함)
  const story = await generateProductStory(metadata, productDescription);

  // 5. video_titles에 저장
  await db.prepare(`
    INSERT INTO video_titles (id, title, type, product_url, category, product_data, status)
    VALUES (?, ?, 'product', ?, ?, ?, 'scheduled')
  `).run(titleId, title, productData.productUrl, categoryId, JSON.stringify(story));
}
```

### Step 4: 예약 큐에 등록
```typescript
// video_titles 테이블에 저장되면 자동화 스케줄러가 감지
// status: 'scheduled' → 'processing' → 'completed'

const titleData = {
  id: generateId(),
  title: '상품명 + 생성된 제목',
  type: 'product',
  category: '3331', // 카테고리 ID
  product_url: deepLink, // ⭐ 반드시 딥링크
  product_data: {
    productId: '123456',
    productName: '상품명',
    productPrice: 50000,
    productImage: 'https://...',
    productUrl: deepLink, // ⭐ 반드시 딥링크
    productDescription: 'AI 생성 설명',
    youtube_description: '유튜브용 설명'
  },
  status: 'scheduled',
  created_at: new Date()
};
```

---

## ✅ 검증 체크리스트

### 상품이 내 목록에 등록될 때
- [ ] product_id는 쿠팡 ID (숫자)
- [ ] product_name은 존재
- [ ] **deep_link는 'partner=' 포함** ⭐
- [ ] deep_link가 쿠팡 일반 URL 아님 (https://www.coupang.com/vp/products/...)
- [ ] category_id는 유효한 값
- [ ] image_url은 유효한 HTTPS URL

### 예약 큐에 등록될 때
- [ ] product_url === deep_link ⭐
- [ ] product_url에 'partner=' 포함
- [ ] product_data.productUrl === deep_link ⭐
- [ ] type === 'product'
- [ ] status === 'scheduled'
- [ ] category는 존재하는 카테고리 ID

### 자동화 스케줄러 실행 중
- [ ] product_url 재검증 (딥링크인지 확인)
- [ ] 모든 필드 채우기 완료
- [ ] story.json 생성 성공
- [ ] youtube_description 포함

---

## 🛠️ 구현 요구사항

### 1. 자동화 페이지 (automation/page.tsx)
```
- 상품 선택 시 반드시 내 목록(coupang_products)에서만 조회
- 선택된 상품의 deep_link만 사용
- productUrl = p.deep_link (쿠팡 일반 URL 절대 금지)
```

### 2. 상품 등록 API (/api/coupang/products/add)
```
- 베스트셀러 조회 후 내 목록에 자동 추가
- 딥링크 생성 (generateAffiliateDeepLink)
- 실패 시 명확한 에러 메시지
```

### 3. 자동화 스케줄러 (automation-scheduler.ts)
```
- 상품정보 생성 전 URL 검증
- 모든 상품정보 데이터 채우기
- story.json에 youtube_description 포함
- 오류 시 해당 스케줄 상태를 'failed'로 변경
```

### 4. 데이터베이스 검증
```
- coupang_products.deep_link: NOT NULL, must contain 'partner='
- video_titles.product_url: must equal deep_link
- video_titles.product_data.productUrl: must equal deep_link
```

---

## 🚨 문제 해결

### 문제: productUrl이 쿠팡 일반 URL
**원인**: /api/coupang/products (베스트셀러 API) 사용
**해결**: /api/admin/coupang-products (내 목록 API) 사용 + deep_link 필드 확인

### 문제: 딥링크가 생성되지 않음
**원인**: generateAffiliateDeepLink 실패
**해결**:
- Coupang API 설정 확인
- API 응답 로깅
- 재시도 로직 추가

### 문제: 예약 큐에 등록되지만 대본 생성 실패
**원인**: product_data 누락 또는 잘못된 구조
**해결**:
- product_data 구조 검증
- youtube_description 필드 확인
- 로깅 강화

---

## 📝 커밋 메시지 템플릿

```
feat: 자동화 상품 등록 프로세스 개선

- [내용]

# 검증 항목:
- [ ] productUrl이 모두 딥링크인가?
- [ ] /api/admin/coupang-products 사용하는가?
- [ ] generateAffiliateDeepLink 호출되는가?
- [ ] video_titles.product_url === deep_link인가?
```

---

## 🔗 관련 파일

- `src/app/automation/page.tsx`: 자동화 페이지 (상품 선택)
- `src/lib/automation-scheduler.ts`: 자동화 스케줄러 (상품정보 생성)
- `src/lib/automation.ts`: 데이터베이스 함수
- `src/lib/coupang.ts`: 쿠팡 API (딥링크 생성)
- `src/app/api/coupang-products/route.ts`: 내 목록 API
- `src/app/api/coupang/products/route.ts`: 베스트셀러 API

---

**마지막 업데이트**: 2025-11-19
**상태**: 프로세스 정의 완료
