# 절대 삭제하면 안 되는 핵심 기능

> ⚠️ 이 문서에 있는 기능들은 과거에 버그가 발생했거나 중요한 기능입니다.
> 코드 수정 시 반드시 확인하세요!

---

## 1. 상품정보 전달 (Product Info Flow)

**왜 중요한가**: 2025-01-12 버그 발생 - script.content를 파싱하던 코드가 script.productInfo를 사용하지 않아서 데이터 전달 안됨

### 체크 포인트
- [ ] `src/app/page.tsx:566` - `script.productInfo` 사용 (script.content 파싱 금지)
- [ ] `src/app/my-content/page.tsx:2899` - 상품정보 버튼 URL 파라미터 전달
- [ ] `src/app/api/scripts/[id]/route.ts:56` - API가 productInfo 반환
- [ ] `src/lib/content.ts:429` - rowToContent()가 productInfo 파싱

### 코드 위치
```typescript
// src/app/page.tsx:566
// ⛔ CRITICAL: 상품정보 추출
const extractedProductInfo: ProductInfo | undefined = script.productInfo;
// ❌ 절대 script.content를 JSON 파싱하지 말것!
```

### 테스트
```bash
# DB에 product_info 있는 스크립트 조회
sqlite3 data/database.sqlite "SELECT id FROM contents WHERE product_info IS NOT NULL LIMIT 1"
# → 754500ed-977e-4277-9ca5-485276ca784f

# API 응답에 productInfo 포함되는지 확인
curl /api/scripts/754500ed-977e-4277-9ca5-485276ca784f
# → { "script": { "productInfo": { ... } } }
```

**관련 문서**: `PRODUCT_INFO_FLOW.md`

---

## 2. 영상 재생성 - uploads 폴더 지원

**왜 중요한가**: 2025-01-12 버그 - uploads 폴더의 영상을 재생성하려고 하면 "폴더를 찾을 수 없습니다" 에러

### 체크 포인트
- [ ] `src/app/api/restart-video/route.ts:78` - folderType에 'uploads' 포함
- [ ] uploads 폴더 경로 파싱 로직 존재

### 코드 위치
```typescript
// src/app/api/restart-video/route.ts:78
// ⛔ CRITICAL: uploads 폴더 지원
let folderType: 'input' | 'output' | 'uploads' = 'input';

const uploadsIndex = pathParts.findIndex(p => p === 'uploads');
if (uploadsIndex !== -1) {
  folderType = 'uploads';
}
```

### 테스트
```bash
# 코드에 'uploads' 문자열 존재 확인
grep -n "'uploads'" src/app/api/restart-video/route.ts
```

---

## 3. Video Merge - SAR 필터 정규화

**왜 중요한가**: 2025-01-12 버그 - 영상 합칠 때 SAR 불일치로 실패

### 체크 포인트
- [ ] `trend-video-backend/video_merge.py:131` - setsar=1 필터 존재

### 코드 위치
```python
# video_merge.py:131
# ⛔ CRITICAL: SAR 정규화
sar_filters = []
for i in range(len(video_paths)):
    sar_filters.append(f"[{i}:v]setsar=1[v{i}]")
```

### 테스트
```bash
grep -n "setsar=1" trend-video-backend/video_merge.py
```

---

## 4. TTS 미리듣기 - 중지 에러 처리

**왜 중요한가**: 2025-01-12 버그 - 사용자가 TTS 중지하면 콘솔에 에러 출력

### 체크 포인트
- [ ] `src/app/my-content/page.tsx:1262` - interrupted/canceled 에러 무시

### 코드 위치
```typescript
// src/app/my-content/page.tsx:1262
// ⛔ CRITICAL: TTS 중지 에러 처리
utterance.onerror = (event) => {
  if (event.error === 'interrupted' || event.error === 'canceled') {
    console.log('ℹ️ TTS stopped by user');
    return; // 에러 아님
  }
  // 실제 에러만 표시
};
```

### 테스트
```bash
grep -n "interrupted\|canceled" src/app/my-content/page.tsx
```

---

## 5. 데이터베이스 컬럼 존재

**왜 중요한가**: 2025-01-12 여러 버그 - 컬럼 누락으로 INSERT/SELECT 실패

### 필수 컬럼
- [ ] `contents.product_info` (TEXT) - 상품 정보
- [ ] `contents.tts_voice` (TEXT) - TTS 음성 선택
- [ ] `jobs.tts_voice` (TEXT) - 영상 생성 시 TTS 음성

### 테스트
```sql
-- contents 테이블
PRAGMA table_info(contents);
-- product_info, tts_voice 존재 확인

-- jobs 테이블
PRAGMA table_info(jobs);
-- tts_voice 존재 확인
```

---

## 6. 위험한 DB 마이그레이션 금지

**왜 중요한가**: 2025-01-12 심각한 버그 - DROP TABLE로 데이터 완전 손실 (207 jobs, 333 contents 날아감)

### 금지 사항
- [ ] `DROP TABLE` 사용 금지
- [ ] `DELETE FROM` 대량 삭제 금지
- [ ] 스키마 변경은 `ALTER TABLE`만 사용

### 코드 위치
```typescript
// src/lib/sqlite.ts
// ⛔ CRITICAL: DROP TABLE 절대 금지!
// ❌ db.exec(`DROP TABLE IF EXISTS contents;`);
// ✅ db.exec(`ALTER TABLE contents ADD COLUMN new_field TEXT;`);
```

### 검증
```bash
# DROP TABLE 사용 여부 확인
grep -n "DROP TABLE" src/lib/sqlite.ts
# → 결과 없어야 함!
```

**관련 문서**: 과거 데이터 손실 이력 - `sqlite.ts:348-429` 삭제됨

---

## 7. 로그 기능 (UI)

**왜 중요한가**: 사용자가 명시적으로 요청한 UI 표준

### 체크 포인트
- [ ] 로그 버튼 텍스트: "📋 로그" / "📋 닫기" (개수 표시 금지)
- [ ] 큰 로그창 하나만 표시 (중복 로그창 금지)
- [ ] jobLastLogRefs 존재 (자동 스크롤)

### 코드 위치
```typescript
// src/app/my-content/page.tsx:2626, 2976, 3808
// ⛔ CRITICAL: 로그 버튼 텍스트 표준
{expandedLogJobId === item.data.id ? '📋 닫기' : '📋 로그'}
// ❌ 금지: '📋 로그 보기 (130)'
```

---

## 8. ChatGPT URL

**왜 중요한가**: 2025-01-12 버그 - 오래된 URL로 로그인 실패

### 체크 포인트
- [ ] `chatgpt_agent.py:12` - `https://chatgpt.com/`
- [ ] `agent.py:76` - `https://chatgpt.com/`
- [ ] `setup_login.py:30` - `https://chatgpt.com/`

### 검증
```bash
grep -rn "chat.openai.com" trend-video-backend/src/ai_aggregator/
# → 결과 없어야 함!

grep -rn "chatgpt.com" trend-video-backend/src/ai_aggregator/
# → 3개 파일에서 발견되어야 함
```

---

## 자동 테스트 실행

```bash
# 모든 핵심 기능 자동 체크 (5초)
node scripts/test-critical-features.js

# 또는 커밋 전 자동 실행
git commit -m "..."  # → 자동으로 체크 실행
```

---

## 새로운 핵심 기능 추가 방법

1. 이 문서에 항목 추가
2. 코드에 `⛔ CRITICAL:` 주석 추가
3. `scripts/test-critical-features.js`에 테스트 추가
4. Git 커밋: "fix: XXX 버그 수정 (핵심 기능 추가)"

---

## 버그 이력

| 날짜 | 버그 | 원인 | 영향도 |
|------|------|------|--------|
| 2025-01-12 | 데이터 손실 | DROP TABLE 사용 | 🔴 심각 (207 jobs, 333 contents 손실) |
| 2025-01-12 | 상품정보 전달 안됨 | script.content 파싱 | 🟡 중간 (기능 작동 안함) |
| 2025-01-12 | 영상 재생성 실패 | uploads 폴더 미지원 | 🟡 중간 |
| 2025-01-12 | Video merge 실패 | SAR 불일치 | 🟡 중간 |
| 2025-01-12 | TTS 에러 출력 | 중지 시 에러 처리 없음 | 🟢 낮음 (UX) |

**교훈**: 이 문서의 기능들을 반드시 보호하세요!
