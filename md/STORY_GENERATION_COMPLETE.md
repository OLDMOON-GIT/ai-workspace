# 🎬 사연 영상 생성 시스템 개선 완료

## 📅 업데이트 일자: 2025-11-15

---

## 🎯 개선 목표

유튜브 사연 영상의 표준 구조(훅 + CTA + 본문)를 **롱폼**, **숏폼**, **SORA2** 모두에 적용

---

## ✅ 완료된 작업

### 1. 프롬프트 템플릿 파일 생성

| 파일 | 경로 | 용도 |
|------|------|------|
| `long_form_prompt.txt` | `trend-video-backend/src/prompts/` | 롱폼 사연 작성 규칙 |
| `short_story_system.txt` | `trend-video-backend/src/prompts/` | 숏폼 시스템 프롬프트 |
| `short_story_user.txt` | `trend-video-backend/src/prompts/` | 숏폼 사용자 프롬프트 |
| `prompt_sora2.txt` | `trend-video-frontend/prompts/` | SORA2 기본 프롬프트 (업데이트) |
| `sora2_prompt.txt` | `trend-video-frontend/prompts/` | SORA2 상세 프롬프트 (업데이트) |

### 2. 코드 수정

#### 롱폼: `long_form_creator.py`
- `_generate_story_structure`: scene_1에 CTA 포함 요구
- `_generate_single_scene_narration`: scene_1 전용 프롬프트 추가

#### 숏폼: `story_video_creator.py`
- 템플릿 파일 자동 로드 (이미 구현됨)
- 새 템플릿 사용 시 자동으로 CTA 포함

#### SORA2: `route.ts`
- 프롬프트 파일 자동 로드 (이미 구현됨)
- `getSora2Prompt()` 함수가 업데이트된 템플릿 사용
- 씬 1에 CTA 자동 포함

### 3. 테스트 스크립트

**파일**: `test-story-generation.js`

**테스트 항목**:
- ✅ 프롬프트 파일 존재 확인 (롱폼/숏폼/SORA2)
- ✅ CTA 멘트 포함 확인 (모든 형식)
- ✅ 구조 검증 (롱폼/숏폼/SORA2)
- ✅ 코드 수정 확인
- ✅ SORA2 씬 1 CTA 포함 검증

**결과**: 29/29 통과 ✅

### 4. 문서화

| 문서 | 내용 |
|------|------|
| `LONGFORM_STORY_GUIDE.md` | 롱폼 사용 가이드 |
| `SHORTFORM_STORY_GUIDE.md` | 숏폼 사용 가이드 |
| `SORA2_STORY_GUIDE.md` | SORA2 사용 가이드 |
| `STORY_GENERATION_COMPLETE.md` | 종합 정리 (이 문서) |

---

## 📋 구조 비교

### 롱폼 (60분+)

```
Scene 1:
├─ 훅 (30초-1분)
│  └─ "김밥하는 여자랑 결혼하겠다고. 절대 안 돼."
│
├─ CTA (상세 멘트)
│  └─ "사연 시작 전에 무료로 할 수 있는 구독과 좋아요 부탁드립니다.
│      사연봉투를 찾아 주신 모든 분들께 건강과 행복이 가득하시길 바랍니다.
│      오늘의 사연 시작하겠습니다."
│
└─ 본문 시작
   └─ "2025년 4월에 어느 봄날..."

Scene 2~12:
└─ 이어지는 스토리 (CTA 없음)
```

### 숏폼 (60초)

```
전체 스토리:
├─ 훅 (5-10초)
│  └─ "그 여자, 결국 나를 배신했다."
│
├─ CTA (3-5초)
│  └─ "구독과 좋아요 부탁드립니다."
│
└─ 본문 (40-50초)
   └─ "3년을 함께 했는데... (반전/여운)"
```

### SORA2 (30초 AI 영상)

```
씬 0 (훅) - 3초:
└─ "이것은 당신이 본 적 없는 장면입니다."

씬 1 (CTA + 몰입) - 9초:
├─ CTA: "구독과 좋아요 부탁드립니다."
└─ 본문: "10년 동안 그는 매일 같은 자리에서..."

씬 2 (반전) - 9초:
└─ "그런데 마지막 날, 그녀가 나타났을 때..."

씬 3 (중독) - 9초:
└─ "1년 후, 그 자리에는 아름다운 꽃밭이..."
```

---

## 🚀 사용 방법

### 롱폼 생성

```python
from src.video_generator.long_form_creator import LongFormStoryCreator

creator = LongFormStoryCreator(config)
result = creator.create_from_prompt(
    prompt="재벌 회장이 김밥집 며느리를 시험하다",
    output_dir=Path("output"),
    num_scenes=12,
    target_minutes=60
)
```

**자동 적용됨**:
- ✅ scene_1에 훅 + CTA 포함
- ✅ 구어체 말투
- ✅ 감동적인 스토리 전개

### 숏폼 생성

```python
from src.video_generator.story_video_creator import StoryVideoCreator

creator = StoryVideoCreator(config)
result = creator.create_from_prompt(
    prompt="배신당한 사랑과 복수",
    output_path=Path("output/shorts.mp4"),
    duration=60,
    aspect_ratio="9:16"
)
```

**자동 적용됨**:
- ✅ 훅으로 강하게 시작
- ✅ CTA 자동 삽입
- ✅ 간결한 본문

### SORA2 생성

SORA2 영상 생성 시 자동으로 씬 1에 CTA가 포함됩니다.

**자동 적용됨**:
- ✅ 씬 0: 충격적인 훅 (3초)
- ✅ 씬 1: CTA + 감정 몰입 (9초)
- ✅ 씬 2: WTF 반전 (9초)
- ✅ 씬 3: 중독성 마무리 (9초)
- ✅ 9:16 세로형 시네마틱

---

## 🧪 테스트 실행

```bash
# 구조 검증 테스트
node test-story-generation.js

# 결과: 29/29 통과 ✅
# (롱폼 + 숏폼 + SORA2 모두 포함)
```

---

## 📊 개선 효과

### Before (이전)
- ❌ CTA 없음
- ❌ 훅 약함
- ❌ 일관성 없는 구조

### After (개선)
- ✅ CTA 자동 포함
- ✅ 강력한 훅 구조
- ✅ 표준 구조 적용
- ✅ 롱폼/숏폼/SORA2 모두 지원

---

## 📝 프롬프트 커스터마이징

### 롱폼 스타일 변경

`trend-video-backend/src/prompts/long_form_prompt.txt` 수정:

```
### 1. 스토리 구조 (필수)

1) **초강력 훅** (첫 1분): 충격적인 대사
   - 예: "당신을 죽일 겁니다. 바로 오늘."

2) **구독/좋아요 CTA**: (생략 불가)
   ...
```

### 숏폼 스타일 변경

`trend-video-backend/src/prompts/short_story_system.txt` 수정:

```
1) **강력한 훅 (5-10초)** - 약 20-30자
   - 더 자극적이고 강렬하게
   - 예: "그 순간, 모든 것이 무너졌다."
```

### SORA2 스타일 변경

`trend-video-frontend/prompts/prompt_sora2.txt` 수정:

```
⚠️ **씬 1 CTA 필수 규칙:**
- 반드시 "구독과 좋아요 부탁드립니다." 포함
- CTA 멘트 후 감정 이입 스토리 전개
- 생략 절대 금지
```

---

## 🎬 예시 스크립트

### 롱폼 Scene 1 예시

```
김밥하는 여자랑 결혼하겠다고. 절대 안 돼. 당장 헤어져.
대한민국 10대 재벌 한진 그룹 최도훈 회장이 소리쳤습니다.
아들이 3년째 몰래 만난다는 여자. 월세 30만 원도 못내는 김밥집 사장이었어요.

사연 시작 전에 무료로 할 수 있는 구독과 좋아요 부탁드립니다.
사연봉투를 찾아 주신 모든 분들께 건강과 행복이 가득하시길 바랍니다.
오늘의 사연 시작하겠습니다.

2025년 4월에 어느 봄날 오후였습니다.
한진 그룹 회장실 63층에서 최도운 회장은 창밖을 바라보고 있었어요...
```

### 숏폼 전체 예시

```
그 여자, 결국 나를 배신했다.
구독과 좋아요 부탁드립니다.
3년을 함께 했는데, 마지막 순간 그녀는 그 남자를 선택했어요.
하지만 1년 후, 그녀가 울면서 다시 찾아왔을 때...
저는 이미 다른 사람과 행복했습니다.
```

### SORA2 전체 예시 (4개 씬)

```
씬 0 (훅 - 3초):
"이것은 당신의 마음을 울릴 이야기입니다."

씬 1 (CTA + 몰입 - 9초):
"구독과 좋아요 부탁드립니다.
10년 동안 그는 매일 같은 자리에서 그녀를 기다렸습니다."

씬 2 (반전 - 9초):
"그런데 마지막 날, 그녀가 나타났을 때...
그는 더 이상 그곳에 없었습니다."

씬 3 (중독 - 9초):
"1년 후, 그 자리에는 아름다운 꽃밭이 피어있었습니다.
그가 심은 마지막 선물이었죠."
```

---

## 🔧 트러블슈팅

### Q1: CTA가 포함되지 않는 경우

**롱폼**:
- `long_form_creator.py`의 `_generate_single_scene_narration`에서 scene_num == 1 확인
- 프롬프트에 CTA 필수 포함 문구 확인

**숏폼**:
- `short_story_user.txt`에서 "CTA 생략 금지" 확인
- 프롬프트 파일이 제대로 로드되는지 확인

**SORA2**:
- `prompt_sora2.txt`에서 "⚠️ 씬 1 CTA 필수 규칙" 확인
- `getSora2Prompt()` 함수가 올바른 파일을 로드하는지 확인
- 씬 1 narration이 "구독과 좋아요 부탁드립니다."로 시작하는지 확인

### Q2: 훅이 약한 경우

**해결**:
1. 프롬프트 템플릿의 예시를 더 강렬하게 수정
2. "충격적", "자극적", "강렬한" 등의 수식어 추가
3. 테스트 후 결과 확인

### Q3: 분량이 맞지 않는 경우

**롱폼**:
- `min_per_scene` 파라미터 조정
- scene_1은 다른 씬보다 길어야 함

**숏폼**:
- `target_chars` 파라미터를 150-170으로 조정
- duration을 50-60초로 조정

---

## 📚 참고 자료

### 유튜브 사연 예시
- https://www.youtube.com/watch?v=xajTg83Cv3U

### 생성된 파일
```
trend-video-backend/src/prompts/
├─ long_form_prompt.txt      # 롱폼 프롬프트
├─ short_story_system.txt    # 숏폼 시스템
└─ short_story_user.txt      # 숏폼 사용자

trend-video-frontend/prompts/
├─ prompt_sora2.txt          # SORA2 기본 프롬프트
└─ sora2_prompt.txt          # SORA2 상세 프롬프트

workspace/
├─ LONGFORM_STORY_GUIDE.md   # 롱폼 가이드
├─ SHORTFORM_STORY_GUIDE.md  # 숏폼 가이드
├─ SORA2_STORY_GUIDE.md      # SORA2 가이드
├─ test-story-generation.js  # 테스트 스크립트
└─ STORY_GENERATION_COMPLETE.md  # 이 문서
```

### 주요 코드 파일
```
trend-video-backend/src/video_generator/
├─ long_form_creator.py      # 롱폼 생성
└─ story_video_creator.py    # 숏폼 생성

trend-video-frontend/src/app/api/scripts/generate/
└─ route.ts                  # SORA2 프롬프트 로드
```

---

## 🎉 다음 단계

### 1. 프론트엔드에서 테스트

**롱폼**:
1. "롱폼 사연" 생성 요청
2. 제목: "재벌 회장과 김밥집 며느리"
3. scene_1에 훅 + CTA 확인

**숏폼**:
1. "숏폼 사연" 생성 요청
2. 제목: "배신과 복수"
3. CTA 자동 포함 확인

**SORA2**:
1. SORA2 영상 생성 요청
2. 제목: "감동적인 스토리"
3. 씬 1 narration에 CTA 포함 확인
4. 4개 씬 구조 확인

### 2. 실제 사용자 피드백

- 시청자 반응 확인
- 구독/좋아요 전환율 측정
- 개선점 파악

### 3. 지속적 개선

- 프롬프트 템플릿 최적화
- 새로운 스타일 실험
- A/B 테스트

---

## ✨ 핵심 요약

### ✅ 완료
- [x] 롱폼 프롬프트 템플릿 작성
- [x] 숏폼 프롬프트 템플릿 작성
- [x] SORA2 프롬프트 템플릿 업데이트
- [x] 코드 수정 (scene_1/씬 1 특별 처리)
- [x] 테스트 스크립트 작성 및 업데이트
- [x] 문서화 완료 (3개 가이드)
- [x] 테스트 통과 (29/29)

### 🎯 핵심 기능
- **훅**: 시청자 즉시 사로잡기
- **CTA**: 구독/좋아요 자동 유도
- **본문**: 감동적이고 몰입감 있는 스토리

### 🚀 바로 사용 가능
- 기존 코드 그대로 사용
- 프롬프트 템플릿 자동 로드
- 훅 + CTA 자동 적용

---

*개선 완료: 2025-11-15*
*테스트 통과: 29/29 ✅*
*롱폼/숏폼/SORA2 모두 적용 완료!*
*바로 사용 가능! 🎉*
