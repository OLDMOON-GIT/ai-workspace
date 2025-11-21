# OCR 기반 정책 위반 감지 (OCR-based Policy Violation Detection)

## 개요 (Overview)

Whisk 이미지 생성 중 "Google 정책을 위반" 메시지를 OCR로 정확하게 감지하여 false positive 없이 처리합니다.

## 구현 내용 (Implementation)

### 1. OCR 감지 함수 (`detect_policy_violation_with_ocr`)
- **위치**: `image_crawler_working.py` 라인 33-89
- **기능**:
  - 페이지 스크린샷 촬영
  - pytesseract로 한국어+영어 텍스트 추출
  - 정책 위반 키워드 검색:
    - "Google 정책을 위반"
    - "Google policy violation"
    - "정책 위반"
    - "violates Google"
    - "policy violation"
    - "정책을 위반"
  - 감지 시 위반 라인 및 컨텍스트 출력

### 2. 워크플로우 통합
- **위치**: `image_crawler_working.py` 라인 1408-1419
- **타이밍**: 각 씬의 이미지 생성 대기 후, 이미지 수집 전
- **동작**:
  1. 30초 이미지 생성 대기
  2. OCR 정책 위반 감지 실행
  3. 위반 감지 시:
     - 경고 메시지 출력
     - `{scene_number}_policy_violation.png` 스크린샷 저장
     - 해당 씬 건너뛰고 다음 씬으로 계속 진행
  4. 위반 없으면 이미지 수집 진행

## 필수 라이브러리 설치 (Required Dependencies)

### Python 패키지
```bash
pip install pytesseract pillow
```

### Tesseract OCR 엔진
**Windows:**
1. [Tesseract OCR 다운로드](https://github.com/tesseract-ocr/tesseract/releases)
2. 설치 시 "Additional language data" → Korean 선택
3. 환경 변수 PATH에 추가하거나 코드에서 직접 지정:
   ```python
   pytesseract.pytesseract.tesseract_cmd = r'C:\Program Files\Tesseract-OCR\tesseract.exe'
   ```

**Mac:**
```bash
brew install tesseract tesseract-lang
```

**Linux:**
```bash
sudo apt-get install tesseract-ocr tesseract-ocr-kor tesseract-ocr-eng
```

## 사용 예시 (Usage Example)

```bash
cd trend-video-backend/src/image_crawler
python image_crawler_working.py "path/to/story.json" --output-dir "path/to/output"
```

### 정책 위반 감지 시 출력 예시:
```
🔍 scene_03_cta 정책 위반 확인 중...
🚫 정책 위반 감지: 'Google 정책을 위반' 문구 발견
   위반 라인: Google 정책을 위반하는 콘텐츠입니다
   컨텍스트:

      Google 정책을 위반하는 콘텐츠입니다
      다시 시도해 주세요

⚠️ scene_03_cta에서 정책 위반 감지됨 - 이 씬을 건너뜁니다
📸 정책 위반 스크린샷: C:\...\scene_03_cta_policy_violation.png
```

## 장점 (Advantages)

1. **정확한 감지**: OCR로 실제 정책 위반 메시지만 감지
2. **False Positive 제거**: UI 메뉴의 "정책" 텍스트 등은 무시
3. **자동 복구**: 위반된 씬만 건너뛰고 나머지 씬은 계속 처리
4. **디버깅 지원**: 위반 스크린샷 및 컨텍스트 자동 저장

## 이전 방식과의 차이 (Difference from Previous Approach)

### ❌ 이전 (Regex 방식 - 제거됨):
- `document.body.innerText`에서 정규식 검색
- "정책", "정보" 등 일반 UI 텍스트도 매칭
- 모든 이미지 생성 차단 (false positive)

### ✅ 현재 (OCR 방식):
- 스크린샷에서 실제 표시된 텍스트만 OCR
- "Google 정책을 위반" 정확한 문구만 감지
- 해당 씬만 건너뛰고 나머지 진행

## 트러블슈팅 (Troubleshooting)

### OCR 라이브러리 없음 오류
```
⚠️ OCR 라이브러리 없음: No module named 'pytesseract'
   pip install pytesseract pillow 를 실행하세요
```
→ `pip install pytesseract pillow` 실행

### Tesseract 실행 파일을 찾을 수 없음
```
⚠️ OCR 감지 실패: tesseract is not installed or it's not in your PATH
```
→ Tesseract OCR 설치 및 PATH 설정 확인

### 한국어 인식 안 됨
```
⚠️ OCR 감지 실패: Error opening data file
```
→ Tesseract 설치 시 Korean language pack 포함했는지 확인

## 파일 위치 (File Locations)

- **메인 스크립트**: `trend-video-backend/src/image_crawler/image_crawler_working.py`
- **OCR 함수**: 라인 33-89
- **통합 코드**: 라인 1408-1419
- **정책 위반 스크린샷**: `{output_folder}/{scene_number}_policy_violation.png`

## 커밋 정보 (Commit Info)

- **구현 날짜**: 2025-11-21
- **기능**: OCR 기반 정책 위반 감지 추가
- **관련 이슈**: False positive 제거, 자동 복구 기능
