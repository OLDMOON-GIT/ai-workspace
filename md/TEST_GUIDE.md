# 테스트 가이드 (Test Guide)

trend-video 프로젝트의 테스트 작성 및 실행 규칙

## 📋 목차

1. [테스트 종류와 목적](#1-테스트-종류와-목적)
2. [테스트 환경 설정](#2-테스트-환경-설정)
3. [단위 테스트(Unit Test)](#3-단위-테스트unit-test)
4. [통합 테스트(Integration Test)](#4-통합-테스트integration-test)
5. [API 테스트](#5-api-테스트)
6. [커버리지 관리](#6-커버리지-관리)
7. [테스트 실행](#7-테스트-실행)

---

## 1. 테스트 종류와 목적

### 1.1 단위 테스트 (Unit Test)

**목적**: 개별 함수/컴포넌트의 동작 검증

**대상:**
- React 컴포넌트 (`src/components/**/*.tsx`)
- 유틸리티 함수 (`src/lib/**/*.ts`)
- 헬퍼 함수 (`src/utils/**/*.ts`)

**특징:**
- 외부 의존성 제거 (Mock 사용)
- 빠른 실행 속도
- 단일 책임 검증

**예시:**
```typescript
describe('ShopClientView 컴포넌트', () => {
  it('상품 정보를 정확히 표시해야 함', () => {
    const props = { productId: '123', productName: '테스트 상품' };
    render(<ShopClientView {...props} />);
    expect(screen.getByText('테스트 상품')).toBeInTheDocument();
  });
});
```

### 1.2 통합 테스트 (Integration Test)

**목적**: 여러 컴포넌트/함수가 함께 동작하는지 검증

**대상:**
- 데이터베이스 작업 흐름
- 스케줄러와 API의 상호작용
- 자동화 파이프라인 전체

**특징:**
- Node.js 환경 (`testEnvironment: 'node'`)
- 실제 또는 테스트 데이터베이스 사용
- 더 오래 걸리는 실행 속도

**위치:** `src/tests/**/*.test.ts`

**예시:**
```typescript
describe('상품 자동화 파이프라인', () => {
  it('베스트셀러 → 내부 목록 → 타이틀 → 큐 전체 흐름', async () => {
    // 1. 상품 추가
    db.prepare('INSERT INTO coupang_products...').run(testProduct);

    // 2. 자동화 실행
    const result = await runAutomation(testProduct.id);

    // 3. 결과 검증
    expect(result.status).toBe('queued');
    expect(result.videoTitle).toBeDefined();
  });
});
```

### 1.3 API 라우트 테스트

**목적**: Next.js API 라우트의 요청/응답 검증

**대상:**
- `src/app/api/**/*.ts` 라우트 핸들러
- GET, POST, PUT, DELETE 메서드
- 에러 처리 및 인증

**특징:**
- HTTP 메서드 시뮬레이션
- 요청 헤더/바디 테스트
- 응답 상태 코드 검증

**예시:**
```typescript
describe('GET /api/automation/schedules', () => {
  it('예정된 작업 목록을 반환해야 함', async () => {
    const response = await fetch('/api/automation/schedules');
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(Array.isArray(data)).toBe(true);
  });
});
```

---

## 2. 테스트 환경 설정

### 2.1 Jest 설정

**파일:** `jest.config.js`

```javascript
const customJestConfig = {
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  testEnvironment: 'jest-environment-jsdom', // UI 테스트용

  testMatch: [
    '**/__tests__/**/*.test.[jt]s?(x)',
    '**/?(*.)+(spec|test).[jt]s?(x)'
  ],

  // 통합 테스트는 Node 환경에서만 실행
  testPathIgnorePatterns: ['/node_modules/', '/.next/', '/src/tests/'],

  collectCoverageFrom: [
    'src/**/*.{js,jsx,ts,tsx}',
    '!src/**/*.d.ts',
    '!src/tests/**', // 테스트 파일 제외
  ],
};
```

### 2.2 테스트 라이브러리

**설치된 라이브러리:**

```json
{
  "@testing-library/react": "^16.1.0",
  "@testing-library/jest-dom": "^6.9.1",
  "jest": "^30.2.0",
  "jest-environment-jsdom": "^30.2.0",
  "better-sqlite3": "^12.4.1"  // 통합 테스트용
}
```

---

## 3. 단위 테스트(Unit Test)

### 3.1 React 컴포넌트 테스트

**위치:** `src/components/__tests__/ComponentName.test.tsx`

**구조:**

```typescript
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ComponentName from '../ComponentName';

describe('ComponentName', () => {
  // Setup
  beforeEach(() => {
    // 각 테스트 전에 실행
  });

  // 기본 렌더링
  it('올바르게 렌더링되어야 함', () => {
    render(<ComponentName />);
    expect(screen.getByText('예상 텍스트')).toBeInTheDocument();
  });

  // Props 검증
  it('props를 올바르게 처리해야 함', () => {
    const props = { title: 'Test' };
    render(<ComponentName {...props} />);
    expect(screen.getByText('Test')).toBeInTheDocument();
  });

  // 사용자 상호작용
  it('버튼 클릭 시 핸들러가 호출되어야 함', () => {
    const handleClick = jest.fn();
    render(<ComponentName onClick={handleClick} />);
    fireEvent.click(screen.getByRole('button'));
    expect(handleClick).toHaveBeenCalled();
  });

  // 비동기 작업
  it('데이터 로딩 후 표시되어야 함', async () => {
    render(<ComponentName />);

    await waitFor(() => {
      expect(screen.getByText('로드된 데이터')).toBeInTheDocument();
    });
  });

  // 에러 처리
  it('에러 상태를 표시해야 함', () => {
    render(<ComponentName hasError={true} />);
    expect(screen.getByText('에러 메시지')).toBeInTheDocument();
  });
});
```

### 3.2 유틸리티 함수 테스트

**위치:** `src/lib/__tests__/utilityName.test.ts`

**구조:**

```typescript
import { utilityFunction } from '../utility-file';

describe('utilityFunction', () => {
  it('올바른 입력값으로 올바른 결과를 반환해야 함', () => {
    const result = utilityFunction(input);
    expect(result).toEqual(expectedOutput);
  });

  it('경계값을 올바르게 처리해야 함', () => {
    expect(utilityFunction(null)).toEqual(defaultValue);
    expect(utilityFunction(undefined)).toEqual(defaultValue);
  });

  it('에러 입력을 처리해야 함', () => {
    expect(() => {
      utilityFunction(invalidInput);
    }).toThrow();
  });
});
```

### 3.3 테스트 작성 체크리스트

- [ ] Happy path (정상 흐름) 테스트
- [ ] Edge case (경계값) 테스트
- [ ] Error case (에러) 테스트
- [ ] Props/Input validation 테스트
- [ ] Side effects 테스트

---

## 4. 통합 테스트(Integration Test)

### 4.1 통합 테스트 구조

**위치:** `src/tests/feature-name.test.ts`

**패턴:**

```typescript
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

describe('기능명 통합 테스트', () => {
  let db: Database.Database;
  const testDbPath = path.join(process.cwd(), 'data', 'test-feature.sqlite');

  // 테스트 DB 초기화
  beforeAll(() => {
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }

    db = new Database(testDbPath);
    db.pragma('journal_mode = WAL');

    // 테이블 생성
    db.exec(`
      CREATE TABLE test_table (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        ...
      )
    `);
  });

  afterAll(() => {
    db.close();
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  // 테스트 케이스
  it('전체 흐름을 검증해야 함', () => {
    // 1. 준비
    const testData = { ... };

    // 2. 실행
    const result = executeFeature(db, testData);

    // 3. 검증
    expect(result.status).toBe('success');

    // DB에서 검증
    const dbRecord = db.prepare('SELECT * FROM test_table WHERE id = ?')
      .get(testData.id);
    expect(dbRecord).toBeDefined();
  });
});
```

### 4.2 통합 테스트 작성 체크리스트

- [ ] 테스트 DB 생성/정리
- [ ] 다양한 데이터 상태 테스트 (empty, single, multiple, edge cases)
- [ ] 트랜잭션 처리
- [ ] 외래 키 제약 조건
- [ ] 에러 복구 시나리오

---

## 5. API 테스트

### 5.1 API 라우트 테스트

**위치:** `src/app/api/__tests__/route-name.test.ts`

**구조:**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { GET, POST } from '../route';

describe('GET /api/endpoint', () => {
  it('올바른 응답을 반환해야 함', async () => {
    const request = new NextRequest('http://localhost:3000/api/endpoint');

    const response = await GET(request);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toHaveProperty('success', true);
  });

  it('쿼리 파라미터를 올바르게 처리해야 함', async () => {
    const request = new NextRequest(
      'http://localhost:3000/api/endpoint?filter=active'
    );

    const response = await GET(request);
    const data = await response.json();

    expect(data.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ status: 'active' })
      ])
    );
  });

  it('에러 상황을 올바르게 처리해야 함', async () => {
    const request = new NextRequest('http://localhost:3000/api/endpoint');

    // Mock 에러 상황
    jest.spyOn(database, 'query').mockRejectedValue(new Error('DB Error'));

    const response = await GET(request);

    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.error).toBeDefined();
  });
});

describe('POST /api/endpoint', () => {
  it('올바른 요청으로 데이터를 생성해야 함', async () => {
    const request = new NextRequest('http://localhost:3000/api/endpoint', {
      method: 'POST',
      body: JSON.stringify({ name: 'test', value: 123 }),
    });

    const response = await POST(request);

    expect(response.status).toBe(201);
    const data = await response.json();
    expect(data.id).toBeDefined();
  });

  it('필수 필드 검증을 해야 함', async () => {
    const request = new NextRequest('http://localhost:3000/api/endpoint', {
      method: 'POST',
      body: JSON.stringify({ value: 123 }), // name 누락
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
  });
});
```

---

## 6. 커버리지 관리

### 6.1 커버리지 대시보드

**접속:** `http://localhost:3000/admin/test-coverage`

**표시 정보:**
- 전체 커버리지 비율
- 파일별 커버리지
- 테스트 성공/실패/스킵 현황

### 6.2 커버리지 목표

| 카테고리 | 목표 |
|---------|------|
| 유틸리티 함수 | 80% 이상 |
| 핵심 컴포넌트 | 70% 이상 |
| API 라우트 | 75% 이상 |
| 전체 | 50% 이상 |

### 6.3 커버리지 타입별 목표

```
Statements  : 테스트된 코드 라인 수
Branches    : 조건문(if/else) 커버리지
Functions   : 함수 정의 커버리지
Lines       : 실행된 코드 라인 수
```

---

## 7. 테스트 실행

### 7.1 테스트 실행 명령어

```bash
# 모든 테스트 실행
npm test

# Watch 모드 (개발 중)
npm run test:watch

# 커버리지 리포트 생성
npm run test:coverage

# 특정 파일만 테스트
npm test -- ShopClientView

# 스냅샷 업데이트
npm test -- -u
```

### 7.2 통합 테스트 실행

```bash
# 통합 테스트만 실행 (분리된 Node 환경)
npm test -- --testPathPatterns="src/tests"
```

### 7.3 CI/CD 파이프라인

**푸시 전 반드시 실행:**
```bash
npm run test:coverage
```

**체크 항목:**
- [ ] 모든 테스트 통과
- [ ] 커버리지 목표 달성
- [ ] 스냅샷 변경 검토

---

## 8. 모킹 및 테스트 유틸

### 8.1 API 모킹

```typescript
// fetch 모킹
global.fetch = jest.fn(() =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve({ data: 'test' }),
  })
);
```

### 8.2 React 컴포넌트 모킹

```typescript
jest.mock('../ComponentName', () => ({
  __esModule: true,
  default: () => <div>Mocked Component</div>,
}));
```

### 8.3 데이터베이스 모킹

```typescript
const mockDb = {
  prepare: jest.fn(() => ({
    run: jest.fn().mockReturnValue({ changes: 1 }),
    get: jest.fn().mockReturnValue({ id: '123' }),
    all: jest.fn().mockReturnValue([]),
  })),
};
```

---

## 9. 디버깅 팁

### 9.1 테스트 디버깅

```typescript
// 단일 테스트만 실행
it.only('이 테스트만 실행', () => {
  // ...
});

// 특정 테스트 스킵
it.skip('이 테스트는 스킵', () => {
  // ...
});

// 콘솔 출력
console.log('디버그:', variable);
```

### 9.2 async/await 테스트

```typescript
it('비동기 작업을 올바르게 처리해야 함', async () => {
  // async 함수는 Promise를 반환해야 함
  await expect(asyncFunction()).resolves.toEqual(expectedValue);
});
```

### 9.3 타임아웃 설정

```typescript
// 기본 5000ms, 필요시 변경
it('오래 걸리는 작업', async () => {
  // ...
}, 10000); // 10초로 연장
```

---

## 10. 주의사항

### 10.1 테스트 작성 시 피해야 할 것

- ❌ 테스트 간 의존성 (공유 상태)
- ❌ 실제 API 호출 (무조건 Mock)
- ❌ 하드코딩된 시간 (beforeEach/afterEach 사용)
- ❌ 테스트 순서에 의존 (각 테스트는 독립적)

### 10.2 테스트 작성 시 해야 할 것

- ✅ 한 테스트는 한 가지만 테스트
- ✅ 명확한 테스트 이름 (what → when → then)
- ✅ AAA 패턴 (Arrange → Act → Assert)
- ✅ 예상 값을 명시적으로 작성

---

## 참고: 개발 가이드와의 차이

**DEVELOPMENT_GUIDE.md**: 기능 구현 패턴과 아키텍처
**TEST_GUIDE.md** (이 문서): 테스트 작성 방법과 실행 규칙

향후 테스트를 통합해야 할 때는 이 가이드를 참고하여 작성하세요.
