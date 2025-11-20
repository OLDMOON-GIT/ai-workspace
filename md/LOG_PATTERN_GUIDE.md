# 로그 패턴 가이드

## 표준 로그 방식: job_logs 테이블 + 폴링

모든 백그라운드 작업의 실시간 로그는 **job_logs 테이블**에 저장하고 **폴링 방식**으로 조회합니다.

### ❌ 사용하지 않는 방식
- SSE (Server-Sent Events)
- WebSocket
- Stream 응답

### ✅ 표준 방식

#### 1. 백엔드 (API)

```typescript
// /api/some-task/route.ts
import Database from 'better-sqlite3';
import { NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const { jobId = `job_${Date.now()}` } = await request.json();

  // job_logs에 로그 저장 함수
  function saveLog(message: string) {
    const db = new Database(dbPath);
    db.prepare(`
      INSERT INTO job_logs (job_id, log_message, created_at)
      VALUES (?, ?, datetime('now'))
    `).run(jobId, message);
    db.close();
  }

  // 백그라운드 실행 (응답 먼저 반환)
  (async () => {
    try {
      saveLog('🚀 작업 시작');

      // 긴 작업 수행
      for (let i = 0; i < 100; i++) {
        await doSomething();
        saveLog(`✅ ${i + 1}/100 완료`);
      }

      saveLog('🎉 작업 완료');
    } catch (error: any) {
      saveLog(`❌ 오류: ${error.message}`);
    }
  })();

  // 즉시 jobId 반환
  return NextResponse.json({ jobId, message: '작업 시작됨' });
}
```

#### 2. 프론트엔드 (폴링)

```typescript
async function startTask() {
  setModalOpen(true);
  setLogs([]);
  setIsRunning(true);

  try {
    // 1. API 호출로 jobId 받기
    const response = await fetch('/api/some-task', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });

    const { jobId } = await response.json();

    // 2. 2초마다 로그 조회
    const pollInterval = setInterval(async () => {
      try {
        const logsRes = await fetch(`/api/automation/logs?jobId=${jobId}`);
        if (logsRes.ok) {
          const logsData = await logsRes.json();
          if (logsData.logs) {
            setLogs(logsData.logs.map((log: any) => log.log_message));
          }

          // 완료 체크
          const lastLog = logsData.logs[logsData.logs.length - 1];
          if (lastLog?.log_message?.includes('작업 완료')) {
            clearInterval(pollInterval);
            setIsRunning(false);
          }
        }
      } catch (error) {
        console.error('로그 조회 실패:', error);
      }
    }, 2000);

    // 3. 타임아웃 (10분)
    setTimeout(() => {
      clearInterval(pollInterval);
      setIsRunning(false);
    }, 600000);

  } catch (error: any) {
    setLogs(prev => [...prev, `❌ 실패: ${error.message}`]);
    setIsRunning(false);
  }
}
```

#### 3. 로그 조회 API (이미 존재)

```typescript
// /api/automation/logs/route.ts
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const jobId = searchParams.get('jobId');

  const db = new Database(dbPath);
  const logs = db.prepare(`
    SELECT * FROM job_logs
    WHERE job_id = ?
    ORDER BY id ASC
  `).all(jobId);
  db.close();

  return NextResponse.json({ logs });
}
```

## 적용 사례

### 1. 내 콘텐츠 - 영상/대본 생성
- `src/app/my-content/page.tsx`
- 영상 생성 시 job_logs에 저장 → 폴링으로 조회

### 2. 제목 풀 - Ollama 제목 생성
- `src/app/api/title-pool/generate/route.ts`
- Ollama 제목 생성 로그를 job_logs에 저장 → 폴링으로 조회

### 3. 자동화 - 제목 자동 생성
- `src/app/automation/page.tsx`
- 제목 자동 생성 테스트 로그를 job_logs에 저장 → 폴링으로 조회

## 왜 이 방식을 사용하나?

1. **간단함**: SSE보다 구현이 쉬움
2. **안정성**: 연결 끊김 없음
3. **확장성**: 여러 탭에서 동시 조회 가능
4. **일관성**: 모든 로그가 DB에 영구 저장됨
5. **디버깅**: DB에서 직접 로그 확인 가능

## 주의사항

- 폴링 간격: **2초** (너무 짧으면 서버 부담, 너무 길면 실시간성 떨어짐)
- 타임아웃: **10분** (작업이 너무 오래 걸리면 자동 중지)
- job_logs 정리: 오래된 로그는 주기적으로 삭제 필요 (선택사항)

## DB 스키마

```sql
CREATE TABLE job_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id TEXT NOT NULL,
  log_message TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_job_logs_job_id ON job_logs(job_id);
```
