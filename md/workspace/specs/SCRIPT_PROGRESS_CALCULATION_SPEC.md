# 대본 생성 진행률 계산 스펙

## 📋 문제점

**현재 상황:**
- 대본 생성 시작 시 진행률이 90%로 표시됨
- 롱폼 대본 생성은 실제로 3분 가까이 소요됨
- 진행률이 실제 소요 시간을 반영하지 못함

**사용자 요구사항:**
- 글자수를 기준으로 예상 시간 계산
- 실제 소요 시간에 맞는 진행률 표시

---

## 🎯 목표

예상 글자수를 기반으로 대본 생성 소요 시간을 예측하고, 실시간으로 정확한 진행률을 표시합니다.

---

## 📊 글자수별 예상 시간

### prompt_format별 평균 글자수

| 형식 | 평균 글자수 | 예상 소요 시간 | 설명 |
|------|-------------|----------------|------|
| **longform** | 3,000 - 5,000자 | 2.5 - 3분 | 10분 이상 롱폼 영상 |
| **shortform** | 500 - 800자 | 30초 - 1분 | 1분 이내 숏폼 영상 |
| **product** | 800 - 1,200자 | 1 - 1.5분 | 상품 소개 영상 |
| **product-info** | 1,000 - 1,500자 | 1 - 1.5분 | 상품 정보 기반 |
| **sora2** | 2,000 - 3,000자 | 2 - 2.5분 | Sora 영상용 |

### AI 모델별 속도 차이

| AI 모델 | 속도 배수 | 설명 |
|---------|----------|------|
| **gemini** | 1.0x | 기준 (가장 빠름) |
| **chatgpt** | 1.2x | Gemini 대비 20% 느림 |
| **claude** | 1.5x | Gemini 대비 50% 느림 |

---

## 🧮 진행률 계산 공식

### 1. 예상 소요 시간 계산

```typescript
interface ProgressEstimation {
  promptFormat: 'longform' | 'shortform' | 'product' | 'product-info' | 'sora2';
  aiModel: 'claude' | 'chatgpt' | 'gemini';
  category?: string;
}

// 글자수 예측
function estimateCharacterCount(format: string): number {
  const charCountMap = {
    'longform': 4000,     // 평균 4,000자
    'shortform': 650,     // 평균 650자
    'product': 1000,      // 평균 1,000자
    'product-info': 1250, // 평균 1,250자
    'sora2': 2500         // 평균 2,500자
  };
  return charCountMap[format] || 1000;
}

// AI 모델 속도 배수
function getModelSpeedMultiplier(model: string): number {
  const speedMap = {
    'gemini': 1.0,
    'chatgpt': 1.2,
    'claude': 1.5
  };
  return speedMap[model] || 1.0;
}

// 예상 소요 시간 (초)
function estimateGenerationTime(
  promptFormat: string,
  aiModel: string
): number {
  const baseChars = estimateCharacterCount(promptFormat);
  const modelMultiplier = getModelSpeedMultiplier(aiModel);

  // 글자당 소요 시간: 약 0.04초/글자 (기준: Gemini)
  const baseTime = baseChars * 0.04;

  return baseTime * modelMultiplier;
}
```

### 2. 실시간 진행률 계산

```typescript
class ScriptProgressTracker {
  private startTime: number;
  private estimatedDuration: number;
  private currentProgress: number = 0;

  constructor(
    promptFormat: string,
    aiModel: string
  ) {
    this.startTime = Date.now();
    this.estimatedDuration = estimateGenerationTime(promptFormat, aiModel) * 1000; // ms로 변환
  }

  // 경과 시간 기반 진행률 계산
  getProgress(): number {
    const elapsed = Date.now() - this.startTime;
    const rawProgress = (elapsed / this.estimatedDuration) * 100;

    // 진행률 보정 (너무 빠르거나 느리지 않게)
    if (rawProgress < 10) return 10;        // 최소 10% (시작 직후)
    if (rawProgress > 95) return 95;        // 최대 95% (완료 직전)

    return Math.floor(rawProgress);
  }

  // Python 스크립트가 실제 씬 수를 알려주면 더 정확하게 계산
  updateWithSceneInfo(currentScene: number, totalScenes: number): void {
    const sceneProgress = (currentScene / totalScenes) * 100;
    const timeProgress = this.getProgress();

    // 씬 진행과 시간 진행의 평균
    this.currentProgress = Math.floor((sceneProgress + timeProgress) / 2);
  }
}
```

---

## 🔧 구현 위치

### 1. 백엔드: Python 스크립트에서 진행률 업데이트

**파일**: `trend-video-backend/src/ai_aggregator/main.py`

```python
import time
import sys

def update_progress(task_id: str, progress: int):
    """진행률을 DB에 업데이트"""
    # MySQL에 진행률 저장
    db.execute("""
        UPDATE content
        SET progress = ?
        WHERE content_id = ?
    """, (progress, task_id))

    # 또는 로그 출력 (워커가 파싱)
    print(f"PROGRESS: {progress}%", flush=True)

def generate_script_with_progress(task_id: str, prompt_format: str):
    start_time = time.time()
    total_scenes = estimate_scene_count(prompt_format)

    # 시작
    update_progress(task_id, 10)

    # AI 호출 및 씬별 진행률 업데이트
    for scene_idx in range(total_scenes):
        # 씬 생성...
        scene_progress = int(10 + (scene_idx / total_scenes) * 80)
        update_progress(task_id, scene_progress)

    # 완료
    update_progress(task_id, 100)
```

### 2. 워커: unified-worker.js에서 진행률 파싱

**파일**: `trend-video-frontend/src/workers/unified-worker.js`

```javascript
// Python 스크립트 stdout 파싱
pythonProcess.stdout.on('data', (data) => {
  const output = data.toString();

  // PROGRESS: 50% 형식 파싱
  const progressMatch = output.match(/PROGRESS: (\d+)%/);
  if (progressMatch) {
    const progress = parseInt(progressMatch[1]);

    // DB 업데이트
    await updateDb.query(`
      UPDATE content
      SET progress = ?
      WHERE content_id = ?
    `, [progress, taskId]);

    console.log(`📝 [script] Progress: ${progress}%`);
  }
});
```

### 3. 프론트엔드: 진행률 표시

**파일**: `trend-video-frontend/src/app/automation/page.tsx`

**현재 코드 (Line 4578-4580):**
```tsx
{progressMap[title.id]?.scriptProgress !== undefined && (
  <span className="text-blue-400 text-sm">
    📝 {progressMap[title.id].scriptProgress}%
  </span>
)}
```

**유지 (변경 없음)** - 백엔드에서 정확한 진행률을 제공하면 자동으로 반영됨

---

## 📈 진행률 단계별 표시

### 시각적 피드백 개선

```tsx
function getProgressColor(progress: number): string {
  if (progress < 30) return 'text-blue-400';
  if (progress < 70) return 'text-yellow-400';
  if (progress < 95) return 'text-green-400';
  return 'text-green-500 animate-pulse'; // 완료 직전
}

function getProgressEmoji(progress: number): string {
  if (progress < 30) return '🔄';
  if (progress < 70) return '⏳';
  if (progress < 95) return '✍️';
  return '✅';
}

// 사용
<span className={getProgressColor(progress)}>
  {getProgressEmoji(progress)} {progress}%
</span>
```

---

## 🧪 테스트 케이스

### 1. 롱폼 (4,000자, Gemini)

| 경과 시간 | 예상 진행률 | 실제 동작 |
|-----------|-------------|-----------|
| 0초 | 10% | 시작 |
| 30초 | 19% | 씬 1/10 생성 중 |
| 60초 | 38% | 씬 4/10 생성 중 |
| 90초 | 56% | 씬 6/10 생성 중 |
| 120초 | 75% | 씬 8/10 생성 중 |
| 150초 | 94% | 씬 10/10 생성 중 |
| 160초 | 100% | 완료 |

**예상 소요 시간**: `4000 * 0.04 * 1.0 = 160초` (약 2분 40초)

### 2. 숏폼 (650자, ChatGPT)

| 경과 시간 | 예상 진행률 | 실제 동작 |
|-----------|-------------|-----------|
| 0초 | 10% | 시작 |
| 10초 | 32% | 씬 1/4 생성 중 |
| 20초 | 63% | 씬 2/4 생성 중 |
| 25초 | 95% | 씬 4/4 생성 중 |
| 31초 | 100% | 완료 |

**예상 소요 시간**: `650 * 0.04 * 1.2 = 31.2초`

---

## ⚠️ 주의사항

### 1. 진행률은 어디까지나 "예상"

- AI 응답 속도는 서버 상태에 따라 달라질 수 있음
- 네트워크 지연도 영향을 미침
- 따라서 진행률은 95%를 넘기지 않고, 실제 완료 시에만 100% 표시

### 2. 백그라운드 작업 고려

- 워커가 대본 생성 중일 때 진행률 업데이트
- 스케줄 대기 중일 때는 진행률 표시 안 함

### 3. 에러 처리

```typescript
// 예상 시간의 2배가 지나도 완료 안 되면 타임아웃 경고
if (elapsed > estimatedDuration * 2) {
  console.warn(`⚠️ 대본 생성이 예상보다 오래 걸리고 있습니다. (${elapsed}ms > ${estimatedDuration * 2}ms)`);
  // 진행률은 95%에서 멈춤
}
```

---

## 🚀 구현 우선순위

### Phase 1: Python 스크립트 수정 (필수)
- [ ] `main.py`에 진행률 업데이트 로직 추가
- [ ] stdout으로 `PROGRESS: XX%` 출력
- [ ] 씬별 진행률 계산

### Phase 2: 워커 수정 (필수)
- [ ] `unified-worker.js`에서 PROGRESS 로그 파싱
- [ ] DB에 진행률 업데이트
- [ ] 로그 출력

### Phase 3: 진행률 예측 개선 (선택)
- [ ] `ScriptProgressTracker` 클래스 구현
- [ ] 글자수 예측 로직 추가
- [ ] AI 모델별 속도 보정

### Phase 4: UI 개선 (선택)
- [ ] 진행률 색상 변경
- [ ] 이모지 추가
- [ ] 예상 남은 시간 표시

---

## 📝 관련 파일

**수정 필요:**
- `trend-video-backend/src/ai_aggregator/main.py` (진행률 업데이트)
- `trend-video-frontend/src/workers/unified-worker.js` (진행률 파싱)

**현재 정상 동작:**
- `trend-video-frontend/src/app/automation/page.tsx` (진행률 표시)

---

**작성일**: 2025-12-03
**상태**: 스펙 등록 완료 (구현 대기)
**우선순위**: 중간 (UX 개선)
