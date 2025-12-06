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

const title = '롱폼→숏폼 변환 시 크레딧 트랜잭션 처리 없음';

const summary = `롱폼을 숏폼으로 변환할 때 크레딧 차감과 작업 생성 사이에 트랜잭션이 없어 실패 시 크레딧 손실 발생.

주요 문제:
- 크레딧 차감 후 작업 생성 실패 시 환불 안됨
- Python 프로세스 실행 실패 시에도 크레딧이 돌아오지 않음
- 사용자 크레딧 손실 발생

영향:
- 심각도 CRITICAL: 사용자 금전적 손실`;

const metadata = {
  severity: 'CRITICAL',
  priority: 'P0',
  category: 'credits-transaction',
  source: 'shortform conversion',
  error_type: 'Transaction Missing',
  related_files: [
    'trend-video-frontend/src/app/api/tasks/[id]/convert-to-shorts/route.ts'
  ],
  full_content: `## 📋 기본 정보

- **발생일**: ${new Date().toLocaleString('ko-KR')}
- **심각도**: 🔴 **CRITICAL**
- **우선순위**: 🔴 **P0**
- **카테고리**: credits-transaction
- **관련 파일**:
  - \`trend-video-frontend/src/app/api/tasks/[id]/convert-to-shorts/route.ts\` (372-401번 줄)

## 증상

롱폼→숏폼 변환 시 크레딧이 차감되지만, 작업 생성이나 프로세스 실행이 실패해도 환불되지 않음.

### 재현 방법

1. 롱폼 영상을 숏폼으로 변환 시도
2. 크레딧 차감됨
3. 이후 단계에서 실패 (예: DB 오류, Python 프로세스 오류)
4. **크레딧만 차감되고 환불 안됨**

### 기대 동작

- 작업 생성 실패 시 크레딧 자동 환불
- 트랜잭션으로 원자성 보장

### 실제 동작

- 크레딧 차감 후 실패해도 그대로 차감됨

## 원인 분석

### 문제 코드

\`\`\`typescript
// 372-401번 줄 (route.ts)

// 크레딧 차감
await run('UPDATE user SET credits = credits - ? WHERE user_id = ?', [creditCost, user.userId]);

// 새 작업 생성
await run(\`
  INSERT INTO content (content_id, user_id, title, prompt_format, status, source_content_id, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
\`, [newJobId, user.userId, title, 'shortform', 'processing', taskId, now, now]);

// ❌ 위 두 작업 사이에 트랜잭션 없음
// ❌ 실패 시 크레딧만 차감되고 롤백 안됨
\`\`\`

### 근본 원인

1. **트랜잭션 처리 없음**: 크레딧 차감과 작업 생성이 별도 쿼리
2. **에러 시 환불 로직 없음**: catch 블록에서 크레딧 복구 안함
3. **비동기 프로세스**: Python 실행 실패해도 이미 크레딧 차감됨

## 해결 방안

### MySQL 트랜잭션 사용

\`\`\`typescript
// 개선된 코드
import db from '@/lib/mysql';

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const connection = await db.getConnection();

  try {
    // 트랜잭션 시작
    await connection.beginTransaction();

    // 1. 크레딧 차감
    await connection.query(
      'UPDATE user SET credits = credits - ? WHERE user_id = ?',
      [creditCost, user.userId]
    );

    // 2. 작업 생성
    await connection.query(
      \`INSERT INTO content (content_id, user_id, title, prompt_format, status, source_content_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)\`,
      [newJobId, user.userId, title, 'shortform', 'processing', taskId, now, now]
    );

    // 3. 모든 DB 작업 완료 후 커밋
    await connection.commit();

    // 4. Python 프로세스 실행 (DB 작업 후)
    const pythonProcess = spawn('python', [...], { ... });

    pythonProcess.on('error', async (err) => {
      console.error('❌ Python 프로세스 실행 실패:', err);

      // Python 실행 실패 시 크레딧 환불
      await db.execute(
        'UPDATE user SET credits = credits + ? WHERE user_id = ?',
        [creditCost, user.userId]
      );

      // 작업 상태를 failed로 업데이트
      await db.execute(
        'UPDATE content SET status = ? WHERE content_id = ?',
        ['failed', newJobId]
      );
    });

    return NextResponse.json({ success: true, jobId: newJobId });

  } catch (error) {
    // 에러 발생 시 트랜잭션 롤백
    await connection.rollback();
    console.error('❌ 트랜잭션 실패:', error);

    return NextResponse.json(
      { error: '작업 생성 실패. 크레딧이 환불되었습니다.' },
      { status: 500 }
    );
  } finally {
    // 연결 반환
    connection.release();
  }
}
\`\`\`

### 추가 보완사항

1. **크레딧 충분 여부 재확인**
   \`\`\`typescript
   // 트랜잭션 내에서 크레딧 확인
   const [userRows] = await connection.query(
     'SELECT credits FROM user WHERE user_id = ? FOR UPDATE',
     [user.userId]
   );

   if (userRows[0].credits < creditCost) {
     throw new Error('크레딧이 부족합니다.');
   }
   \`\`\`

2. **로깅 추가**
   \`\`\`typescript
   // 크레딧 차감 로그
   await connection.query(
     \`INSERT INTO credit_log (user_id, amount, reason, created_at)
      VALUES (?, ?, ?, NOW())\`,
     [user.userId, -creditCost, \`숏폼 변환: \${newJobId}\`]
   );
   \`\`\`

## 체크리스트

- [ ] MySQL 트랜잭션 처리 추가
- [ ] Python 프로세스 에러 시 크레딧 환불 로직
- [ ] 크레딧 충분 여부 FOR UPDATE로 재확인
- [ ] 크레딧 차감/환불 로그 테이블 생성
- [ ] 기존 작업들 크레딧 정합성 확인
- [ ] 테스트: 의도적으로 실패시켜 환불 확인

## 테스트 시나리오

1. **DB 오류 시뮬레이션**
   - content INSERT 실패 유도
   - 크레딧이 롤백되는지 확인

2. **Python 실행 실패**
   - Python 경로 오류 유도
   - 크레딧이 환불되는지 확인

3. **동시성 테스트**
   - 같은 사용자가 동시에 여러 변환 요청
   - 크레딧이 정확히 차감되는지 확인

## 참고

- **현재 상태**: 트랜잭션 없이 순차 실행
- **위험도**: 크레딧 손실로 인한 사용자 불만 및 환불 요청
- **우선순위**: P0 (즉시 수정 필요)
`
};

await conn.execute(
  `INSERT INTO bugs (
    id, type, title, summary, status,
    metadata,
    created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())`,
  [
    bugId,
    'bug',
    title,
    summary,
    'open',
    JSON.stringify(metadata)
  ]
);

console.log(`✅ 버그 등록 완료: ${bugId}`);
console.log(`🐛 타입: BUG`);
console.log(`📋 제목: ${title}`);
console.log(`🔗 URL: http://localhost:2000/admin/bugs`);

await conn.end();
