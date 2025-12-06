# BTS (Bug/Spec) 자동화 CI/CD 아키텍처

```mermaid
flowchart TD
  subgraph Input["📥 입력 소스"]
    I1[기획서\nMarkdown/PDF]
    I2[Figma\nDesign Specs]
    I3[ERD\nDB Schema]
    I4[Architecture\nDiagram]
  end

  subgraph Parser["🔍 파서 & 변환"]
    P1[spec-parser.ts\nSpec 추출]
    P2[figma-parser.ts\nUI 컴포넌트 추출]
    P3[erd-parser.ts\nDB 마이그레이션 생성]
    P4[arch-parser.ts\n의존성 분석]
  end

  subgraph EDA["⚡ Event-Driven Architecture"]
    MQ[(Message Queue\nRedis/Bull)]
    E1{{bug.created}}
    E2{{spec.created}}
    E3{{test.failed}}
    E4{{test.passed}}
    E5{{deploy.triggered}}
  end

  subgraph BTS["🐛 BTS (Bug/Spec 관리)"]
    DB[(bugs 테이블\ntype: bug|spec|feature)]
    SEQ[bug_sequence]
    PRIORITY[priority: P0-P3]
  end

  subgraph SpawningPool["🤖 Spawning Pool (AI Workers)"]
    SP1[Dispatcher\n이벤트 구독]
    SP2[Claude x6\n복잡한 코드]
    SP3[Gemini x2\n간단한 작업]
    SP4[Codex x2\n플래닝/리뷰]
  end

  subgraph Dev["💻 개발"]
    D1[코드 생성\nsrc/]
    D2[DB 마이그레이션\nschema-mysql.sql]
    D3[API 라우트\napp/api/]
    D4[UI 컴포넌트\ncomponents/]
  end

  subgraph Test["🧪 테스트"]
    T1[Unit Tests\nJest]
    T2[Integration Tests\n__tests__/integration/]
    T3[UI Tests\nPlaywright]
    T4[E2E Tests\nautomation/]
  end

  subgraph Feedback["🔄 피드백 루프"]
    F1[monitor.ts\n로그 패턴 감지]
    F2[test-reporter.ts\n테스트 실패 보고]
    F3[error-collector.ts\n런타임 에러]
  end

  subgraph Deploy["🚀 배포"]
    DP1[Build\nnpm run build]
    DP2[Deploy\nVercel/Docker]
    DP3[Health Check\n상태 모니터링]
  end

  subgraph UI["🖥️ 관리 UI"]
    UI1[/admin/bts\n버그/스펙 관리]
    UI2[/admin/deploy\n배포 상태]
    UI3[/diagrams/*\n아키텍처 뷰어]
  end

  %% 입력 → 파서
  I1 --> P1
  I2 --> P2
  I3 --> P3
  I4 --> P4

  %% 파서 → BTS (이벤트 발행)
  P1 -->|SPEC 등록| DB
  P2 -->|UI SPEC 등록| DB
  P3 -->|Migration SPEC| DB
  P4 -->|Arch SPEC| DB
  DB -->|이벤트 발행| E1 & E2

  %% 이벤트 → 큐
  E1 --> MQ
  E2 --> MQ
  E3 --> MQ
  E4 --> MQ
  E5 --> MQ

  %% 큐 → Spawning Pool (구독)
  MQ -->|구독| SP1
  SP1 --> SP2 & SP3 & SP4

  %% Spawning Pool → 개발
  SP2 --> D1 & D3
  SP3 --> D4
  SP4 -->|코드 리뷰| D1

  %% 개발 → 테스트
  D1 & D2 & D3 & D4 --> T1
  T1 -->|통과| T2
  T2 -->|통과| T3
  T3 -->|통과| T4

  %% 테스트 → 이벤트 (실패/성공)
  T1 -->|실패| E3
  T2 -->|실패| E3
  T3 -->|실패| E3
  T4 -->|실패| E3
  T4 -->|모든 테스트 통과| E4

  %% 피드백 → 이벤트
  F1 -->|에러 감지| E1
  F2 -->|테스트 실패| E3
  F3 -->|런타임 에러| E1

  %% 배포 이벤트
  E4 -->|구독| DP1
  DP1 --> DP2
  DP2 --> DP3
  DP2 -->|배포 완료| E5

  %% 배포 → 피드백
  DP3 -->|에러 발생| F3

  %% UI
  DB --> UI1
  DP2 --> UI2
  I4 --> UI3

  %% 스타일
  style Input fill:#e1f5fe
  style Parser fill:#fff3e0
  style EDA fill:#f0f4c3
  style BTS fill:#fce4ec
  style SpawningPool fill:#f3e5f5
  style Dev fill:#e8f5e9
  style Test fill:#fff8e1
  style Feedback fill:#ffebee
  style Deploy fill:#e0f2f1
  style UI fill:#f5f5f5
```

## 📋 아키텍처 구성요소

### 1. 입력 소스 (Input Sources)
| 소스 | 형식 | 설명 |
|------|------|------|
| 기획서 | Markdown/PDF | 기능 요구사항, 스토리 |
| Figma | API/Export | UI 디자인 스펙 |
| ERD | SQL/Mermaid | DB 스키마 정의 |
| Architecture | Mermaid/Draw.io | 시스템 구조 |

### 2. 파서 & 변환 (Parsers)
- `spec-parser.ts`: 기획서에서 SPEC 항목 추출
- `figma-parser.ts`: Figma에서 UI 컴포넌트 정의 추출
- `erd-parser.ts`: ERD에서 DB 마이그레이션 스크립트 생성
- `arch-parser.ts`: 아키텍처에서 의존성 관계 분석

### 3. ⚡ EDA (Event-Driven Architecture)
```
이벤트 종류:
- bug.created: 버그 생성 시
- spec.created: SPEC 생성 시
- test.failed: 테스트 실패 시
- test.passed: 모든 테스트 통과 시
- deploy.triggered: 배포 시작 시

메시지 큐:
- Redis Pub/Sub 또는 Bull Queue
- 발행자(Publisher) → 큐 → 구독자(Subscriber)
- 역제어(IoC): 폴링 없이 이벤트 기반 실행
```

### 4. BTS (Bug/Spec Tracking System)
```sql
bugs 테이블:
- id: 자동 증가 ID (BTS-XXXX)
- type: bug | spec | feature
- priority: P0 | P1 | P2 | P3
- status: open | in_progress | resolved | wontfix | invalid
- assigned_to: AI 워커 또는 개발자
- source: manual | log_monitor | test_failure | parser
```

### 5. Spawning Pool (AI Workers)
| 워커 | 수량 | 담당 | 구독 이벤트 |
|------|------|------|-------------|
| Claude | 6 | 복잡한 코드, 롱폼 대본, 버그 수정 | bug.created, spec.created |
| Gemini | 2 | 간단한 작업, 숏폼, 상품 | spec.created |
| Codex | 2 | 플래닝, 아키텍처, 코드 리뷰 | spec.created |

### 6. 테스트 파이프라인
```
Unit Tests → Integration Tests → UI Tests → E2E Tests
     ↓              ↓               ↓           ↓
   실패 → test.failed 이벤트 → 큐 → AI 워커 자동 할당
   성공 →                    test.passed 이벤트 → 배포
```

### 7. 피드백 루프 (이벤트 발행)
1. **로그 모니터** (`monitor.ts`): 에러 감지 → `bug.created` 발행
2. **테스트 리포터** (`test-reporter.ts`): 실패 → `test.failed` 발행
3. **에러 수집기** (`error-collector.ts`): 런타임 에러 → `bug.created` 발행

### 8. 배포 파이프라인 (이벤트 구독)
```
test.passed 구독 → npm run build → Vercel/Docker 배포
                                         ↓
                              deploy.triggered 발행
                                         ↓
                              Health Check + 모니터링
```

## 🔄 EDA 기반 자동화 플로우

### 기획서 → 개발 → 배포 자동화
```
1. 기획서/Figma/ERD 업로드
2. 파서가 SPEC 추출 → DB 저장 → spec.created 이벤트 발행
3. 큐 → Spawning Pool 구독 → AI 워커 자동 할당
4. 코드 생성 → 테스트 실행
5. 테스트 통과 → test.passed 발행 → 배포 파이프라인 구독 → 자동 배포
6. 테스트 실패 → test.failed 발행 → 버그 등록 → 3으로 돌아감
```

### 에러 → 수정 자동화
```
1. 로그/테스트에서 에러 감지 → bug.created 발행
2. 큐 → Spawning Pool 구독 → AI 워커 자동 할당
3. 코드 수정 → 테스트
4. 테스트 통과 → resolved
5. 테스트 실패 → test.failed 발행 → 2로 돌아감
```

## 📁 관련 파일
- `/admin/bts` - 버그/스펙 관리 UI
- `/admin/deploy` - 배포 상태 UI
- `/diagrams/bts-architecture` - 이 아키텍처 뷰어
- `mcp-debugger/src/monitor.ts` - 로그 모니터 (이벤트 발행)
- `mcp-debugger/spawning-pool.py` - AI 워커 풀 (이벤트 구독)
- `automation/test-runner.js` - 테스트 러너 (이벤트 발행)
- `mcp-debugger/notification-worker.cjs` - 알림 워커 (이벤트 구독)

## 🔧 관련 SPEC
- **BTS-3189**: BTS CI/CD 자동화 아키텍처 구현
- **BTS-3190**: EDA 기반 푸시 시스템으로 전환 (폴링 → 이벤트)
