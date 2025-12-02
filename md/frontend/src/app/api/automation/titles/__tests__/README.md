# 제목 관리 통합 테스트

## 📋 테스트 개요

이 통합 테스트는 제목 추가/수정/삭제 API의 **카테고리 저장/로드 문제**를 검증합니다.

### 주요 검증 항목

1. ✅ **카테고리와 함께 새 제목 추가** - POST /api/automation/titles
   - 카테고리가 DB에 제대로 저장되는지 확인
   - 다른 필드들도 올바르게 저장되는지 확인

2. ✅ **카테고리 수정** - PATCH /api/automation/titles
   - 카테고리를 변경했을 때 DB에 제대로 반영되는지
   - 여러 번 수정해도 마지막 값이 유지되는지
   - **"쇼츠왕"으로 자동 변경되지 않는지** ⚠️

3. ✅ **제목 조회** - GET /api/automation/titles
   - 저장된 카테고리가 올바르게 조회되는지
   - **조회 시 카테고리가 "쇼츠왕"으로 바뀌지 않는지** ⚠️

4. ✅ **제목 삭제** - DELETE /api/automation/titles
   - 제목과 관련 데이터가 모두 삭제되는지

## 🚀 테스트 실행 방법

### 방법 1: 배치 파일로 실행 (추천)

```bash
run-integration-test.bat
```

### 방법 2: npm 명령어로 실행

```bash
cd C:\Users\oldmoon\workspace\trend-video-frontend
npm test -- titles.integration.test.ts --verbose
```

### 방법 3: 특정 테스트만 실행

```bash
npm test -- titles.integration.test.ts -t "카테고리"
```

## 📊 예상 출력

```
PASS  src/app/api/automation/titles/__tests__/titles.integration.test.ts
  제목 관리 통합 테스트
    POST /api/automation/titles - 새 제목 추가
      ✓ 카테고리와 함께 새 제목을 추가해야 한다 (234ms)
    PATCH /api/automation/titles - 제목 수정
      ✓ 카테고리를 수정하면 DB에 반영되어야 한다 (156ms)
      ✓ 제목과 promptFormat을 동시에 수정해야 한다 (123ms)
      ✓ content_setting의 값들을 수정해야 한다 (145ms)
    GET /api/automation/titles - 제목 조회
      ✓ 저장된 제목을 올바르게 조회해야 한다 (89ms)
    DELETE /api/automation/titles - 제목 삭제
      ✓ 제목과 관련 데이터를 모두 삭제해야 한다 (167ms)
    카테고리 변경 추적 테스트
      ✓ 카테고리를 여러 번 수정해도 마지막 값이 유지되어야 한다 (301ms)

Test Suites: 1 passed, 1 total
Tests:       7 passed, 7 total
```

## 🐛 문제 진단

### "쇼츠왕" 문제가 발생하는 경우

만약 테스트가 실패하고 카테고리가 "쇼츠왕"으로 변경되는 경우, 다음을 확인하세요:

1. **DB 스키마 확인**
   ```sql
   DESC content;
   DESC content_setting;
   ```
   - `content.category` 컬럼이 존재하는지
   - 데이터 타입이 `VARCHAR(255)`인지

2. **실제 저장된 값 확인**
   ```sql
   SELECT content_id, title, category
   FROM content
   WHERE content_id = 'test-xxx'
   LIMIT 10;
   ```

3. **API 요청 로그 확인**
   - 브라우저 개발자 도구 > Network 탭
   - PATCH 요청의 payload에 `category` 필드가 포함되어 있는지
   - 응답이 200 OK인지

4. **프론트엔드 상태 확인**
   ```typescript
   // automation/page.tsx의 startEdit 함수
   console.log('🔍 [수정 폼] 초기 데이터:', {
     category: title.category,
     aiModel: title.ai_model
   });
   ```

5. **백엔드 로직 확인**
   ```typescript
   // src/lib/automation.ts의 addVideoTitle 함수 (704번 라인)
   const category = (data.title === '테스트' || data.promptFormat === 'product')
     ? '상품'
     : (data.category || null);
   ```

## 🔧 문제 해결

### 테스트가 실패하는 경우

1. **MySQL 연결 확인**
   - MySQL 서버가 실행 중인지 확인
   - `.env` 파일에 DB 연결 정보가 올바른지 확인

2. **테이블 스키마 확인**
   - `content`, `content_setting`, `task` 테이블이 존재하는지
   - `content.category` 컬럼이 존재하는지

3. **테스트 데이터 정리**
   ```sql
   DELETE FROM content WHERE content_id LIKE 'test-%';
   DELETE FROM task WHERE task_id LIKE 'test-%';
   ```

## 📝 테스트 코드 수정

테스트 코드를 수정하려면:

```bash
C:\Users\oldmoon\workspace\trend-video-frontend\src\app\api\automation\titles\__tests__\titles.integration.test.ts
```

### 새 테스트 추가 예시

```typescript
it('특정 시나리오를 테스트해야 한다', async () => {
  // Arrange (준비)
  const taskId = `test-${Date.now()}`;

  // Act (실행)
  await mysql.query('INSERT INTO ...', [...]);

  // Assert (검증)
  const [result]: any = await mysql.query('SELECT * FROM ...', [taskId]);
  expect(result.category).toBe('예상값');
});
```

## 🎯 다음 단계

1. 테스트 실행 후 결과 확인
2. 실패한 테스트의 에러 메시지 분석
3. 관련 코드 수정 (`automation.ts`, `route.ts`, `page.tsx`)
4. 테스트 재실행하여 검증
5. 모든 테스트 통과 후 실제 UI에서 재확인

## 📚 관련 파일

- **API 라우트**: `src/app/api/automation/titles/route.ts`
- **비즈니스 로직**: `src/lib/automation.ts`
- **프론트엔드**: `src/app/automation/page.tsx`
- **스키마**: `schema-mysql.sql`
- **SQL 쿼리**: `sql/scheduler.sql`, `sql/automation.sql`
