export const btsArchitectureMermaid = `flowchart TB
    %% BTS + Spawning Pool v2 Architecture (EDA) - 2025-12-05

    subgraph intake["INTAKE"]
        direction LR
        logStream["Log stream"]
        testFailures["Test failures"]
        manualReports["Manual reports"]
        bugJs["bug.js CLI"]
    end

    subgraph monitor["MONITOR"]
        direction LR
        logMonitor["log-monitor.ts"]
    end

    subgraph eda["EDA (Event-Driven Architecture)"]
        direction TB
        subgraph redis["Redis + Bull Queue"]
            eventBus["event-bus.ts\n(이벤트 버스)"]
            queues["이벤트 큐\nbug.created | spec.created\nbug.updated | test.failed\ntest.passed | deploy.triggered"]
        end
        subgraph workers_eda["알림 워커"]
            edaWorker["notification-worker-eda.cjs\n(이벤트 구독)"]
            legacyWorker["notification-worker.cjs\n(폴링 폴백)"]
        end
    end

    subgraph mysql["MySQL - bugs 테이블"]
        bugsTable["bugs\nid, type, priority\nstatus, worker_pid"]
    end

    subgraph spawningPool["SPAWNING POOL v2"]
        dispatcher["Dispatcher\n(작업 라우팅)"]
        subgraph workers["Worker Pool (10개)"]
            claude6["Claude x6\n롱폼, 복잡한 버그"]
            gemini2["Gemini x2\n숏폼, 상품"]
            codex2["Codex x2\n플래닝, 코드리뷰"]
        end
    end

    subgraph cliTools["CLI 도구"]
        claim["claim (PID 마킹)"]
        resolve["resolve (해결)"]
        reopen["reopen (재오픈)"]
    end

    %% 버그 등록 흐름 (폴링 → 푸시 전환)
    logStream --> logMonitor
    logMonitor -->|에러 감지| bugsTable
    logMonitor -->|이벤트 발행| eventBus
    testFailures -->|UI 테스트 실패| bugsTable
    testFailures -->|test.failed| eventBus
    manualReports --> bugJs
    bugJs -->|INSERT| bugsTable
    bugJs -->|bug.created| eventBus

    %% EDA 이벤트 흐름
    eventBus -->|publish| queues
    queues -->|subscribe| edaWorker
    edaWorker -.->|Redis 미연결 시 폴백| legacyWorker
    legacyWorker -.->|10초 폴링| bugsTable

    %% Spawning Pool 흐름
    dispatcher -->|open 버그 조회| bugsTable
    queues -->|bug.created 알림| dispatcher
    dispatcher -->|라우팅| claude6
    dispatcher -->|라우팅| gemini2
    dispatcher -->|라우팅| codex2

    %% 워커 작업 흐름
    claude6 -->|worker_pid 마킹| bugsTable
    gemini2 -->|worker_pid 마킹| bugsTable
    codex2 -->|worker_pid 마킹| bugsTable

    claude6 -->|resolved| bugsTable
    gemini2 -->|resolved| bugsTable
    codex2 -->|resolved| bugsTable

    %% CLI 도구
    cliTools -->|CRUD| bugsTable

    %% 스타일
    classDef dbStyle fill:#7c3aed,stroke:#a78bfa,stroke-width:2px,color:#ffffff;
    classDef poolStyle fill:#059669,stroke:#34d399,stroke-width:2px,color:#ffffff;
    classDef workerStyle fill:#6366f1,stroke:#818cf8,stroke-width:2px,color:#ffffff;
    classDef monitorStyle fill:#dc2626,stroke:#ef4444,stroke-width:2px,color:#ffffff;
    classDef cliStyle fill:#0891b2,stroke:#22d3ee,stroke-width:2px,color:#ffffff;
    classDef edaStyle fill:#f59e0b,stroke:#fbbf24,stroke-width:2px,color:#ffffff;
    classDef redisStyle fill:#ef4444,stroke:#f87171,stroke-width:2px,color:#ffffff;

    class bugsTable dbStyle;
    class dispatcher poolStyle;
    class claude6,gemini2,codex2 workerStyle;
    class logMonitor monitorStyle;
    class bugJs,claim,resolve,reopen cliStyle;
    class eventBus,queues redisStyle;
    class edaWorker,legacyWorker edaStyle;
`;
