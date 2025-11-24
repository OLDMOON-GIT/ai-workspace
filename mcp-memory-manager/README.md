# MCP Memory Manager

대화 기억 + 패턴 분석 + 문서 자동 업데이트 MCP 서버

## 기능

### 1. `remember` - 기억 저장
대화에서 중요한 내용을 분류하여 저장
- **mistake**: 실수
- **important**: 중요사항
- **pattern**: 반복 패턴
- **solution**: 해결책
- **tip**: 팁

### 2. `recall` - 기억 검색
저장된 기억을 키워드/카테고리로 검색

### 3. `record_mistake_pattern` - 실수 패턴 기록
같은 실수 패턴이 반복되면 자동 카운트

### 4. `analyze_mistakes` - 실수 분석
반복되는 실수 패턴 리포트 생성

### 5. `get_memory_summary` - 전체 요약
저장된 모든 기억의 요약 리포트

### 6. `update_dev_guide` - 개발 가이드 업데이트
자주 반복되는 실수/중요사항을 DEVELOPMENT_GUIDE.md에 자동 추가

### 7. `get_frequent_mistakes` - 자주 반복되는 실수
2회 이상 발생한 실수 목록

### 8. `clear_memory` - 기억 삭제
특정 기억 삭제

## 설치

```bash
cd C:\Users\oldmoon\workspace\mcp-memory-manager
npm install
npm run build
```

## 데이터 저장 위치

```
C:\Users\oldmoon\workspace\mcp-memory-manager\data\memory.db (SQLite)
```

## 사용 예시

```
# 실수 기록
"3종 세트 수정 누락했어. 이거 기억해둬"
→ remember 도구가 자동 호출

# 패턴 기록
"또 HMR 재시작 필요한지 헷갈렸어"
→ record_mistake_pattern 호출

# 기억 검색
"자동화 관련해서 뭐 기억해둔 거 있어?"
→ recall 도구 호출

# 실수 분석
"내가 자주 하는 실수가 뭐야?"
→ analyze_mistakes 호출

# 개발 가이드 업데이트
"지금까지 기억한 거 개발 가이드에 추가해"
→ update_dev_guide(autoAdd: true) 호출
```

## 자동 학습 흐름

```
대화 중 실수 발생
    ↓
remember(category: "mistake", ...) 저장
    ↓
같은 실수 반복 시 occurrence_count 증가
    ↓
2회 이상 반복된 실수 감지
    ↓
update_dev_guide()로 DEVELOPMENT_GUIDE.md 자동 업데이트
```

## 비용

**무료!**
- 로컬 SQLite DB 사용
- 외부 API 없음
