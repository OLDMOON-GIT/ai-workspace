# 🚀 완전 자동화 시스템 빠른 시작 가이드

## 📍 현재 위치에서 바로 시작하기

---

## 1단계: 서버 시작 ⚡

### Terminal 1 - Frontend
```bash
cd C:\Users\oldmoon\workspace\trend-video-frontend
npm run dev
```
✅ 실행 확인: http://localhost:3000

### Terminal 2 - Backend
```bash
cd C:\Users\oldmoon\workspace\trend-video-backend
venv\Scripts\activate
python -m uvicorn main:app --reload --port 8000
```
✅ 실행 확인: http://localhost:8000/docs

---

## 2단계: 채널 설정 (웹 UI) 🎯

### 🌐 접속
```
http://localhost:3000/automation
```

### 📋 메뉴 네비게이션
```
1. 상단 탭: "스케줄 관리" 클릭
2. 하위 탭: "채널 설정" 클릭
```

### ⚙️ 채널 설정하기

#### Step 1: 채널 선택
- 연동된 YouTube 채널 카드 클릭
- 예: "내 채널" 클릭

#### Step 2: 주기 설정
**방법 A - 고정 주기:**
```
○ 고정 주기 (선택)
주기: [3] [▼ 일]마다
```

**방법 B - 요일/시간:**
```
○ 요일/시간 지정 (선택)
요일: [월] [수] [금] 클릭 (파란색으로 변함)
시간: [12:00]
```

#### Step 3: 카테고리 설정 ⭐ 핵심!
```
자동 제목 생성 카테고리
(주기 도래 시 선택한 카테고리에서 제목 자동 생성)

[시니어사연] [복수극] [패션] [뷰티] [요리] ... (클릭으로 선택)

또는 직접 입력:
[                    ] [추가]
예: "운동", "재테크" 입력 후 [추가] 클릭
```

**선택된 카테고리 (2개)**
```
✓ 시니어사연 ✕
✓ 복수극 ✕
```

#### Step 4: 저장
```
[저장] 버튼 클릭
```

✅ 성공 시: "채널 설정이 저장되었습니다." 알림

---

## 3단계: 스케줄러 활성화 🤖

### 방법 A: DB 직접 수정 (권장)

#### SQLite DB 접속
```bash
cd C:\Users\oldmoon\workspace\trend-video-frontend\data
sqlite3 database.sqlite
```

#### 스케줄러 활성화 쿼리
```sql
UPDATE automation_settings
SET value = 'true'
WHERE key = 'enabled';

-- 확인
SELECT * FROM automation_settings WHERE key = 'enabled';
-- value = 'true' 확인

.exit
```

### 방법 B: 프론트엔드에서 (UI가 있다면)
```
/automation → 스케줄러 시작 버튼 클릭
```

---

## 4단계: 동작 확인 ✅

### Terminal에서 로그 확인

Frontend 터미널에서 다음 로그가 나오는지 확인:

```
✅ Automation scheduler started (checking every 60s)
[AutoScheduler] Checking 1 active channels for auto-scheduling
[AutoScheduler] Channel 내 채널: Generating title for category "시니어사연"
[AutoScheduler] Channel 내 채널: Generated title "예비 며느리를 시험하려..."
[AutoScheduler] ✅ Channel 내 채널: Auto-scheduled "..." for 2025-11-20T12:00:00
```

### 웹 UI에서 확인

#### /automation 페이지
```
1. "진행 큐" 탭 클릭
2. "대기" 서브탭 확인
3. 자동 생성된 제목이 스케줄에 있는지 확인
```

**확인 포인트:**
- 제목: AI가 자동 생성한 제목
- 카테고리: 설정한 카테고리 중 하나
- 채널: 설정한 채널
- 예약 시간: 다음 주기 시간

---

## 5단계: 테스트 시나리오 🧪

### 즉시 테스트 (주기 기다리지 않고)

#### 5-1. DB에서 테스트 스케줄 추가
```bash
cd C:\Users\oldmoon\workspace\trend-video-frontend\data
sqlite3 database.sqlite
```

```sql
-- 1분 후 실행되는 테스트 스케줄 추가
INSERT INTO video_schedules (
  id,
  title_id,
  scheduled_time,
  youtube_privacy,
  status
)
SELECT
  'test_schedule_' || strftime('%s', 'now'),
  id,
  datetime('now', '+1 minute'),
  'private',
  'pending'
FROM video_titles
WHERE title LIKE '%테스트%'
LIMIT 1;

-- 확인
SELECT id, title_id, scheduled_time, status
FROM video_schedules
WHERE status = 'pending'
ORDER BY scheduled_time;

.exit
```

#### 5-2. 로그 확인 (1분 후)
```
[Scheduler] Found 1 pending schedule(s)
[Scheduler] Starting pipeline for schedule test_schedule_...
✅ 대본 생성 중...
✅ 영상 생성 중...
✅ YouTube 업로드 중...
```

---

## 6단계: 완전 자동화 확인 🎉

### 시나리오: 3일 주기 채널

**Day 1 (오늘):**
```
채널 설정:
- 주기: 3일마다
- 카테고리: ["시니어사연", "복수극"]
```

**Day 1 스케줄러 로그:**
```
[AutoScheduler] ✅ 제목 생성: "예비 며느리를 시험하려..."
[AutoScheduler] ✅ 스케줄 추가: Day 4 12:00
```

**Day 4 12:00:**
```
[Scheduler] ✅ 대본 생성
[Scheduler] ✅ 영상 생성
[Scheduler] ✅ YouTube 업로드
[AutoScheduler] ✅ 다음 제목 생성: "남편을 배신한 며느리..."
[AutoScheduler] ✅ 다음 스케줄: Day 7 12:00
```

**결과:** 완전 자동! 계속 반복!

---

## 🔍 문제 해결

### Q1: 스케줄러가 시작 안 됨
```sql
-- DB 확인
SELECT * FROM automation_settings WHERE key = 'enabled';
-- value가 'true'인지 확인

-- 'false'면 변경
UPDATE automation_settings SET value = 'true' WHERE key = 'enabled';
```

### Q2: 채널 목록이 안 보임
```
1. YouTube 채널 연동 확인
2. /api/youtube/channels 호출 확인
3. 로그인 상태 확인
```

### Q3: 카테고리 저장 안 됨
```
F12 개발자 도구 → Network 탭
POST /api/automation/channel-settings 확인
Request Payload에 categories 있는지 확인
```

### Q4: 자동 생성 안 됨
**확인 사항:**
1. 채널 설정에 categories 있는지
   ```sql
   SELECT channel_name, categories FROM youtube_channel_settings;
   ```

2. 스케줄러 로그 확인
   ```
   [AutoScheduler] Checking N active channels...
   ```

3. 다음 스케줄이 이미 있는지
   ```sql
   SELECT * FROM video_schedules WHERE status IN ('pending', 'processing');
   ```

---

## 📊 DB 직접 확인

### 채널 설정 확인
```sql
sqlite3 C:\Users\oldmoon\workspace\trend-video-frontend\data\database.sqlite

SELECT
  channel_name,
  posting_mode,
  interval_value,
  interval_unit,
  categories,
  is_active
FROM youtube_channel_settings;
```

### 자동 생성된 제목 확인
```sql
SELECT
  id,
  title,
  category,
  channel,
  created_at
FROM video_titles
ORDER BY created_at DESC
LIMIT 10;
```

### 자동 생성된 스케줄 확인
```sql
SELECT
  s.id,
  t.title,
  t.category,
  s.scheduled_time,
  s.status
FROM video_schedules s
JOIN video_titles t ON s.title_id = t.id
WHERE s.status = 'pending'
ORDER BY s.scheduled_time;
```

### 로그 확인
```sql
SELECT
  tl.created_at,
  t.title,
  tl.message
FROM title_logs tl
JOIN video_titles t ON tl.title_id = t.id
WHERE tl.message LIKE '%완전 자동화%'
ORDER BY tl.created_at DESC
LIMIT 10;
```

---

## 🎬 완전 자동화 플로우 최종 확인

### 체크리스트
- [ ] Frontend 서버 실행 중 (localhost:3000)
- [ ] Backend 서버 실행 중 (localhost:8000)
- [ ] 채널 설정 완료 (주기 + 카테고리)
- [ ] 스케줄러 활성화 (enabled = 'true')
- [ ] 스케줄러 로그 확인
- [ ] 자동 생성된 제목 확인
- [ ] 자동 생성된 스케줄 확인

### 모든 체크리스트 완료 시
```
🎉 완전 자동화 시스템 가동 중!

이제 할 일: 없음!
- 주기마다 자동으로 제목 생성
- 자동으로 스케줄 추가
- 자동으로 대본/영상/업로드
```

---

## 📞 추가 도움

### 상세 가이드
- `COMPLETE_AUTO_GUIDE.md` - 전체 개발 가이드
- `test-complete-automation.js` - 통합 테스트

### 테스트 실행
```bash
cd C:\Users\oldmoon\workspace
node test-complete-automation.js
```

---

**🚀 지금 바로 시작하세요!**

1. 터미널 2개 열기
2. Frontend + Backend 서버 시작
3. http://localhost:3000/automation 접속
4. 채널 설정하기
5. 스케줄러 활성화
6. 로그 확인!
