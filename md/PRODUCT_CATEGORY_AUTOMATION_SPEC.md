# 상품 카테고리 자동화 스펙

## 개요
자동화 시스템에서 "상품" 카테고리는 AI 제목 생성 대신 **상품관리에 등록된 실제 쿠팡 상품**을 사용합니다.

## 데이터 흐름

### 1. 상품 등록 단계 (사전 작업)
- **위치**: 상품관리 페이지
- **동작**:
  1. 쿠팡 베스트셀러 조회
  2. 사용자가 원하는 상품 선택
  3. 딥링크 생성
  4. `coupang_products` 테이블에 저장

#### DB 스키마: coupang_products
```sql
CREATE TABLE coupang_products (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  product_url TEXT NOT NULL,
  deep_link TEXT NOT NULL,          -- 제휴 딥링크
  title TEXT NOT NULL,              -- 상품명 (영상 제목으로 사용)
  description TEXT,
  category TEXT NOT NULL,           -- 쿠팡 카테고리
  original_price REAL,
  discount_price REAL,
  image_url TEXT,
  status TEXT DEFAULT 'active',     -- active/inactive
  view_count INTEGER DEFAULT 0,
  click_count INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  queue_id TEXT,
  is_favorite INTEGER DEFAULT 0
);
```

### 2. 자동화 테스트/실행 단계

#### 2-1. 카테고리 확인
```typescript
const category = categories[0]; // 채널 설정의 첫 번째 카테고리
if (category === '상품') {
  // 상품 처리 로직
}
```

#### 2-2. 상품 조회
```sql
SELECT * FROM coupang_products
WHERE user_id = ? AND status = 'active'
ORDER BY RANDOM()
LIMIT 1
```
- 사용자가 등록한 활성 상품 중 랜덤으로 1개 선택
- `status='active'`인 상품만 사용
- 매번 다른 상품이 선택됨 (RANDOM)

#### 2-3. video_titles 테이블에 저장
```typescript
const titleId = `title_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
const productData = JSON.stringify({
  productId: product.id,
  productName: product.title,
  productPrice: product.discount_price || product.original_price,
  productImage: product.image_url,
  productUrl: product.product_url,
  deepLink: product.deep_link,
  category: product.category
});

INSERT INTO video_titles (
  title_id, user_id, title, category, type, status,
  channel_id, product_url, product_data, created_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
```

**중요 필드**:
- `title`: 상품명 (영상 제목으로 사용)
- `category`: "상품"
- `type`: "product"
- `product_url`: 딥링크 (제휴 URL)
- `product_data`: JSON 형태의 상품 상세 정보

### 3. 영상 생성 단계
- `video_titles` 테이블에서 `type='product'` 데이터 읽기
- `product_data` JSON 파싱하여 영상 생성
- 상품 이미지, 가격, 설명 등 활용

## 일반 카테고리와의 차이점

| 구분 | 일반 카테고리 | 상품 카테고리 |
|------|--------------|--------------|
| 제목 생성 방식 | AI 모델 (Claude/GPT/Gemini) | 상품관리 DB에서 조회 |
| 비용 | $0.001 ~ $0.003 | $0 (무료) |
| 데이터 소스 | 카테고리별 예시 + AI 생성 | coupang_products 테이블 |
| 제목 품질 평가 | 규칙 기반 점수 (0-100점) | N/A (실제 쿠팡 제목 사용) |
| 추가 데이터 | 없음 | 딥링크, 가격, 이미지 등 |

## 테스트 로그 예시

### 성공 케이스
```
🎯 테스트 카테고리: 상품
🛍️ 상품관리에서 등록된 상품 조회 중...
✅ 상품 발견: 삼성전자 갤럭시 버즈3 Pro 블루투스 이어폰
   🔗 딥링크: https://link.coupang.com/a/xxx
   💰 가격: 259,000원
💾 상품 등록 완료! (video_titles에 저장)
   💰 비용: $0.000000 (≈₩0.00) - 상품관리 DB 사용

✨ 최종 선택된 제목:
   💡 "삼성전자 갤럭시 버즈3 Pro 블루투스 이어폰"
   🎯 점수: N/A (상품은 실제 쿠팡 제목 사용)
```

### 실패 케이스 (상품 미등록)
```
🎯 테스트 카테고리: 상품
🛍️ 상품관리에서 등록된 상품 조회 중...
❌ 상품 조회 실패: 상품관리에 등록된 상품이 없습니다. 먼저 상품을 등록해주세요.
```

## 요구사항 체크리스트

### 사용자가 해야 할 일
- [x] 상품관리 페이지에서 쿠팡 상품 등록
- [x] 상품 status를 'active'로 유지
- [ ] 채널 설정에서 "상품" 카테고리 추가

### 자동화 시스템이 하는 일
- [x] "상품" 카테고리 감지
- [x] coupang_products에서 상품 조회 (RANDOM)
- [x] video_titles에 저장 (type='product')
- [x] AI 제목 생성 스킵 (비용 절감)
- [x] 딥링크 및 상품 정보 포함

## 제한사항 및 주의사항

1. **상품 등록 필수**: 상품관리에 최소 1개 이상의 상품이 등록되어 있어야 함
2. **status='active' 필수**: 비활성 상품은 자동화에서 사용되지 않음
3. **랜덤 선택**: 매번 다른 상품이 선택되므로 특정 상품 지정 불가
4. **딥링크 유효성**: 등록된 딥링크가 유효해야 수익 발생 가능
5. **user_id 필터링**: 사용자별로 자신이 등록한 상품만 사용

## 향후 개선 사항

### 우선순위 기능
- [ ] 인기 상품 우선 선택 (view_count, click_count 기준)
- [ ] 즐겨찾기 상품 우선 선택 (is_favorite=1)
- [ ] 카테고리별 필터링 (쿠팡 카테고리와 매칭)

### 통계 및 분석
- [ ] 상품별 사용 횟수 추적
- [ ] 상품별 영상 성과 분석
- [ ] A/B 테스트 (여러 상품 비교)

### 자동 관리
- [ ] 비활성 상품 자동 정리
- [ ] 딥링크 만료 체크
- [ ] 재고 없는 상품 자동 비활성화

## 관련 파일

### 백엔드 API
- `src/app/api/automation/test-generate-stream/route.ts` - 자동화 테스트 (라인 220-288)
- `src/app/api/automation/logs/route.ts` - 로그 조회

### 프론트엔드
- `src/app/automation/page.tsx` - 자동화 페이지 (테스트 버튼)
- (상품관리 페이지 위치 확인 필요)

### 데이터베이스
- `data/database.sqlite` - SQLite DB
  - `coupang_products` - 상품 목록
  - `video_titles` - 영상 제목 큐
  - `youtube_channel_settings` - 채널 설정

### 유틸리티
- `src/lib/coupang-client.ts` - 쿠팡 API 클라이언트 (상품 등록 시 사용)
- `src/lib/sqlite.ts` - DB 연결

## 버전 히스토리

### v1.0.0 (2025-01-XX)
- 상품 카테고리 기본 구현
- coupang_products 테이블에서 조회
- 랜덤 상품 선택
- video_titles 저장

### v1.1.0 (계획)
- 우선순위 기반 선택
- 통계 추적
- 자동 관리 기능
