#!/usr/bin/env node
import mysql from 'mysql2/promise';

const conn = await mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: 'trend2024',
  database: 'trend_video'
});

const summary = `사용자가 자동화 작업을 중지(Stop)할 때, 정상적으로 취소되지 않고 실패(failed) 상태로 전환되는 문제.

주요 증상:
- 중지 버튼 클릭 시 작업이 failed 상태로 변경
- 정상적인 cancelled 상태가 아닌 오류 상태로 처리됨
- 작업 큐/상태 관리에서 취소 로직 문제

영향:
- 사용자가 의도적으로 취소한 작업이 실패로 기록
- 통계 및 모니터링 데이터 왜곡
- 재시도 로직이 잘못 동작할 가능성`;

const fullContent = `## 📋 기본 정보

- **발생일**: ${new Date().toLocaleString('ko-KR')}
- **심각도**: 🟠 **HIGH**
- **우선순위**: 🟠 **HIGH**
- **카테고리**: automation
- **관련 파일**: \`src/app/api/automation/stop/route.ts\`, \`src/lib/automation.ts\`

## 증상

사용자가 자동화 페이지에서 실행 중인 작업을 중지(Stop)할 때, 정상적인 "cancelled" 상태가 아닌 "failed" 상태로 전환되는 문제.

### 재현 방법

1. 자동화 페이지에서 새 제목 추가
2. 자동 실행 시작
3. 작업이 실행되는 동안 중지 버튼 클릭
4. 결과: 작업이 "실패" 상태로 표시됨

### 기대 동작

- 작업이 "취소됨(cancelled)" 상태로 전환
- 사용자 의도에 의한 취소임을 명확히 표시

### 실제 동작

- 작업이 "실패(failed)" 상태로 전환
- 에러로 잘못 기록됨

## 해결 방안

### 1. 백엔드 중지 로직 수정

프로세스 종료 시 cancelled 상태로 설정

### 2. 프론트엔드 API 수정

\`\`\`typescript
// src/app/api/automation/stop/route.ts
await db.execute(
  'UPDATE task_queue SET status = ? WHERE id = ?',
  ['cancelled', id]
);
\`\`\`

### 3. MySQL 테이블에 cancelled 상태 추가

\`\`\`sql
ALTER TABLE task_queue MODIFY COLUMN status
  ENUM('pending', 'processing', 'completed', 'failed', 'cancelled')
  DEFAULT 'pending';
\`\`\`

### 4. UI에서 cancelled 상태 표시

회색으로 표시하여 실패와 구분

## 체크리스트

- [ ] 백엔드 중지 로직에서 status='cancelled'로 설정
- [ ] MySQL task_queue 테이블 status ENUM에 'cancelled' 추가
- [ ] 프론트엔드 /api/automation/stop에서 cancelled 상태 업데이트
- [ ] UI에서 cancelled 상태 표시 (회색)
- [ ] 통계에서 cancelled는 실패 카운트에서 제외
- [ ] 취소된 작업 재시작 가능한지 테스트

## 중요

- **cancelled**: 사용자가 의도적으로 취소한 상태
- **failed**: 시스템 오류로 실패한 상태
- 이 둘을 명확히 구분해야 함!`;

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
  full_content: fullContent
};

await conn.execute(
  `UPDATE bugs SET
    summary = ?,
    metadata = ?,
    updated_at = NOW()
   WHERE id = 'BTS-0000046'`,
  [summary, JSON.stringify(metadata)]
);

console.log('✅ BTS-0000046 업데이트 완료: cancelled 상태로 수정');
await conn.end();
