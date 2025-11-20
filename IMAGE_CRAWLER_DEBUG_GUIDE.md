# 이미지 크롤러 버그 디버깅 가이드

## 문제
8개 씬을 가져오는데 씬 1이 여러 번 호출되는 버그

예상 동작: 씬 0 → 씬 1 → 씬 2 → ... → 씬 7 (순서대로 1번씩)
현재 동작: 씬 0 → 씬 1 → 씬 1 → 씬 1 (씬 1만 반복)

## 중요: story.json 포맷

이미지 크롤러는 다음 프롬프트 필드를 지원합니다:

```json
{
  "scenes": [
    {
      "sora_prompt": "...",  ← story.json에서 사용
      "image_prompt": "..." (대체 필드)
    }
  ]
}
```

**우선순위:**
1. `image_prompt` (있으면 먼저 사용)
2. `sora_prompt` (image_prompt가 없으면 사용) ← **story.json의 기본값**
3. 없으면 씬 건너뜀

## 추가된 디버깅 로그

### 1. 씬 처리 시작 로그 (라인 1447-1450)
```python
print(f"\n{'='*80}")
print(f"🔄 씬 처리 시작: 인덱스 {i}/{len(scenes)-1}")
print(f"   scene_id: {scene.get('scene_id')}")
print(f"   scene_number: {scene_number}")
print(f"{'='*80}")
```

**확인할 사항:**
- 인덱스가 0부터 7까지 순차적으로 증가하는가?
- scene_id가 올바르게 읽혀지는가?
- scene_id가 같은 것이 반복되는가?

### 1.5 프롬프트 필드 감지 로그 (라인 1470-1473)
```python
print(f"\n🔍 {scene_number} 프롬프트 확인:")
print(f"   📍 출처: {prompt_source}")  # ← image_prompt 또는 sora_prompt
print(f"   첫 100자: {prompt[:100]}...")
print(f"   마지막 50자: ...{prompt[-50:]}")
```

**확인할 사항:**
- 📍 출처가 `sora_prompt`인가? (story.json에서는 대부분 sora_prompt 사용)
- 프롬프트가 올바르게 읽혀지는가?
- 프롬프트가 너무 짧지는 않은가?

### 2. 프롬프트 입력 함수 호출 로그 (라인 1496-1498)
```python
print(f"\n📝 프롬프트 입력 함수 호출: {scene_number} (시도 {attempt + 1}/{max_retries})")
success = input_prompt_to_whisk(driver, safe_prompt, is_first=(i == 0 and attempt == 0))
print(f"   결과: {'✅ 성공' if success else '❌ 실패'}")
```

**확인할 사항:**
- 각 씬이 1회씩만 호출되는가?
- 어느 씬에서 호출이 중단되는가?
- 재시도(retry)가 발생하는가?

### 3. 함수 진입/종료 로그 (라인 1006-1007, 1110, 1115)
```python
# 진입
print(f"   [input_prompt_to_whisk] 시작")
print(f"   is_first: {is_first}, prompt 길이: {len(prompt)}")

# 종료
print(f"   [input_prompt_to_whisk] 완료 (button found: {generate_button_found})")
# 또는 예외
print(f"   [input_prompt_to_whisk] 예외 발생")
```

**확인할 사항:**
- 함수가 정상적으로 완료되는가?
- 생성 버튼이 발견되는가?
- 예외가 발생하는가?

## 테스트 방법

### 1. 테스트 씬 데이터 준비
```bash
# test-scenes-debug.json 파일 생성 (8개 씬)
node test-image-crawler-bug.js
```

### 2. 이미지 크롤러 실행
```bash
cd C:\Users\oldmoon\workspace\trend-video-frontend

# API 호출로 테스트
curl -X POST http://localhost:3000/api/images/crawl \
  -H "Content-Type: application/json" \
  -d '{
    "scenes": [...8개씬...],
    "contentId": "test_project",
    "useImageFX": false
  }'
```

### 3. 로그 분석

실행 시 출력되는 로그를 분석합니다:

```
============================================================================
🔄 씬 처리 시작: 인덱스 0/7
   scene_id: scene_00_bomb
   scene_number: scene_00_bomb
============================================================================

🔍 scene_00_bomb 프롬프트 확인:
   첫 100자: Korean elderly woman shocked expression - SCENE 0...
   마지막 50자: ...SCENE 0

📝 프롬프트 입력 함수 호출: scene_00_bomb (시도 1/3)
   [input_prompt_to_whisk] 시작
   is_first: True, prompt 길이: 60
📋 클립보드에 복사: Korean elderly woman shocked expression ...
...
   [input_prompt_to_whisk] 완료 (button found: True)
   결과: ✅ 성공

⏳ 다음 씬까지 3초 대기 중 (Whisk 처리 시간 확보)...

============================================================================
🔄 씬 처리 시작: 인덱스 1/7  ← 씬 인덱스가 1로 진행됨
   scene_id: scene_01_main
   scene_number: scene_01_main
============================================================================
...
```

## 예상되는 버그 원인들

### 1. 씬 데이터 문제
- 입력 JSON에 같은 씬이 여러 개 있음
- 씬 ID가 올바르게 설정되지 않음
- `for i in range(len(scenes))` 루프에서 씬 데이터가 제대로 읽혀지지 않음

**확인 방법:**
```
🔄 씬 처리 시작: 인덱스 0/7
   scene_id: scene_00_bomb  ✅
🔄 씬 처리 시작: 인덱스 1/7
   scene_id: scene_00_bomb  ❌ (같은 씬이 반복)
```

### 2. 함수 호출 문제
- `input_prompt_to_whisk` 함수가 실패하면서 루프에서 중단
- 재시도 로직에서 같은 씬을 여러 번 처리

**확인 방법:**
```
📝 프롬프트 입력 함수 호출: scene_00_bomb (시도 1/3)
   결과: ❌ 실패
📝 프롬프트 입력 함수 호출: scene_00_bomb (시도 2/3)
   결과: ❌ 실패  ← 재시도가 발생
```

### 3. 페이지 상태 문제
- Whisk 페이지가 제대로 로드되지 않음
- 생성 버튼 클릭 후 페이지가 변경되지 않음
- 다음 씬으로 진행할 수 없음

**확인 방법:**
- `[input_prompt_to_whisk] 완료 (button found: False)` 로그 확인
- 생성 버튼을 찾지 못하는 로그 확인

## 추가 테스트 체크리스트

- [ ] 씬 인덱스가 0부터 7까지 순차적으로 진행되는가?
- [ ] 각 씬의 scene_id가 올바른가?
- [ ] 각 씬마다 `input_prompt_to_whisk` 함수가 1회 호출되는가?
- [ ] 생성 버튼이 성공적으로 발견되고 클릭되는가?
- [ ] 재시도 로직이 발동되는가? (발동되면 문제 있음)
- [ ] 전체 8개 씬이 모두 처리되는가?

## 해결 후 테스트

로그를 추가한 후 다음 명령어로 테스트합니다:

```bash
# 백엔드 이미지 크롤러 직접 실행
python trend-video-backend/src/image_crawler/image_crawler_working.py test-scenes-debug.json
```

로그를 분석하여 다음 순서로 확인합니다:

1. **씬 처리 순서 확인**
   - 인덱스가 0부터 7까지 순차적인가?

2. **프롬프트 입력 성공 확인**
   - 모든 씬의 프롬프트가 성공적으로 입력되는가?

3. **생성 버튼 발견 확인**
   - 모든 씬의 생성 버튼이 발견되는가?

4. **오류 및 예외 확인**
   - 예외가 발생하는 씬이 있는가?

## 로그 출력 예시

정상 실행 시 로그:
```
================================================================================
🔄 씬 처리 시작: 인덱스 0/7
   scene_id: scene_00_hook
   scene_number: scene_00_hook
================================================================================

🔍 scene_00_hook 프롬프트 확인:
   📍 출처: sora_prompt  ← story.json에서 sora_prompt 사용
   첫 100자: Vertical 9:16 format, portrait orientation, cinematic product hero...
   마지막 50자: ...depth of field shallow to emphasize the fabric quality

📝 프롬프트 입력 함수 호출: scene_00_hook (시도 1/3)
   [input_prompt_to_whisk] 시작
   is_first: True, prompt 길이: 1243
   결과: ✅ 성공
   [input_prompt_to_whisk] 완료 (button found: True)

⏳ 다음 씬까지 3초 대기 중 (Whisk 처리 시간 확보)...

================================================================================
🔄 씬 처리 시작: 인덱스 1/7  ← 인덱스가 1로 진행
   scene_id: scene_01_problem
   scene_number: scene_01_problem
================================================================================

🔍 scene_01_problem 프롬프트 확인:
   📍 출처: sora_prompt  ← sora_prompt 필드 사용
   첫 100자: Vertical 9:16 format, portrait orientation, cinematic lifestyle...

... (씬 2~7 계속) ...
```

비정상 실행 시 로그:
```
🔄 씬 처리 시작: 인덱스 0/7
   scene_id: scene_00_bomb
📝 프롬프트 입력 함수 호출: scene_00_bomb (시도 1/3)
   [input_prompt_to_whisk] 시작
   결과: ❌ 실패  ← 첫 번째 실패
   [input_prompt_to_whisk] 예외 발생
📝 프롬프트 입력 함수 호출: scene_00_bomb (시도 2/3)
   [input_prompt_to_whisk] 시작
   결과: ❌ 실패  ← 재시도해도 실패
   [input_prompt_to_whisk] 예외 발생
📝 프롬프트 입력 함수 호출: scene_00_bomb (시도 3/3)
   결과: ❌ 실패
   최대 재시도 횟수 초과, 다음 씬으로 이동

🔄 씬 처리 시작: 인덱스 1/7
   scene_id: scene_01_main
...  (계속 진행)
```

## 다음 단계

로그를 분석한 후:

1. **원인 파악**
   - 씬 데이터 문제인가?
   - 함수 호출 문제인가?
   - 페이지 상태 문제인가?

2. **해결책 선택**
   - 입력 데이터 검증 추가
   - 함수 로직 수정
   - Whisk 페이지 상태 확인 추가

3. **재테스트**
   - 수정 후 동일한 테스트 실행
   - 로그로 정상 동작 확인

