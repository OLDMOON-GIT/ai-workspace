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

const title = '롱폼→숏폼 변환 시 Python 프로세스 에러 처리 누락';

const summary = `롱폼→숏폼 변환 시 Python 프로세스가 실패해도 사용자에게 성공 응답 전송.

주요 문제:
- spawn 자체 실패 시 처리 없음
- 프로세스 즉시 종료되어도 성공 응답
- 사용자는 성공으로 알지만 실제로는 실패

영향:
- 사용자가 실패를 인지하지 못함
- 크레딧 차감되었으나 작업 안됨`;

const metadata = {
  severity: 'CRITICAL',
  priority: 'P0',
  category: 'process-error-handling',
  source: 'shortform conversion',
  error_type: 'Error Handling Missing',
  related_files: [
    'trend-video-frontend/src/app/api/tasks/[id]/convert-to-shorts/route.ts'
  ],
  full_content: `## 📋 기본 정보

- **발생일**: ${new Date().toLocaleString('ko-KR')}
- **심각도**: 🔴 **CRITICAL**
- **우선순위**: 🔴 **P0**
- **카테고리**: process-error-handling
- **관련 파일**:
  - \`trend-video-frontend/src/app/api/tasks/[id]/convert-to-shorts/route.ts\` (657-702번 줄)

## 증상

롱폼→숏폼 변환 API가 성공 응답을 반환하지만, 실제로는 Python 프로세스가 실패하여 작업이 완료되지 않음.

### 재현 방법

1. Python 경로를 잘못 설정
2. 롱폼→숏폼 변환 요청
3. API 응답: \`{"success": true, "jobId": "..."}\`
4. 실제: Python 프로세스 실행 안됨
5. **사용자는 성공으로 알지만 작업 안됨**

### 기대 동작

- Python 프로세스 실행 실패 시 에러 응답
- 또는 작업 상태를 'failed'로 업데이트하고 알림

### 실제 동작

- spawn 실패해도 성공 응답 반환
- 사용자는 계속 대기

## 원인 분석

### 문제 코드

\`\`\`typescript
// 657-702번 줄

// Python 프로세스 실행
const pythonProcess = spawn('python', [
  createVideoScript,
  '--folder', newProjectPath,
  '--aspect-ratio', '9:16',
  '--add-subtitles'
], {
  cwd: backendPath,
  shell: true,
  env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUNBUFFERED: '1', PYTHONPATH: backendPath },
  windowsHide: true
});

// ❌ spawn 실패 시 처리 없음
// ❌ pythonProcess가 null일 수 있음

pythonProcess.stdout?.on('data', (data) => { ... });
pythonProcess.stderr?.on('data', (data) => { ... });

// 즉시 성공 응답 반환
return NextResponse.json({
  success: true,
  jobId: newJobId,
  message: '숏폼 변환이 시작되었습니다.'
});

// ❌ 프로세스 실행 실패를 확인하지 않음
\`\`\`

### 근본 원인

1. **비동기 실행**: spawn 후 즉시 응답 반환 (프로세스 성공 여부 미확인)
2. **spawn 에러 처리 없음**: spawn 자체가 실패해도 catch 안됨
3. **프로세스 에러 이벤트 미처리**: 'error' 이벤트 리스너 없음

## 해결 방안

### 1. spawn 에러 처리 추가

\`\`\`typescript
try {
  const pythonProcess = spawn('python', [...], { ... });

  // spawn 실패 감지
  pythonProcess.on('error', async (err) => {
    console.error('❌ Python 프로세스 실행 실패:', err);

    // 작업 상태를 failed로 업데이트
    await db.execute(
      'UPDATE content SET status = ?, updated_at = NOW() WHERE content_id = ?',
      ['failed', newJobId]
    );

    // 크레딧 환불
    await db.execute(
      'UPDATE user SET credits = credits + ? WHERE user_id = ?',
      [creditCost, user.userId]
    );
  });

  // 프로세스 종료 코드 확인
  pythonProcess.on('close', async (code) => {
    if (code !== 0) {
      console.error(\`❌ Python 프로세스 비정상 종료: 코드 \${code}\`);

      // 작업 상태 업데이트
      await db.execute(
        'UPDATE content SET status = ? WHERE content_id = ?',
        ['failed', newJobId]
      );

      // 크레딧 환불
      await db.execute(
        'UPDATE user SET credits = credits + ? WHERE user_id = ?',
        [creditCost, user.userId]
      );
    }
  });

  return NextResponse.json({
    success: true,
    jobId: newJobId,
    message: '숏폼 변환이 시작되었습니다.'
  });

} catch (error) {
  console.error('❌ spawn 실패:', error);

  // 트랜잭션 롤백은 이미 처리됨
  return NextResponse.json(
    { error: 'Python 프로세스 실행 실패' },
    { status: 500 }
  );
}
\`\`\`

### 2. 동기 대기 방식 (선택적)

완전히 성공을 확인하고 응답하려면:

\`\`\`typescript
// Promise로 래핑
const runPythonProcess = () => {
  return new Promise((resolve, reject) => {
    const pythonProcess = spawn('python', [...], { ... });

    pythonProcess.on('error', reject);

    pythonProcess.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(\`Process exited with code \${code}\`));
      }
    });
  });
};

try {
  // 프로세스 완료 대기
  await runPythonProcess();

  return NextResponse.json({
    success: true,
    jobId: newJobId,
    message: '숏폼 변환이 완료되었습니다.'
  });

} catch (error) {
  console.error('Python 프로세스 실패:', error);

  // 크레딧 환불
  await db.execute(
    'UPDATE user SET credits = credits + ? WHERE user_id = ?',
    [creditCost, user.userId]
  );

  return NextResponse.json(
    { error: '숏폼 변환 실패' },
    { status: 500 }
  );
}
\`\`\`

**단점**: API 응답 시간이 매우 길어짐 (몇 분 소요)

### 3. 권장 방안: 하이브리드

\`\`\`typescript
// 1. 트랜잭션으로 DB 작업 완료
await connection.commit();

// 2. Python 프로세스 실행
const pythonProcess = spawn('python', [...], { ... });

// 3. 에러 핸들러 등록
pythonProcess.on('error', async (err) => {
  // 실패 처리 + 크레딧 환불
  await handleProcessFailure(newJobId, user.userId, creditCost);
});

pythonProcess.on('close', async (code) => {
  if (code !== 0) {
    await handleProcessFailure(newJobId, user.userId, creditCost);
  }
});

// 4. 즉시 성공 응답 (작업 시작됨)
return NextResponse.json({
  success: true,
  jobId: newJobId,
  message: '숏폼 변환이 시작되었습니다.'
});

// 5. 사용자는 작업 목록에서 상태 확인 가능
\`\`\`

## 체크리스트

- [ ] spawn 'error' 이벤트 핸들러 추가
- [ ] 'close' 이벤트에서 exit code 확인
- [ ] 실패 시 크레딧 환불 로직
- [ ] 작업 상태를 'failed'로 업데이트
- [ ] 사용자에게 실패 알림 (웹소켓 또는 폴링)
- [ ] 로그 파일에 에러 기록
- [ ] 테스트: 의도적으로 Python 실패 유도

## 테스트 시나리오

1. **Python 경로 오류**
   - Python 경로를 잘못 설정
   - spawn 실패 확인
   - 크레딧 환불 확인

2. **스크립트 오류**
   - Python 스크립트에 syntax error 추가
   - exit code !== 0 확인
   - 작업 상태 'failed' 확인

3. **빠른 종료**
   - 스크립트가 즉시 종료되도록 수정
   - 에러 핸들러 작동 확인

## 참고

- **현재 상태**: spawn 후 즉시 성공 응답, 에러 처리 없음
- **위험도**: 사용자가 실패를 모르고 계속 대기
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
