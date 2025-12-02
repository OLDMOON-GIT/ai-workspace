# 채널 스케줄 주기 관리 스펙

## 개요

자동 제목 생성 시 채널별로 설정된 업로드 주기에 따라 스케줄을 등록한다.
채널의 기존 스케줄을 확인하여 중복 등록을 방지한다.

## 채널 설정 구조

### DB 테이블: `youtube_channel_settings`

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | TEXT | 고유 ID |
| user_id | TEXT | 사용자 ID |
| channel_id | TEXT | 유튜브 채널 ID |
| channel_name | TEXT | 채널 이름 |
| color | TEXT | UI 표시 색상 |
| posting_mode | TEXT | 주기 모드 (`fixed_interval` 또는 `weekday_time`) |
| interval_value | INTEGER | 고정 주기 값 (posting_mode가 `fixed_interval`일 때) |
| interval_unit | TEXT | 고정 주기 단위 (`minutes`, `hours`, `days`) |
| weekday_times | TEXT | JSON: 요일별 시간대 (posting_mode가 `weekday_time`일 때) |
| categories | TEXT | JSON: 자동 생성할 카테고리 목록 |
| is_active | INTEGER | 활성화 여부 (0 또는 1) |

### 주기 모드 상세

#### 1. `fixed_interval` (고정 주기)

마지막 스케줄로부터 N분/시/일 후에 다음 스케줄 등록

```typescript
{
  posting_mode: 'fixed_interval',
  interval_value: 6,
  interval_unit: 'hours'  // 6시간마다 업로드
}
```

**제한사항:**
- 최소 5분 이상만 허용
- 단위: `minutes`, `hours`, `days`

#### 2. `weekday_time` (요일/시간 지정)

특정 요일의 특정 시간에 업로드

```typescript
{
  posting_mode: 'weekday_time',
  weekday_times: {
    "1": ["09:00", "18:00"],  // 월요일 09:00, 18:00
    "3": ["12:00"],           // 수요일 12:00
    "5": ["15:00", "21:00"]   // 금요일 15:00, 21:00
  }
}
```

**요일 키:**
- 0: 일요일
- 1: 월요일
- 2: 화요일
- 3: 수요일
- 4: 목요일
- 5: 금요일
- 6: 토요일

---

## 자동 스케줄 생성 로직

### 실행 주기
- 1분마다 `checkAndCreateAutoSchedules()` 실행 (자동 제목 생성 ON일 때)

### 처리 흐름

```
1. 활성화된 채널 설정 조회 (is_active = 1)

2. 각 채널에 대해:
   a. categories가 비어있으면 건너뜀

   b. 채널의 최근 스케줄 조회 (활성 상태만)
      - 활성 상태: scheduled, script_processing, image_processing,
                  video_processing, youtube_processing

   c. calculateNextScheduleTime()으로 다음 스케줄 시간 계산
      - posting_mode에 따라 다음 시간 결정
      - 마지막 스케줄 시간 기준

   d. ⭐ 중복 확인: 해당 시간에 이미 스케줄이 있는지 확인
      - 활성 상태의 스케줄만 체크
      - 중복이면 건너뜀

   e. 카테고리에서 랜덤 선택 → 제목 생성 → 스케줄 등록
```

### 중복 방지 조건

스케줄 등록 전 다음 조건 모두 확인:

1. **같은 title_id로 진행 중인 스케줄 없음**
   ```sql
   SELECT id FROM task_schedules
   WHERE title_id = ?
     AND status IN ('scheduled', 'pending', 'processing',
                    'script_processing', 'image_processing',
                    'video_processing', 'youtube_processing')
   ```

2. **⭐ 해당 채널에 같은 시간 이후 활성 스케줄 없음**
   ```sql
   SELECT s.id FROM task_schedules s
   JOIN video_titles t ON s.title_id = t.id
   WHERE t.channel = ? AND t.user_id = ?
     AND s.scheduled_time >= ?
     AND s.status IN ('scheduled', 'pending', 'processing',
                      'script_processing', 'image_processing',
                      'video_processing', 'youtube_processing')
   ```

---

## 상태 코드

### 활성 상태 (스케줄 중복 체크 대상)

| 상태 | 설명 |
|------|------|
| `scheduled` | 예약 대기 |
| `pending` | (레거시) 대기 |
| `processing` | (레거시) 처리 중 |
| `script_processing` | 대본 생성 중 |
| `image_processing` | 이미지 처리 중 |
| `video_processing` | 영상 제작 중 |
| `youtube_processing` | 유튜브 업로드 중 |

### 비활성 상태 (중복 체크 제외)

| 상태 | 설명 |
|------|------|
| `completed` | 완료 |
| `cancelled` | 취소 |
| `script_failed` | 대본 실패 |
| `image_failed` | 이미지 실패 |
| `video_failed` | 영상 실패 |
| `youtube_failed` | 업로드 실패 |

---

## API 엔드포인트

### 채널 설정 조회/수정

```
GET  /api/automation/channel-settings
POST /api/automation/channel-settings
```

### 자동 스케줄 수동 트리거

```
POST /api/automation/trigger-auto-schedule
```

---

## 버그 수정 필요 (2024-11-25 발견)

### 문제
`automation-scheduler.ts` 2439-2440라인에서 기존 스케줄 확인 시:
```sql
AND s.status IN ('pending', 'processing')
```
만 체크하여 `scheduled` 상태 스케줄이 있어도 중복 등록됨.

### 해결
```sql
AND s.status IN ('scheduled', 'pending', 'processing',
                 'script_processing', 'image_processing',
                 'video_processing', 'youtube_processing')
```
로 수정 필요.

---

## 참고

- `AUTOMATION_QUEUE_SPEC.md`: 큐 상태 관리 스펙
- `COMPLETE_AUTO_GUIDE.md`: 완전 자동화 시스템 가이드
