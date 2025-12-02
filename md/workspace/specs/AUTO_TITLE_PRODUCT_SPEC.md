# 자동제목 상품예약 스펙

## 개요

쿠팡 베스트셀러 상품을 자동으로 예약 큐에 등록하는 시스템

## 핵심 로직 (같은 트랜잭션!)

```
1. 내목록에 제목으로 중복체크
2. 중복이 없다 → deep_link 생성 (50자 이하 단축 URL만!)
3. 내목록에 없다면 → 예약큐 + 내목록에 동시에 넣음 (같은 트랜잭션)
```

**⚠️ 절대 규칙:**
- deep_link 생성 실패 시 → 등록 안 함 (product_url 사용 금지!)
- deep_link는 50자 이하만 허용 (DB 트리거로 강제)
- 예약큐와 내목록은 같은 트랜잭션으로 처리

## 데이터 흐름

```
[쿠팡 베스트셀러] → [내 목록 + 예약 큐] (동시에, 같은 트랜잭션)
```

### Step 1: 쿠팡 베스트셀러 → 내 목록

1. 쿠팡 베스트셀러에서 상품 조회
2. **제목으로 중복 체크** (이미 내 목록에 있는지)
3. 중복 아니면 `coupang_product` 테이블에 추가
4. `status = 'active'`로 저장

```sql
-- 중복 체크
SELECT coupang_id FROM coupang_product
WHERE user_id = ? AND title = ?

-- 없으면 INSERT
INSERT INTO coupang_product (
  coupang_id, user_id, title, deep_link, status, ...
) VALUES (?, ?, ?, ?, 'active', ...)
```

### Step 2: 내 목록 → 예약 큐

1. `status = 'active'` 상품만 대상
2. **채널별 스케줄 간격 존중**
3. **2일치만 등록** (그 이상은 등록 안 함)
4. 등록 후에도 `status = 'active'` 유지 (재사용 가능)

```sql
-- 활성 상품 조회
SELECT * FROM coupang_product
WHERE status = 'active'
  AND deep_link IS NOT NULL
  AND deep_link LIKE '%link.coupang.com/%'
  AND NOT EXISTS (
    -- 이미 같은 딥링크로 태스크가 있는지 체크
    SELECT 1 FROM task t
    WHERE json_extract(t.product_info, '$.deepLink') = cp.deep_link
  )
```

### Step 3: 스케줄 등록

1. 채널의 마지막 스케줄 시간 조회 (`t.channel` 컬럼 사용)
2. `calculateNextScheduleTime()`으로 다음 시간 계산
3. **2일 제한**: 다음 스케줄이 2일 이후면 등록 중단
4. `task` + `task_schedule` + `task_queue` 생성

```typescript
// 2일 제한
const twoDaysFromNow = new Date();
twoDaysFromNow.setDate(twoDaysFromNow.getDate() + 2);
if (scheduledTime > twoDaysFromNow) {
  break; // 등록 중단
}
```

## 중요 규칙

### 중복 체크
| 단계 | 체크 대상 | 체크 방법 |
|------|----------|----------|
| 베스트 → 내목록 | 상품 제목 | `WHERE title = ?` |
| 내목록 → 예약큐 | 딥링크 | `json_extract(product_info, '$.deepLink')` |
| 스케줄 등록 | 채널+시간 | `WHERE t.channel = ? AND scheduled_time >= ?` |

### 상태 관리
| status | 의미 | 예약큐 등록 |
|--------|------|-----------|
| `active` | 활성 상품 | O |
| `published` | 퍼블리시됨 | X (별도 용도) |
| `inactive` | 비활성 | X |

### 채널 쿼리
```sql
-- ⚠️ 올바른 방법: t.channel 컬럼 사용
WHERE t.channel = ? AND t.user_id = ?

-- ❌ 잘못된 방법: settings JSON (NULL 반환됨)
WHERE json_extract(t.settings, '$.channel') = ?
```

## 관련 함수

### `checkAndRegisterCoupangProducts()`
- 위치: `automation-scheduler.ts`
- 역할: `coupang_product` → `task` + `task_schedule` 등록
- 제한: 2일치만, 채널 간격 존중

### `calculateNextScheduleTime()`
- 위치: `automation.ts`
- 역할: 채널 설정 기반 다음 스케줄 시간 계산
- 모드: `fixed_interval` (고정 주기) / `weekday_time` (요일별)

## 수정 이력

### 2024-11-29
- `json_extract(settings, '$.channel')` → `t.channel` 수정 (4곳)
- 2일 제한 추가 (`checkAndCreateAutoSchedules`, `checkAndRegisterCoupangProducts`)
- 스펙 문서 생성
