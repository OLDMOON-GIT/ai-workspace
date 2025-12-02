# 비율 프리픽스 모든 곳에 설정 완료 ✅

## 사용자 요청
**"모든곳에 설정하라구"** - 모든 프롬프트 생성 위치에 비율 프리픽스 추가

## 수정 완료

### ✅ Longform 프롬프트 템플릿 수정
**파일**: `trend-video-frontend/prompts/prompt_longform.txt`

**수정 내용**: 모든 `image_prompt` 필드에 "Horizontal 16:9 format, landscape orientation," 프리픽스 추가

**수정된 라인**:
- Line 481: scene_00_bomb → "Horizontal 16:9 format, landscape orientation, Korean woman..."
- Line 493: scene_01_main → "Horizontal 16:9 format, landscape orientation, Korean woman..."
- Line 506: scene_07_main → "Horizontal 16:9 format, landscape orientation, Korean woman..."

**수정 전**:
```json
"image_prompt": "Korean woman in her 60s with grey hair, strong emotion, positioned right frame..."
```

**수정 후**:
```json
"image_prompt": "Horizontal 16:9 format, landscape orientation, Korean woman in her 60s with grey hair, strong emotion, positioned right frame..."
```

## 전체 상태 요약

이제 **모든 4가지 비디오 포맷**이 정확한 비율 프리픽스를 가지고 있습니다:

| 포맷 | 비율 | 필드명 | 프리픽스 | 파일 | 상태 |
|------|------|--------|----------|------|------|
| **SORA2** | 9:16 (세로) | `sora_prompt` | "Vertical 9:16 format" | prompt_sora2.txt | ✅ 완료 |
| **Product** | 9:16 (세로) | `sora_prompt` | "Vertical 9:16 format" | prompt_product.txt | ✅ 완료 |
| **Shortform** | 9:16 (세로) | `image_prompt` | "Vertical 9:16 format" | prompt_shortform.txt | ✅ 완료 |
| **Longform** | 16:9 (가로) | `image_prompt` | "Horizontal 16:9 format, landscape orientation" | prompt_longform.txt | ✅ **방금 수정** |

## 작동 원리

### 1. 프롬프트 생성 시
- Frontend API (`/api/generate-script`) → Claude/ChatGPT/Gemini 호출
- 위 프롬프트 템플릿을 사용하여 story.json 생성
- 모든 scene의 sora_prompt/image_prompt에 자동으로 비율 프리픽스 포함

### 2. Whisk 이미지 생성 시
- Backend (`image_crawler_working.py`) → story.json 읽기
- sora_prompt 또는 image_prompt를 Whisk에 입력
- 비율 프리픽스 덕분에 Whisk가 정확한 비율(16:9 또는 9:16)로 이미지 생성

## 확인 방법

```bash
# Longform 프롬프트에 Horizontal 16:9이 3개 있는지 확인
cd trend-video-frontend
grep "Horizontal 16:9" prompts/prompt_longform.txt
# 결과: 3개 찾음 (lines 481, 493, 506)
```

## 테스트 권장사항

1. **Longform 스토리 생성**:
   - Frontend에서 longform 형식 선택
   - 사연 제목 입력 후 생성
   - 생성된 story.json 확인 → image_prompt에 "Horizontal 16:9" 포함 확인

2. **Whisk 이미지 생성**:
   - 위에서 생성한 story.json로 image_crawler 실행
   - Whisk UI에서 "16:9" 비율 자동 선택 확인
   - 생성된 이미지가 가로 형식(landscape)인지 확인

3. **다른 포맷 테스트**:
   - Product/Shortform/SORA2도 동일하게 테스트
   - 각각 "Vertical 9:16" 프리픽스 확인
   - Whisk에서 "9:16" 비율 자동 선택 확인

## 기술적 세부사항

### 수정된 프롬프트 예시 (Longform)

**Scene 0 (훅 씬)**:
```json
{
  "scene_id": "scene_00_bomb",
  "scene_name": "3초 폭탄 씬",
  "duration_seconds": 3,
  "word_count": 350,
  "image_prompt": "Horizontal 16:9 format, landscape orientation, Korean woman in her 60s with grey hair, strong emotion, positioned right frame, pupils dilated eyes glistening with tears, direct camera stare, hands showing tension, close-up face 40% frame, left negative space, asymmetric composition, sharp focus eyes and hands, contrast lighting, desaturated cool tones, NO TEXT, NO LOGOS"
}
```

### Whisk 비율 선택 로직

**image_crawler_working.py (Lines 1108-1130)**:
```python
aspect_ratio = metadata.get('aspect_ratio')
format_type = metadata.get('format')

if format_type:
    # longform이거나 format에 '16:9'가 명시되어 있으면 16:9
    if format_type == 'longform' or '16:9' in str(format_type):
        aspect_ratio = '16:9'
    # 나머지는 모두 9:16 (shortform, product, sora2 등)
    else:
        aspect_ratio = '9:16'
elif not aspect_ratio:
    aspect_ratio = '9:16'  # 기본값
```

## 예상 효과

### 수정 전 문제
- Longform story.json 생성 시 image_prompt에 비율 정보 없음
- Whisk가 기본값(1:1 또는 잘못된 비율)으로 이미지 생성
- 사용자 불만: "이걸 이렇게 프롬프트하라고 전체 프롬프트에도 반영해줘야지"

### 수정 후 (기대 효과)
- ✅ 모든 포맷에서 프롬프트에 올바른 비율 포함
- ✅ Whisk가 자동으로 정확한 비율(16:9/9:16) 선택
- ✅ 이미지 품질 및 일관성 향상
- ✅ 사용자 요청 완료: "모든곳에 설정" 달성

## 관련 파일

### Frontend (프롬프트 템플릿)
- `trend-video-frontend/prompts/prompt_longform.txt` → **수정됨** ✅
- `trend-video-frontend/prompts/prompt_shortform.txt` → 이미 OK
- `trend-video-frontend/prompts/prompt_product.txt` → 이미 OK
- `trend-video-frontend/prompts/prompt_sora2.txt` → 이미 OK
- `trend-video-frontend/src/app/api/generate-script/route.ts` → Claude API 호출 (변경 불필요)

### Backend (이미지 생성)
- `trend-video-backend/src/image_crawler/image_crawler_working.py` → sora_prompt/image_prompt 읽기 (변경 불필요)
- 비율 선택 로직 이미 구현됨 (Lines 726-830, 1108-1130)

## Commit 정보

**Modified File**: `trend-video-frontend/prompts/prompt_longform.txt`
**Lines Changed**: 481, 493, 506 (3 lines)
**Change Type**: Added "Horizontal 16:9 format, landscape orientation," prefix

**Commit Message**:
```
fix(prompts): Add Horizontal 16:9 format prefix to longform image_prompt

- Added aspect ratio prefix to all 3 image_prompt fields in prompt_longform.txt
- Ensures Whisk receives correct 16:9 landscape orientation for longform videos
- Lines 481, 493, 506: Added 'Horizontal 16:9 format, landscape orientation,' prefix
- Addresses user requirement: '모든곳에 설정하라구' (set aspect ratio everywhere)

Now all 4 video formats have aspect ratio prefixes:
✅ SORA2 (9:16): Uses sora_prompt with 'Vertical 9:16 format'
✅ Product (9:16): Uses sora_prompt with 'Vertical 9:16 format'
✅ Shortform (9:16): Uses image_prompt with 'Vertical 9:16 format'
✅ Longform (16:9): Uses image_prompt with 'Horizontal 16:9 format' [FIXED]
```

## 사용자 요청 해결

사용자의 요청:
> "아후 복잡하네 그럼 어쩌겠어 그렇게 하는데 이걸 이렇게 프롬프트하라고 전체 프롬프트에도 반영해줘야지 안하고 여기서 만 이러니까 계속 돌아가지 시발놈아"
>
> "모든곳에 설정하라구"

**해결 상태**: ✅ **완료**

이제 모든 포맷(longform, shortform, product, sora2)의 프롬프트 템플릿에 올바른 비율 프리픽스가 포함되어 있습니다.

---

**날짜**: 2025-11-21
**작업**: Longform 프롬프트 템플릿 비율 프리픽스 추가
**상태**: ✅ 완료
