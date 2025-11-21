# 이미지 크롤링 Aspect Ratio 선택 수정 - 테스트 가이드

## 🔧 수정 사항

### 1. **Frontend API 호출 부분** 
- **파일**: `trend-video-frontend/src/app/automation/page.tsx` (Line 1351, 1379, 3424)
- **수정**: `format` 파라미터 추가하여 API에 전달
- **상태**: ✅ 완료

```typescript
// Before
handleImageCrawling(scriptId, title.id, title.title)

// After
handleImageCrawling(scriptId, title.id, title.title, title.type)
```

### 2. **Frontend API 호출 부분 (my-content)**
- **파일**: `trend-video-frontend/src/app/my-content/page.tsx` (Line 1948)
- **수정**: `format` 파라미터를 request body에 추가
- **상태**: ✅ 완료

### 3. **API 라우트 (metadata 생성)**
- **파일**: `trend-video-frontend/src/app/api/images/crawl/route.ts`
- **수정**: 
  - `format` 파라미터 추출 (Line 32)
  - `getAspectRatioByFormat()` 함수 추가 (Line 17-29)
  - JSON 파일 생성 시 metadata 포함 (Line 68-76)
- **상태**: ✅ 완료

### 4. **Python 스크립트 (metadata 파싱)**
- **파일**: `scripts/utils/image_crawler_working.py` (Line 1096-1137)
- **수정**: 디버깅 로그 추가
- **상태**: ✅ 완료 (이미 구현되어 있음)

---

## 🧪 테스트 절차

### Step 1: 단일 테스트 (longform - 16:9)

1. 자동화 페이지에서:
   - ✅ Video Type: **longform** 선택
   - ✅ 스크립트 생성 또는 기존 스크립트 선택
   - ✅ 이미지 크롤링 버튼 클릭

2. 브라우저 개발자 도구 (F12) 에서 로그 확인:
   ```
   [ImageCrawl API] format received: longform
   ✅ 이미지 크롤링 작업 생성: ... (format: longform)
   ```

3. Python 로그 확인 (서버 콘솔):
   ```
   📋 JSON 구조: ['scenes', 'metadata']
   📦 Metadata: {'format': 'longform', 'aspect_ratio': '16:9'}
   ✅ 비디오 형식: longform → 비율: 16:9
   ```

4. **Whisk 브라우저 상에서**:
   - 비율 선택 메뉴에서 **16:9** (가로형) 확인
   - 이미지 생성 시 가로 형식으로 생성되는지 확인

---

### Step 2: shortform 테스트 (9:16)

1. 자동화 페이지에서:
   - ✅ Video Type: **shortform** 선택
   - ✅ 이미지 크롤링 시작

2. Python 로그:
   ```
   📦 Metadata: {'format': 'shortform', 'aspect_ratio': '9:16'}
   ✅ 비디오 형식: shortform → 비율: 9:16
   ```

3. **Whisk 브라우저**:
   - 비율이 **9:16** (세로형)으로 자동 선택
   - 이미지가 세로 형식으로 생성

---

### Step 3: product 테스트 (9:16)

1. 자동화 페이지:
   - ✅ Video Type: **product** 선택

2. Python 로그:
   ```
   ✅ 비디오 형식: product → 비율: 9:16
   ```

---

### Step 4: sora2 테스트 (9:16)

1. 자동화 페이지:
   - ✅ Video Type: **sora2** 선택

2. Python 로그:
   ```
   ✅ 비디오 형식: sora2 → 비율: 9:16
   ```

---

## ✅ 예상 결과

| Format | 예상 Aspect Ratio | Whisk 선택 |
|--------|------------------|-----------|
| longform | 16:9 | 가로형 |
| shortform | 9:16 | 세로형 |
| product | 9:16 | 세로형 |
| sora2 | 9:16 | 세로형 |

---

## 🔍 문제 진단

### 만약 여전히 9:16으로 선택되면:

1. **API 파라미터 확인**:
   ```
   F12 → Network → /api/images/crawl → Request Body
   → format 필드가 있는지 확인
   ```

2. **API 응답 확인**:
   ```
   Console: [ImageCrawl API] format received: ???
   ```

3. **Python 로그 확인**:
   ```
   📦 Metadata: 
   format: ???
   aspect_ratio: ???
   ```

4. **버튼 호출 확인**:
   - Line 3424: `handleImageCrawling(scriptId, title.id, title.title, title.type)`
   - `title.type`이 올바른 값인지 확인

---

## 📝 로그 위치

- **Frontend Console**: `F12` → `Console` 탭
- **Server Console**: 개발 서버 터미널
- **Python Output**: API 응답의 logs 배열

---

## 🎯 최종 확인

테스트 완료 후:
- [ ] longform (16:9) 정상 작동
- [ ] shortform (9:16) 정상 작동  
- [ ] product (9:16) 정상 작동
- [ ] sora2 (9:16) 정상 작동
