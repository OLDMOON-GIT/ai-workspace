# 🤖 완전 자동화 시스템 개발 가이드

## 📅 개발 완료: 2025-11-17

---

## 🎯 시스템 개요

**카테고리별/채널별 유튜브 완전 자동화 시스템**

한 번 설정하면 채널이 완전히 자동으로 운영됩니다. 관리자가 할 일은 단 한 번만 채널별 주기와 카테고리를 설정하는 것입니다. 이후에는 자동으로:
1. ✅ 주기 도래 시 AI가 제목 자동 생성
2. ✅ 다음 스케줄 자동 추가
3. ✅ 대본 자동 생성
4. ✅ 영상 자동 생성
5. ✅ YouTube 자동 업로드
6. ✅ 예약 공개 자동 설정

---

## 🚀 완전 자동화 플로우

### Before (반자동화)
```
[관리자 작업 - 매번 필요]
1. /automation 페이지 접속
2. 제목 수동 입력 (또는 AI 제목 생성 후 선택)
3. 채널 선택
4. 스케줄 시간 설정
5. 스케줄 추가 버튼 클릭

[자동화 시스템]
6. 시간 도래 → 대본 → 영상 → 업로드
```

**문제점**: 계속 제목을 추가하고 스케줄을 설정해야 함

---

### After (완전 자동화) ✨

```
[초기 설정 - 딱 1번만!]
1. /automation → 스케줄 관리 → 채널 설정
2. 채널 A 선택
   - 주기: 3일마다
   - 카테고리: ["시니어사연", "복수극"]
3. 채널 B 선택
   - 주기: 매주 월수금 12시
   - 카테고리: ["패션", "뷰티"]

[이후 완전 자동] 🤖
- 채널 A 주기 도래 (3일 지남)
  → 스케줄러: "주기 도래 감지!"
  → AI: "시니어사연" 또는 "복수극"에서 랜덤 선택
  → AI: 제목 자동 생성 (예: "예비 며느리를 시험하려 김밥집에 찾아간 재벌 회장")
  → 시스템: 제목 DB에 자동 추가
  → 시스템: 3일 후 스케줄 자동 추가
  → 3일 후: 대본 → 영상 → 업로드 자동 실행

- 채널 B 주기 도래 (월요일 12시)
  → 스케줄러: "주기 도래 감지!"
  → AI: "패션" 또는 "뷰티"에서 랜덤 선택
  → AI: 제목 자동 생성 (예: "2025년 봄 신상 패션 트렌드 TOP 5")
  → 시스템: 제목 DB에 자동 추가
  → 시스템: 수요일 12시 스케줄 자동 추가
  → 수요일 12시: 대본 → 영상 → 업로드 자동 실행
```

**결과**: 완전히 손 놓고 채널이 자동으로 운영됩니다! 🎉

---

## 📁 구현된 기능

### Phase 1: DB 스키마 및 채널 설정 UI ✅

#### 1-1. DB 스키마 추가 (`automation.ts`)
```typescript
// youtube_channel_settings 테이블에 categories 컬럼 추가
db.exec(`ALTER TABLE youtube_channel_settings ADD COLUMN categories TEXT;`);
```

**데이터 구조**:
```json
{
  "channel_id": "UCxxxxxxxx",
  "channel_name": "내 채널",
  "posting_mode": "fixed_interval",
  "interval_value": 3,
  "interval_unit": "days",
  "categories": ["시니어사연", "복수극", "감동"] // JSON 배열
}
```

#### 1-2. ChannelSettings UI 수정
**위치**: `src/components/automation/ChannelSettings.tsx`

**추가된 기능**:
- 카테고리 선택 UI (프리셋 + 사용자 정의)
- 선택된 카테고리 표시
- 완전 자동화 상태 배지 (🤖 완전 자동화)
- 카테고리별 태그 표시

**프리셋 카테고리**:
```typescript
const CATEGORY_OPTIONS = [
  '시니어사연', '복수극', '패션', '뷰티',
  '요리', '건강', '여행', '동물', '일상', '감동'
];
```

#### 1-3. API 수정
**위치**: `src/app/api/automation/channel-settings/route.ts`

- `POST /api/automation/channel-settings`: categories 필드 저장
- `GET /api/automation/channel-settings`: categories 필드 반환 (JSON 파싱)

---

### Phase 2: 스케줄러 자동 제목/스케줄 생성 ✅

**위치**: `src/lib/automation-scheduler.ts`

#### 새로운 함수: `checkAndCreateAutoSchedules()`

**실행 주기**: 스케줄러와 동일 (기본 60초마다)

**로직**:
```typescript
1. 모든 활성화된 채널 설정 조회
   WHERE is_active = 1

2. 각 채널별로:
   a. categories 확인 (없으면 스킵)
   b. 최근 스케줄 조회
   c. 다음 스케줄 시간 계산 (calculateNextScheduleTime)
   d. 다음 스케줄이 이미 존재하는지 확인
   e. 없으면 자동 생성:
      - 카테고리에서 랜덤 선택
      - AI로 제목 생성 (POST /api/generate-title-suggestions)
      - 제목 DB에 추가 (addVideoTitle)
      - 스케줄 자동 추가 (addSchedule)
      - 로그 추가 (addTitleLog)
```

**중복 방지**:
- 같은 채널의 다음 스케줄이 이미 있으면 생성 안 함
- 개별 채널 실패 시 전체 프로세스는 계속 진행

**로그 예시**:
```
[AutoScheduler] Checking 2 active channels for auto-scheduling
[AutoScheduler] Channel 내 채널: Generating title for category "시니어사연"
[AutoScheduler] Channel 내 채널: Generated title "예비 며느리를 시험하려 김밥집에 찾아간 재벌 회장"
[AutoScheduler] Channel 내 채널: Created title title_1700000000000_abc123
[AutoScheduler] ✅ Channel 내 채널: Auto-scheduled "예비 며느리를..." for 2025-01-20T12:00:00.000Z
```

---

### Phase 3: 자동화 상태 표시 UI ✅

**위치**: `src/components/automation/ChannelSettings.tsx`

**추가된 UI 요소**:

1. **완전 자동화 배지**
   ```tsx
   {setting.categories && setting.categories.length > 0 && (
     <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
       🤖 완전 자동화
     </span>
   )}
   ```

2. **카테고리 표시**
   - 첫 3개 카테고리 표시
   - 나머지는 "+N개"로 표시

3. **채널 카드에 자동화 정보 표시**
   ```
   채널 A
   3일마다
   🤖 완전 자동화 | 카테고리 2개
   자동 제목 카테고리: [시니어사연] [복수극]
   ```

---

## 🛠️ 사용 방법

### 1. 채널 설정 (최초 1회)

**경로**: `/automation` → 스케줄 관리 → 채널 설정

1. **채널 선택**
   - 연동된 YouTube 채널 목록에서 선택

2. **주기 설정**
   - 고정 주기: N시간마다 또는 N일마다
   - 요일/시간: 특정 요일의 특정 시간 (예: 매주 월수금 12시)

3. **카테고리 설정** ⭐ 핵심!
   - 프리셋 카테고리 선택 (클릭으로 토글)
   - 또는 직접 입력 (예: "운동", "재테크")
   - 여러 개 선택 가능 (자동 생성 시 랜덤 선택)

4. **저장**
   - "저장" 버튼 클릭
   - 채널 목록에 "🤖 완전 자동화" 배지 표시

### 2. 스케줄러 활성화

**경로**: 자동화 설정 (DB 또는 환경 변수)

```sql
UPDATE automation_settings
SET value = 'true'
WHERE key = 'enabled';
```

또는 프론트엔드에서 스케줄러 시작/중지 버튼 사용

### 3. 동작 확인

**로그 확인**:
```bash
# 백엔드 로그 확인
npm run dev

# 스케줄러 로그에서 확인
[AutoScheduler] Checking 2 active channels for auto-scheduling
[AutoScheduler] ✅ Channel 내 채널: Auto-scheduled "..." for ...
```

**DB 확인**:
```sql
-- 자동 생성된 제목 확인
SELECT * FROM video_titles
WHERE title LIKE '%자동%'
ORDER BY created_at DESC;

-- 자동 생성된 스케줄 확인
SELECT s.*, t.title, t.category
FROM video_schedules s
JOIN video_titles t ON s.title_id = t.id
WHERE s.status = 'pending'
ORDER BY s.scheduled_time ASC;
```

**UI 확인**:
- `/automation` → 진행 큐 → 대기 탭
- 자동 생성된 제목이 스케줄에 추가되어 있음
- 제목 로그에 "🤖 완전 자동화: 주기 도래로 제목 자동 생성..." 표시

---

## 📊 시나리오 예시

### 시나리오 1: 시니어 사연 채널 (3일 주기)

**초기 설정** (1월 1일):
```
채널: 시니어 이야기
주기: 3일마다
카테고리: ["시니어사연", "복수극", "감동"]
```

**1월 4일 12:00** (주기 도래):
```
[AutoScheduler] ✅ 제목 생성: "예비 며느리를 시험하려 김밥집에 찾아간 재벌 회장"
[AutoScheduler] ✅ 스케줄 추가: 1월 7일 12:00
```

**1월 7일 12:00** (스케줄 실행):
```
[Scheduler] ✅ 대본 생성 완료
[Scheduler] ✅ 영상 생성 완료
[Scheduler] ✅ YouTube 업로드 완료
```

**1월 7일 12:01** (다음 주기 자동 설정):
```
[AutoScheduler] ✅ 제목 생성: "남편을 배신한 며느리, 재벌 시어머니의 복수"
[AutoScheduler] ✅ 스케줄 추가: 1월 10일 12:00
```

**결과**: 계속 반복! 완전 자동!

---

### 시나리오 2: 패션 채널 (매주 월수금)

**초기 설정** (1월 1일):
```
채널: 패션 트렌드
주기: 매주 월수금 12:00
카테고리: ["패션", "뷰티", "스타일링"]
```

**1월 6일 월요일 12:00** (주기 도래):
```
[AutoScheduler] ✅ 제목 생성: "2025년 봄 신상 패션 트렌드 TOP 5"
[AutoScheduler] ✅ 스케줄 추가: 1월 8일 수요일 12:00
```

**1월 8일 수요일 12:00** (스케줄 실행 + 다음 주기):
```
[Scheduler] ✅ 대본 → 영상 → 업로드 완료
[AutoScheduler] ✅ 제목 생성: "직장인 데일리 메이크업 루틴"
[AutoScheduler] ✅ 스케줄 추가: 1월 10일 금요일 12:00
```

**결과**: 월수금 계속 자동 업로드!

---

## 🔧 트러블슈팅

### Q1: 자동 생성이 안 됨

**확인 사항**:
1. 스케줄러가 활성화되어 있는지
   ```sql
   SELECT * FROM automation_settings WHERE key = 'enabled';
   -- value = 'true'여야 함
   ```

2. 채널 설정에 카테고리가 있는지
   ```sql
   SELECT channel_name, categories FROM youtube_channel_settings;
   -- categories가 NULL이 아니어야 함
   ```

3. 다음 스케줄이 이미 있지 않은지
   ```sql
   SELECT * FROM video_schedules
   WHERE status IN ('pending', 'processing')
   ORDER BY scheduled_time;
   ```

4. 스케줄러 로그 확인
   ```bash
   # 터미널에서 확인
   [AutoScheduler] Checking N active channels for auto-scheduling
   ```

---

### Q2: 제목이 중복됨

**원인**: AI가 비슷한 제목을 생성할 수 있음

**해결**:
1. 카테고리를 더 다양하게 설정
2. 기존 제목을 AI에게 제공하도록 수정 (향후 개선)
   ```typescript
   // automation-scheduler.ts:1273
   const titleResponse = await fetch(..., {
     body: JSON.stringify({
       categories: [randomCategory],
       count: 1,
       youtubeTitles: [...최근 제목들] // 추가
     })
   });
   ```

---

### Q3: 특정 카테고리만 계속 선택됨

**원인**: 랜덤 선택이라 우연일 수 있음

**해결**: 카테고리별 로테이션 로직 추가 (향후 개선)
```typescript
// 마지막 사용한 카테고리 기록
// 다음에는 다른 카테고리 선택
```

---

### Q4: 주기가 정확하지 않음

**원인**: `calculateNextScheduleTime` 함수의 기준 시간

**확인**:
```sql
-- 마지막 스케줄 시간 확인
SELECT s.scheduled_time, t.title
FROM video_schedules s
JOIN video_titles t ON s.title_id = t.id
WHERE t.channel = 'UCxxxxxxxx'
ORDER BY s.scheduled_time DESC
LIMIT 1;
```

**해결**: 마지막 스케줄 시간을 기준으로 다음 시간 계산됨

---

## 📝 향후 개선 사항

### 1. 카테고리별 로테이션
- 마지막 사용 카테고리 기록
- 균등하게 분배

### 2. 제목 중복 방지
- 기존 제목을 AI에게 제공
- DB에서 중복 체크

### 3. 채널별 영상 타입 설정
- 현재: 모두 longform
- 개선: 채널 설정에 type 추가 (longform, shortform, sora2)

### 4. 채널별 공개 설정
- 현재: 모두 public
- 개선: 채널 설정에 youtube_privacy 추가

### 5. 대시보드 추가
- 채널별 자동 생성 통계
- 다음 자동 생성 예정 시간 표시
- 최근 자동 생성 제목 목록

---

## 🎉 완성도

### ✅ 완료된 기능
1. ✅ 채널-카테고리 매핑 (DB + UI + API)
2. ✅ 자동 제목 생성 로직 (스케줄러)
3. ✅ 자동 스케줄 생성 로직 (스케줄러)
4. ✅ 자동화 상태 표시 UI
5. ✅ 중복 방지 로직
6. ✅ 로그 및 모니터링

### 🎯 완전 자동화 달성!

**한 번 설정하면 영구적으로 자동 운영**:
- 제목 생성 ✅
- 스케줄 추가 ✅
- 대본 생성 ✅
- 영상 생성 ✅
- YouTube 업로드 ✅
- 예약 공개 ✅

**관리자가 할 일**: 없음! (초기 설정만 1회)

---

## 📚 관련 파일

### 수정된 파일
```
trend-video-frontend/
├── src/
│   ├── lib/
│   │   ├── automation.ts                              # ✅ DB 함수 (categories 추가)
│   │   └── automation-scheduler.ts                    # ✅ 자동 생성 로직
│   ├── components/
│   │   └── automation/
│   │       └── ChannelSettings.tsx                    # ✅ 카테고리 선택 UI
│   └── app/
│       └── api/
│           └── automation/
│               └── channel-settings/
│                   └── route.ts                       # ✅ categories API
└── docs/
    └── COMPLETE_AUTO_GUIDE.md                         # 이 문서
```

### 새로 생성된 함수
```typescript
// automation.ts (수정)
- upsertChannelSettings(..., categories)
- getChannelSettings() // categories 파싱 추가
- updateChannelSettings(..., categories)

// automation-scheduler.ts (신규)
- checkAndCreateAutoSchedules()

// ChannelSettings.tsx (신규)
- toggleCategory(category)
- addCustomCategory()
```

---

## 🚀 배포 체크리스트

### 개발 환경 테스트
- [ ] 채널 설정 저장 테스트
- [ ] 카테고리 선택/해제 테스트
- [ ] 스케줄러 로그 확인
- [ ] 자동 제목 생성 확인
- [ ] 자동 스케줄 추가 확인

### 프로덕션 배포
- [ ] DB 마이그레이션 (categories 컬럼 추가)
- [ ] 서버 재시작 (새 코드 적용)
- [ ] 스케줄러 활성화 확인
- [ ] 실제 채널 설정 테스트

### 모니터링
- [ ] 스케줄러 로그 모니터링
- [ ] DB에 제목/스케줄 생성 확인
- [ ] YouTube 업로드 확인

---

*개발 완료: 2025-11-17*
*완전 자동화 시스템 가동 준비 완료! 🎉*
