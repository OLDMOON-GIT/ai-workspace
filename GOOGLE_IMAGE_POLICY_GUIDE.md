# Google 이미지 생성 정책 준수 가이드

이 문서는 Whisk/ImageFX 등 Google 이미지 생성 도구를 사용할 때 정책 위반을 방지하기 위한 가이드입니다.

## 개요

Google의 이미지 생성 서비스(Whisk, ImageFX)는 특정 콘텐츠 정책을 준수해야 합니다.
정책을 위반하는 프롬프트는 이미지 생성이 거부되며, 자동화된 워크플로우가 중단될 수 있습니다.

## 금지된 콘텐츠 유형

### 1. 브랜드 및 로고
- ❌ 실제 브랜드명 (Nike, Apple, Samsung, Disney, Marvel 등)
- ❌ 로고 및 상표
- ✅ 대체: 일반적인 설명 (athletic shoes, smartphone, laptop 등)

**예시:**
- ❌ "Nike running shoes on marble"
- ✅ "Athletic running shoes on marble"
- ❌ "iPhone on wooden table"
- ✅ "Modern smartphone on wooden table"

### 2. 실제 인물
- ❌ 유명인, 정치인, 배우, 가수, 운동선수 등
- ❌ "celebrity", "famous person" 등의 표현
- ✅ 대체: 일반적인 사람 설명 (person, woman, man 등)

**예시:**
- ❌ "Celebrity holding a microphone"
- ✅ "Person holding a microphone"

### 3. 폭력적 표현
- ❌ blood, gore, weapon, gun, knife, fight, combat, violence, war, explosion
- ✅ 대체: dynamic, energetic, tool, device, interact

**예시:**
- ❌ "Violent action scene"
- ✅ "Dynamic action scene"

### 4. 성인/선정적 콘텐츠
- ❌ sexy, nude, naked, intimate, romantic (in certain contexts)
- ✅ 대체: elegant, stylish, graceful

**예시:**
- ❌ "Sexy model in a dress"
- ✅ "Elegant model in a dress"

### 5. 위험한 활동
- ❌ drunk, alcohol, smoking, drug, dangerous, reckless
- ✅ 대체: safe, controlled, professional

## 프롬프트 작성 가이드

### 상품 이미지 프롬프트 작성 시

1. **브랜드명 제거**
   - 상품명에서 브랜드를 제거하고 카테고리로 대체
   - "Apple Watch" → "smartwatch"
   - "Samsung Galaxy" → "modern smartphone"

2. **안전한 배경 및 설정**
   - 전문적이고 깔끔한 배경 선택
   - "professional studio lighting"
   - "clean white background"
   - "marble surface"
   - "wooden table"

3. **구체적이지만 안전한 설명**
   - 제품의 특징을 일반적인 용어로 설명
   - "wireless earbuds with charging case"
   - "sleek laptop with modern design"
   - "colorful athletic shoes"

### 좋은 프롬프트 예시

```
✅ "Professional product photo of wireless earbuds on a marble surface, studio lighting, high quality, clean composition"

✅ "Modern smartwatch displayed on a wooden stand, professional photography, soft shadows, minimalist background"

✅ "Athletic running shoes with colorful design on white background, product photography, professional lighting"

✅ "Elegant cosmetic bottle on a clean white surface, professional studio setup, soft lighting"
```

### 피해야 할 프롬프트 예시

```
❌ "Nike Air Max shoes on display"
- 문제: 브랜드명 포함

❌ "Celebrity wearing designer watch"
- 문제: 유명인 언급

❌ "iPhone 15 Pro with Apple logo"
- 문제: 브랜드명 및 로고 언급

❌ "Sexy model holding perfume bottle"
- 문제: 선정적 표현
```

## 자동화 구현

### 이미지 크롤러 (image_crawler_working.py)

현재 구현된 자동 정책 준수 기능:

1. **정책 위반 감지**
   - `detect_policy_violation(driver)`: 페이지에서 정책 위반 메시지 자동 감지
   - 2개 이상의 정책 관련 키워드 발견 시 위반으로 판단

2. **프롬프트 자동 안전화**
   - `sanitize_prompt_for_google(prompt, aggressive=False)`: 프롬프트에서 위험 키워드 제거
   - 2단계 모드:
     - 기본 모드: 브랜드명, 폭력적 표현 등 필터링
     - 강화 모드: 안전 프리픽스 추가 및 강력한 필터링

3. **자동 재시도 로직**
   - 1차 시도: 원본 프롬프트 사용
   - 2차 시도: 기본 안전화 적용
   - 3차 시도: 강화 안전화 적용

### 프롬프트 생성 API에서 적용

스크립트 생성 시 (story.json 생성) 다음 원칙을 시스템 프롬프트에 포함:

```
You are generating image prompts for Google's image generation services (Whisk/ImageFX).
Follow these strict guidelines:

1. NEVER mention specific brands, logos, or trademarks
2. NEVER reference real people, celebrities, or famous figures
3. AVOID violent, sexual, or dangerous content descriptions
4. USE generic terms: "smartphone" instead of "iPhone", "athletic shoes" instead of "Nike"
5. FOCUS on professional, safe-for-work descriptions
6. USE descriptive but neutral language

Example:
- Bad: "Nike running shoes worn by athlete"
- Good: "Professional athletic running shoes on marble surface"
```

## 테스트 및 모니터링

### 정책 위반 확인 방법

1. 이미지 크롤러 로그 확인
   ```
   🔍 정책 위반 여부 확인 중...
   ⚠️ Google 정책 위반 감지!
      매칭 키워드: ['policy', 'violation', '위반']
   ```

2. 재시도 로직 작동 확인
   ```
   🔄 프롬프트 안전화 적용 (기본 모드)
   🔒 프롬프트 안전화 적용됨 (aggressive=False)
   ```

3. 최종 성공 확인
   ```
   ✅ scene_01 입력 완료 (정책 위반 없음)
   ```

## 추가 리소스

- Google Generative AI 정책: https://policies.google.com/terms/generative-ai
- 이미지 생성 가이드라인: 안전하고 전문적인 콘텐츠 생성에 중점

## 업데이트 내역

- 2025-01-XX: 초기 문서 작성 및 자동화 구현
- 정책 위반 감지 및 자동 재시도 기능 추가
- 3단계 점진적 안전화 로직 구현
