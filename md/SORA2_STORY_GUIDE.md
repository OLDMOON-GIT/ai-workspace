# SORA2 영상 생성 가이드

## 개선 내용 (2025-11-15)

유튜브 사연 영상의 표준 구조(훅 + CTA)를 SORA2 AI 비디오 생성에도 적용했습니다.

---

## 주요 변경사항

### 1. 프롬프트 템플릿 파일 업데이트

#### `prompt_sora2.txt`
- **위치**: `trend-video-frontend/prompts/prompt_sora2.txt`
- **내용**: SORA2 기본 프롬프트에 CTA 규칙 추가

#### `sora2_prompt.txt`
- **위치**: `trend-video-frontend/prompts/sora2_prompt.txt`
- **내용**: SORA2 상세 프롬프트에 CTA 규칙 추가

### 2. 스토리 구조 개선

**필수 구조 (30초)**:

```
1) 씬 0 (훅) - 3초
   └─ 충격적이고 강렬한 오프닝

2) 씬 1 (CTA + 몰입) - 9초 ⭐ 핵심 변경
   └─ "구독과 좋아요 부탁드립니다." (필수)
   └─ 감정 이입 유도 스토리

3) 씬 2 (반전) - 9초
   └─ WTF 순간 (예상 못한 전개)

4) 씬 3 (중독) - 9초
   └─ 다시 보고 싶게 만드는 마무리
```

**총 분량**: 30초
**형식**: 9:16 세로형

---

## 롱폼/숏폼/SORA2 비교

| 구분 | 롱폼 | 숏폼 | SORA2 |
|------|------|------|-------|
| **길이** | 60분+ | 60초 | 30초 |
| **형식** | 나레이션 | 나레이션 | AI 영상 + 나레이션 |
| **씬 수** | 12+ | 단일 | 4개 (훅+CTA+반전+중독) |
| **훅** | 30초-1분 | 5-10초 | 3초 |
| **CTA 위치** | Scene 1 | 전체 스토리 중간 | Scene 1 |
| **CTA 멘트** | 상세 (장문) | 간결 (짧게) | 간결 (짧게) |

### CTA 멘트 비교

**롱폼 CTA** (상세):
```
사연 시작 전에 무료로 할 수 있는 구독과 좋아요 부탁드립니다.
사연봉투를 찾아 주신 모든 분들께 건강과 행복이 가득하시길 바랍니다.
오늘의 사연 시작하겠습니다.
```

**숏폼 CTA** (간결):
```
구독과 좋아요 부탁드립니다.
```

**SORA2 CTA** (간결 - 숏폼과 동일):
```
구독과 좋아요 부탁드립니다.
```

---

## 사용 방법

### 프론트엔드에서 SORA2 생성

SORA2 영상을 생성하면 자동으로 씬 1에 CTA가 포함됩니다.

**생성되는 JSON 구조**:

```json
{
  "title": "SORA2 비디오 제목",
  "version": "sora2-2.0-shortform-aligned",
  "scenes": [
    {
      "scene_id": "scene_00_hook",
      "scene_name": "훅 - 3초 충격",
      "duration_seconds": 3,
      "narration": "첫 3초 안에 시청자 관심을 끄는 충격적인 문장..."
    },
    {
      "scene_id": "scene_01_immersion",
      "scene_name": "CTA + 몰입 - 9초 감정 이입",
      "duration_seconds": 9,
      "narration": "구독과 좋아요 부탁드립니다. 감정 이입을 유도하는 스토리..."
    },
    {
      "scene_id": "scene_02_wtf",
      "scene_name": "반전 - 9초 WTF 순간",
      "duration_seconds": 9,
      "narration": "예상 못한 반전..."
    },
    {
      "scene_id": "scene_03_addictive",
      "scene_name": "중독 - 9초 다시보기 유도",
      "duration_seconds": 9,
      "narration": "만족스럽고 기억에 남는 마무리..."
    }
  ]
}
```

---

## 프롬프트 커스터마이징

### CTA 멘트 변경

`trend-video-frontend/prompts/prompt_sora2.txt` 수정:

```
⚠️ **씬 1 CTA 필수 규칙:**
- 반드시 "구독과 좋아요 부탁드립니다." 포함
- CTA 멘트 후 감정 이입 스토리 전개
- 생략 절대 금지
```

원하는 CTA 멘트로 변경 가능:
- "무료 구독과 좋아요 눌러주세요!"
- "구독 좋아요로 응원 부탁드려요!"

---

## 테스트 방법

### 1. 자동 테스트 실행

```bash
node test-story-generation.js
```

**확인 사항**:
- ✅ SORA2 프롬프트 파일 존재
- ✅ CTA 필수 규칙 포함
- ✅ scene_1에 CTA 포함
- ✅ narration에 CTA 예시 포함

### 2. 실제 생성 테스트

#### 프론트엔드에서:
1. SORA2 영상 생성 요청
2. 제목: "감동적인 스토리"
3. 생성 완료 후 JSON 확인

#### 확인할 점:
- ✅ scene_01의 narration이 "구독과 좋아요 부탁드립니다."로 시작하는가?
- ✅ 훅 → CTA → 몰입 순서가 맞는가?
- ✅ 총 4개 씬이 생성되었는가?
- ✅ 총 30초 분량이 맞는가?

---

## 주의사항

### ✅ 필수 요소
- 씬 1에 반드시 CTA 포함
- 9:16 세로형 포맷
- 슬로우 모션 시네마틱 스타일
- 4개 씬 구조 준수

### ❌ 금지사항
- CTA 생략
- CTA 위치 변경 (씬 1 고정)
- 훅 약화
- 씬 순서 변경

---

## 트러블슈팅

### Q: CTA가 포함되지 않는 경우
**A**:
1. `prompt_sora2.txt`에서 "⚠️ 씬 1 CTA 필수 규칙" 섹션 확인
2. "생략 절대 금지" 문구가 있는지 확인
3. 프롬프트 파일이 최신 버전인지 확인

### Q: CTA 위치가 잘못된 경우
**A**:
- SORA2는 씬 1에만 CTA가 포함되어야 합니다.
- 다른 씬에는 CTA가 포함되면 안 됩니다.

### Q: 분량이 맞지 않는 경우
**A**:
- 씬 0: 3초 (50자)
- 씬 1: 9초 (150자)
- 씬 2: 9초 (150자)
- 씬 3: 9초 (150자)
- 총 30초 분량 준수

---

## 예시 스크립트

### 예시 1: 감동 스토리

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

### 예시 2: 반전 스토리

```
씬 0 (훅 - 3초):
"그날, 모든 것이 바뀌었습니다."

씬 1 (CTA + 몰입 - 9초):
"구독과 좋아요 부탁드립니다.
그는 평범한 회사원이었습니다. 하지만..."

씬 2 (반전 - 9초):
"알고 보니 그는 20년간 잠입한 비밀 요원이었습니다.
그리고 오늘이 마지막 임무였죠."

씬 3 (중독 - 9초):
"임무 완료 후, 그는 평범한 삶으로 돌아갔습니다.
아무도 그의 진짜 이야기를 모른 채로."
```

---

## 참고 자료

### 프롬프트 파일
- `trend-video-frontend/prompts/prompt_sora2.txt`
- `trend-video-frontend/prompts/sora2_prompt.txt`

### 관련 코드
- `trend-video-frontend/src/app/api/scripts/generate/route.ts`
  - `getSora2Prompt()` 함수 (line 102-143)

### 테스트
- `test-story-generation.js` - 자동 테스트 스크립트

### 관련 문서
- **롱폼 가이드**: [LONGFORM_STORY_GUIDE.md](LONGFORM_STORY_GUIDE.md)
- **숏폼 가이드**: [SHORTFORM_STORY_GUIDE.md](SHORTFORM_STORY_GUIDE.md)
- **종합 완료 문서**: [STORY_GENERATION_COMPLETE.md](STORY_GENERATION_COMPLETE.md)

---

## 기술적 세부사항

### SORA2 특징
- **AI 비디오 생성**: 영어 visual prompt로 영상 생성
- **한글 나레이션**: 한글로 스토리 작성 후 자막/음성 추가
- **시네마틱 스타일**: 영화 같은 고퀄리티 영상
- **모바일 최적화**: 9:16 세로형 포맷

### 프롬프트 로딩 방식
```typescript
async function getSora2Prompt(): Promise<string> {
  const promptsPath = path.join(process.cwd(), 'prompts');
  const files = await fs.readdir(promptsPath);

  // prompt_sora2.txt 또는 sora2_prompt.txt 우선 로드
  let promptFile = files.find(file => file === 'prompt_sora2.txt');
  if (!promptFile) {
    promptFile = files.find(file => file === 'sora2_prompt.txt');
  }

  if (promptFile) {
    const content = await fs.readFile(path.join(promptsPath, promptFile), 'utf-8');
    return content;
  }

  // 폴백 기본 프롬프트 반환
  return defaultSora2Prompt;
}
```

---

## 다음 단계

### 1. 프론트엔드에서 테스트
- SORA2 영상 생성 요청
- scene_1에 CTA 포함 확인
- 4개 씬 구조 확인

### 2. 실제 영상 생성 및 확인
- AI 비디오 생성 품질 확인
- 나레이션과 영상 싱크 확인
- CTA 자연스러움 확인

### 3. 사용자 피드백
- 시청자 반응 측정
- 구독/좋아요 전환율 확인
- CTA 효과 분석

---

## ✨ 핵심 요약

### ✅ 완료
- [x] SORA2 프롬프트 템플릿 업데이트
- [x] CTA 씬 1 자동 포함
- [x] 테스트 스크립트 업데이트
- [x] 문서화 완료
- [x] 테스트 통과 (29/29)

### 🎯 핵심 기능
- **훅 (3초)**: 시청자 즉시 사로잡기
- **CTA (씬 1 시작)**: 구독/좋아요 자동 유도
- **반전 (씬 2)**: WTF 순간으로 몰입 극대화
- **중독 (씬 3)**: 다시 보고 싶게 만드는 마무리

### 🚀 바로 사용 가능
- 기존 SORA2 생성 방식 그대로 사용
- 프롬프트 템플릿 자동 로드
- 훅 + CTA 자동 적용

---

*개선 완료: 2025-11-15*
*테스트 통과: 29/29 ✅*
*바로 사용 가능! 🎉*
