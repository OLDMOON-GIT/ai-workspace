#!/usr/bin/env node
import mysql from 'mysql2/promise';

const conn = await mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: 'trend2024',
  database: 'trend_video'
});

// Get next bug ID
await conn.execute(`UPDATE bug_sequence SET next_number = next_number + 1 WHERE id = 1`);
const [rows] = await conn.execute(`SELECT next_number FROM bug_sequence WHERE id = 1`);
const nextNum = rows[0].next_number;
const bugId = `BTS-${String(nextNum).padStart(7, '0')}`;

const title = '자동화 작업 중지 시 실패 상태로 전환되는 문제';

const summary = `사용자가 자동화 작업을 중지(Stop)할 때, 정상적으로 중지되지 않고 실패(failed) 상태로 전환되는 문제.

주요 증상:
- 중지 버튼 클릭 시 작업이 failed 상태로 변경
- 정상적인 stopped 상태가 아닌 오류 상태로 처리됨
- 작업 큐/상태 관리에서 중지 로직 문제

영향:
- 사용자가 의도적으로 중지한 작업이 실패로 기록
- 통계 및 모니터링 데이터 왜곡
- 재시도 로직이 잘못 동작할 가능성`;

const metadata = {
  severity: 'HIGH',
  priority: 'HIGH',
  category: 'automation',
  source: 'automation page',
  error_type: 'Status Management',
  related_files: [
    'src/app/automation/page.tsx',
    'src/app/api/automation/stop/route.ts',
    'src/lib/automation.ts',
    'src/lib/queue-manager.ts'
  ],
  full_content: `## 📋 기본 정보

- **발생일**: ${new Date().toLocaleString('ko-KR')}
- **심각도**: 🟠 **HIGH**
- **우선순위**: 🟠 **HIGH**
- **카테고리**: automation
- **관련 파일**:
  - \`src/app/automation/page.tsx\`
  - \`src/app/api/automation/stop/route.ts\`
  - \`src/lib/automation.ts\`
  - \`src/lib/queue-manager.ts\`

## 증상

사용자가 자동화 페이지에서 실행 중인 작업을 중지(Stop)할 때, 정상적인 "stopped" 상태가 아닌 "failed" 상태로 전환되는 문제.

### 재현 방법

1. 자동화 페이지(http://localhost:2000/automation)에서 새 제목 추가
2. 자동 실행 시작
3. 작업이 실행되는 동안 중지 버튼 클릭
4. 결과: 작업이 "실패" 상태로 표시됨

### 기대 동작

- 작업이 "중지됨(stopped)" 상태로 전환
- 또는 최소한 "cancelled" 등의 명확한 취소 상태

### 실제 동작

- 작업이 "실패(failed)" 상태로 전환
- 에러 메시지가 함께 표시될 수 있음

## 원인 분석

### 1. 중지 API 응답 확인 필요

\`/api/automation/stop\` 엔드포인트에서:
- Python 백엔드에 중지 요청을 보내는 방식
- 백엔드에서 작업을 강제 종료할 때 상태 설정

### 2. 프론트엔드 상태 업데이트

\`src/app/automation/page.tsx\`에서:
- 중지 후 폴링으로 상태를 가져올 때 failed로 표시
- 또는 중지 API 응답에서 failed 상태를 받음

### 3. 백엔드 프로세스 종료 방식

Python 백엔드에서:
- 프로세스를 \`terminate()\` 또는 \`kill()\`할 때 상태 처리
- DB 업데이트 시점과 방법

## 해결 방안

### 1. 백엔드 중지 로직 수정

\`\`\`python
# trend-video-backend/src/automation/process_manager.py (또는 해당 파일)

def stop_task(task_id):
    """작업 중지"""
    process = get_process(task_id)
    if process and process.is_alive():
        # 정상 종료 시도
        process.terminate()
        process.join(timeout=5)

        if process.is_alive():
            # 강제 종료
            process.kill()
            process.join()

        # 상태를 stopped로 업데이트
        update_task_status(task_id, 'stopped', error_message=None)
    else:
        # 이미 종료된 경우
        update_task_status(task_id, 'stopped')
\`\`\`

### 2. 프론트엔드 API 수정

\`\`\`typescript
// src/app/api/automation/stop/route.ts

export async function POST(request: NextRequest) {
  try {
    const { id } = await request.json();

    // 백엔드에 중지 요청
    const response = await fetch(\`http://localhost:5000/stop/\${id}\`, {
      method: 'POST'
    });

    if (response.ok) {
      // MySQL에 stopped 상태 직접 업데이트
      await db.execute(
        \`UPDATE task_queue SET status = 'stopped', updated_at = NOW()
         WHERE id = ? AND status IN ('pending', 'processing')\`,
        [id]
      );

      return NextResponse.json({ success: true, status: 'stopped' });
    }

    return NextResponse.json({ error: 'Stop failed' }, { status: 500 });
  } catch (error) {
    console.error('Stop error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
\`\`\`

### 3. 상태 타입에 'stopped' 추가

\`\`\`sql
-- MySQL task_queue 테이블 확인
ALTER TABLE task_queue MODIFY COLUMN status
  ENUM('pending', 'processing', 'completed', 'failed', 'stopped', 'cancelled')
  DEFAULT 'pending';
\`\`\`

### 4. UI에서 stopped 상태 처리

\`\`\`typescript
// src/app/automation/page.tsx

const STATUS_LABELS = {
  pending: '대기 중',
  processing: '처리 중',
  completed: '완료',
  failed: '실패',
  stopped: '중지됨',
  cancelled: '취소됨'
};

const STATUS_COLORS = {
  // ...
  stopped: 'bg-gray-500',
  cancelled: 'bg-gray-400'
};
\`\`\`

## 체크리스트

- [ ] 백엔드 중지 로직에서 상태를 'stopped'로 설정
- [ ] MySQL task_queue 테이블 status ENUM에 'stopped' 추가
- [ ] 프론트엔드 /api/automation/stop에서 stopped 상태 업데이트
- [ ] UI에서 stopped 상태 표시 추가
- [ ] 중지 후 재시작 가능한지 테스트
- [ ] 통계 페이지에서 stopped는 실패로 카운트하지 않도록 수정

## 테스트 시나리오

1. **정상 중지 테스트**
   - 작업 시작 → 중지 → stopped 상태 확인

2. **처리 중 중지 테스트**
   - 이미지 크롤링 중 중지 → 즉시 중지되는지 확인
   - 스크립트 생성 중 중지 → 부분 완료 상태 확인

3. **재시작 테스트**
   - 중지된 작업 재시작 → 정상 동작 확인

4. **통계 확인**
   - stopped 작업이 실패 통계에 포함되지 않는지 확인

## 참고

- 현재 상태: task_queue.status = 'failed'로 잘못 설정됨
- 예상 원인: 백엔드에서 프로세스 종료 시 예외 발생하여 failed로 처리
- 우선순위 높음: 사용자 경험 및 데이터 정확성에 영향
`
};

await conn.execute(
  `INSERT INTO bugs (
    id, title, summary, status,
    metadata,
    created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, NOW(), NOW())`,
  [
    bugId,
    title,
    summary,
    'open',
    JSON.stringify(metadata)
  ]
);

console.log(`✅ 버그 등록 완료: ${bugId}`);
console.log(`📋 제목: ${title}`);
console.log(`🔗 URL: http://localhost:2000/admin/bugs`);

await conn.end();
