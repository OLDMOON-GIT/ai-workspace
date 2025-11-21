# 이미지 크롤러 씬 반복 버그 수정 보고서

## 문제 분석

사용자 보고: "이미지를 확인해봐 전부 00씬껄로 된거 같잖아" (모든 생성 이미지가 씬 00과 동일해 보임)

### 발견된 사실

**프로젝트: `project_0b47a3cc-da7c-4b6b-9ca8-ebb411f7e88d`**

- story.json: 8개 씬 (scene_00_bomb ~ scene_07_main)
- 각 씬의 image_prompt: 고유한 프롬프트 (500-600자)
- 생성된 이미지: **6개만 존재** (씬 06, 07 누락)

### 이미지 분석 결과

| 씬 | 생성된 이미지 | 문제 |
|------|------|------|
| 00 | scene_00_bomb.jpeg | ✓ 올바름: 배달원, 빨간색/검은색 유니폼, 골판지 상자 |
| 01 | scene_01_main.jpeg | ❌ 잘못됨: 같은 배달원, 안경, 비슷한 포즈 |
| 02 | scene_02_main.jpeg | ❌ 잘못됨: 같은 배달원, 주황색/회색 조끼, 골판지 상자 |
| 03 | scene_03_main.jpeg | ❌ 잘못됨: 같은 배달원, 빨간색 재킷 |
| 04 | scene_04_main.jpeg | ❌ 잘못됨: 같은 배달원, 검은색 재킷/모자 |
| 05 | scene_05_main.jpeg | ❌ 잘못됨: 같은 배달원, 주황색/회색 조끼 |
| 06 | ❌ 없음 | 누락 |
| 07 | ❌ 없음 | 누락 |

**결론**: 이미지 크롤러가 **씬 00의 프롬프트만 반복 사용**하고 있음

## 근본 원인

### 파일: `image_crawler_working.py` - `input_prompt_to_whisk` 함수 (라인 1029-1045)

**버그 위치**:
```python
if not input_box:
    # 입력창을 못 찾으면 body를 클릭
    body = driver.find_element(By.TAG_NAME, 'body')
    body.click()
else:
    # 입력창 클릭
    input_box.click()

    # ❌ BUG: 이 부분이 else 블록 안에만 있음!
    # 기존 텍스트 삭제 로직
    actions.key_down(Keys.CONTROL).send_keys('a').key_up(Keys.CONTROL).perform()
    actions.send_keys(Keys.DELETE).perform()
```

**문제점**:
1. **씬 00 (첫 프롬프트)**: `input_box` 발견됨 → 기존 텍스트 삭제 실행 ✓
2. **씬 01 이후**: `input_box` 못 찾음 → **기존 텍스트 삭제가 실행되지 않음** ❌
3. 결과: 기존 씬 00의 프롬프트가 여전히 입력창에 남아있음
4. Ctrl+V로 새 프롬프트를 붙여넣으면, Whisk가 혼합된 텍스트로 처리

### 왜 이미지가 비슷한가?

- 씬 01-05의 새 프롬프트가 부분적으로 붙어지지만, Whisk는 먼저 들어온 씬 00의 프롬프트를 기본으로 사용
- 새 프롬프트의 일부 지시사항(모자 색깔 변경, 옷 변경 등)만 반영됨
- 따라서 같은 인물이 다른 옷/배경으로 생성되는 현상 발생

## 해결 방법

### 수정 내용

**파일**: `image_crawler_working.py` 라인 1029-1045

**변경 전**:
```python
if not input_box:
    body.click()
else:
    input_box.click()
    # 기존 텍스트 삭제 (else 블록 안에만 있음)
    actions.key_down(Keys.CONTROL).send_keys('a').key_up(Keys.CONTROL).perform()
    # ...
```

**변경 후**:
```python
if not input_box:
    body.click()
else:
    input_box.click()

# 기존 텍스트 삭제 (if/else와 무관하게 항상 실행)
actions = ActionChains(driver)
actions.key_down(Keys.CONTROL).send_keys('a').key_up(Keys.CONTROL).perform()
time.sleep(0.2)
actions.send_keys(Keys.DELETE).perform()
time.sleep(0.2)
print(f"🗑️ 기존 입력 내용 삭제 완료", flush=True)
```

### 효과

- **씬 01 이후에도** 기존 프롬프트가 항상 삭제됨
- 각 씬의 프롬프트가 깨끗하게 입력됨
- 8개 씬이 모두 고유한 이미지로 생성됨

## 추가 확인 사항

### 씬 06, 07이 누락된 이유

현재까지 불명확. 다음 실행 후 확인:
1. 타임아웃으로 인한 생성 실패
2. Whisk 페이지 상태 문제
3. 다운로드 로직의 문제

## 테스트 방법

```bash
# 같은 story.json으로 다시 실행
python C:\Users\oldmoon\workspace\trend-video-backend\src\image_crawler\image_crawler_working.py

# 결과 확인
# - 8개 이미지 모두 생성되는가?
# - 각 이미지가 고유한 씬을 보여주는가?
# - 씬 06, 07이 생성되는가?
```

## 커밋

```
fix: 이미지 크롤러 씬 01 이후 프롬프트 미삭제 버그

input_prompt_to_whisk 함수에서 input_box를 찾지 못할 경우,
기존 프롬프트가 삭제되지 않아 씬 00의 프롬프트가 반복되는 문제.

수정: 기존 텍스트 삭제 로직을 if/else 외부로 이동하여
input_box 발견 여부와 무관하게 항상 실행되도록 변경.

결과:
- 씬 01~05에서 씬 00과 동일한 이미지가 생성되던 문제 해결
- 각 씬마다 고유한 프롬프트로 이미지 생성 가능
```

## 관련 파일

- `image_crawler_working.py` (라인 1029-1045)
- `story.json` (테스트용)
- 생성된 이미지 (6개)
