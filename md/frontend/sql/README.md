# SQL Mapper - iBatis 스타일 SQL 관리 시스템

## 개요

SQL을 코드에서 분리하여 `/sql` 디렉토리에서 관리합니다.
Java의 MyBatis/iBatis처럼 SQL ID로 쿼리를 호출하여 유지보수성을 향상시킵니다.

## SQL 파일 작성 규칙

### 1. 파일 위치
- 위치: `/sql/*.sql`
- 파일명이 네임스페이스가 됩니다
  - 예: `automation.sql` → 네임스페이스: `automation`

### 2. SQL 작성 형식

```sql
-- @sqlId: sqlId명
SELECT * FROM table WHERE id = ?

-- @sqlId: 다른sqlId
UPDATE table SET status = ? WHERE id = ?
```

**규칙:**
- `-- @sqlId: xxxxx` 주석으로 SQL ID 지정
- SQL ID 다음 줄부터 실제 SQL 작성
- 빈 줄과 일반 주석(`--`)은 무시됨
- 다음 SQL ID가 나오기 전까지가 하나의 SQL 블록

### 3. 파라미터 바인딩

**Positional Parameter (기본):**
```sql
-- @sqlId: getUserById
SELECT * FROM users WHERE id = ? AND status = ?
```

사용:
```typescript
const sql = getSql('user', 'getUserById');
const result = await db.prepare(sql).get(userId, 'active');
```

**Named Parameter (선택적):**
```sql
-- @sqlId: getUserByIdNamed
SELECT * FROM users WHERE id = :userId AND status = :status
```

사용:
```typescript
const sql = getSql('user', 'getUserByIdNamed', {
  userId: '123',
  status: 'active'
});
// SQL: SELECT * FROM users WHERE id = ? AND status = ?
const result = await db.prepare(sql).get('123', 'active');
```

## 코드에서 사용하기

### 1. SQL 조회 및 실행

```typescript
import { getSql } from '@/lib/sql-mapper';
import db from '@/lib/sqlite';

// 1. SQL 조회
const sql = getSql('automation', 'getPendingSchedules');

// 2. 쿼리 실행
const schedules = await db.prepare(sql).all(new Date());
```

### 2. 파라미터와 함께 사용

```typescript
import { getSql } from '@/lib/sql-mapper';
import db from '@/lib/sqlite';

// Positional Parameter
const sql = getSql('coupang', 'getUnregisteredProducts');
const products = await db.prepare(sql).all(10); // LIMIT 10

// Named Parameter
const sql2 = getSql('user', 'getUserByEmail', {
  email: 'test@example.com'
});
const user = await db.prepare(sql2).get('test@example.com');
```

### 3. SQL 재로드 (개발 중)

```typescript
import { reloadSql } from '@/lib/sql-mapper';

// SQL 파일 수정 후 재로드
reloadSql();
```

## 기존 코드 마이그레이션 예시

### Before (인라인 SQL)

```typescript
const schedules = await db.prepare(`
  SELECT
    t.task_id,
    t.user_id,
    c.title
  FROM task t
  INNER JOIN content c ON t.task_id = c.content_id
  WHERE t.scheduled_time IS NOT NULL
    AND t.scheduled_time <= ?
  ORDER BY t.scheduled_time ASC
`).all(new Date());
```

### After (SQL Mapper 사용)

1. SQL 파일 작성 (`sql/automation.sql`):
```sql
-- @sqlId: getPendingSchedules
SELECT
  t.task_id,
  t.user_id,
  c.title
FROM task t
INNER JOIN content c ON t.task_id = c.content_id
WHERE t.scheduled_time IS NOT NULL
  AND t.scheduled_time <= ?
ORDER BY t.scheduled_time ASC
```

2. 코드 수정:
```typescript
import { getSql } from '@/lib/sql-mapper';

const sql = getSql('automation', 'getPendingSchedules');
const schedules = await db.prepare(sql).all(new Date());
```

## SQL 목록 확인

### 모든 네임스페이스 조회
```typescript
import { getSqlMapper } from '@/lib/sql-mapper';

const mapper = getSqlMapper();
const namespaces = mapper.getNamespaces();
// ['automation', 'coupang', 'user', ...]
```

### 네임스페이스의 SQL ID 목록 조회
```typescript
const sqlIds = mapper.getSqlIds('automation');
// ['getPendingSchedules', 'getTaskQueue', 'insertTaskQueue', ...]
```

### 전체 SQL 맵 조회 (디버깅)
```typescript
const allSql = mapper.getAll();
console.log(JSON.stringify(allSql, null, 2));
```

## 장점

1. **SQL 검수 용이**: 모든 SQL이 한 곳에 모여있어 검토 쉬움
2. **재사용성**: 같은 SQL을 여러 곳에서 ID로 호출
3. **유지보수성**: SQL 수정 시 코드 변경 불필요
4. **가독성**: 코드에서 긴 SQL 문자열 제거
5. **버전 관리**: SQL 변경 이력 추적 용이

## 파일 구조 예시

```
/sql
  ├── README.md          # 이 파일
  ├── automation.sql     # 자동화 관련 SQL
  ├── coupang.sql        # 쿠팡 상품 관련 SQL
  ├── user.sql           # 사용자 관련 SQL
  ├── content.sql        # 컨텐츠 관련 SQL
  └── youtube.sql        # YouTube 관련 SQL
```

## 주의사항

1. SQL ID는 같은 네임스페이스 내에서 중복 불가
2. SQL 파일은 서버 시작 시 한 번만 로드됨 (개발 중 수정 시 재시작 필요)
3. `reloadSql()` 함수로 운영 중 재로드 가능
4. 파라미터는 반드시 `?` 플레이스홀더 사용
5. SQL 파일은 UTF-8 인코딩 필수
