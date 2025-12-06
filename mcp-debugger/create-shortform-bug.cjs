const mysql = require('mysql2/promise');

async function createBug() {
  const connection = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'trend2024',
    database: 'trend_video'
  });

  try {
    // Get next bug ID
    const [rows] = await connection.query(
      "SELECT id FROM bugs ORDER BY created_at DESC LIMIT 1"
    );

    let nextId;
    if (rows.length > 0) {
      const lastId = rows[0].id;
      const lastNum = parseInt(lastId.replace('BTS-', ''));
      nextId = `BTS-${String(lastNum + 1).padStart(7, '0')}`;
    } else {
      nextId = 'BTS-0000001';
    }

    const bugData = {
      id: nextId,
      title: '숏폼 변환 버튼 클릭 시 작업이 실행되지 않음',
      summary: '숏폼 버튼 클릭 시 "시작됨" 메시지는 표시되지만 실제 task 폴더와 영상이 생성되지 않음',
      status: 'open',
      metadata: JSON.stringify({
        source: 'user_report',
        category: 'shortform-conversion',
        priority: 'P1',
        severity: 'HIGH',
        full_content: `## 📋 기본 정보

- **발생일**: 2025. 12. 4.
- **심각도**: 🔴 **HIGH**
- **우선순위**: 🔴 **P1**
- **카테고리**: shortform-conversion
- **관련 파일**:
  - \`trend-video-frontend/src/app/api/tasks/[id]/convert-to-shorts/route.ts\`
  - \`trend-video-frontend/src/app/automation/page.tsx\`

## 증상

1. 완료된 롱폼 작업에서 숏폼 버튼 클릭
2. "시작됨" 메시지가 표시됨
3. 하지만 실제로는:
   - task 폴더가 생성되지 않음
   - 영상 파일이 생성되지 않음
   - Python 프로세스가 실행되지 않는 것으로 보임

## 예상 원인

### 1. 프론트엔드 API 호출 문제
- API 호출이 실패하거나 타임아웃됨
- 또는 API 호출 자체가 안 됨

### 2. API 라우트 내부 문제
- convert-to-shorts/route.ts 에서 조기 종료
- 필수 데이터 누락으로 중단

### 3. Python 프로세스 실행 문제
- spawn 후 즉시 종료
- Python 스크립트 경로 문제
- 의존성 문제

## 조사 방법

1. 브라우저 개발자 도구에서 Network 탭 확인
2. 서버 로그에서 숏폼 관련 로그 확인
3. convert-to-shorts API 코드 흐름 추적

## 체크리스트

- [ ] 프론트엔드 숏폼 버튼 클릭 핸들러 확인
- [ ] API 호출 응답 확인
- [ ] convert-to-shorts/route.ts 로그 추가
- [ ] Python 프로세스 실행 확인
- [ ] task 폴더 생성 로직 확인
`,
        related_files: [
          'trend-video-frontend/src/app/api/tasks/[id]/convert-to-shorts/route.ts',
          'trend-video-frontend/src/app/automation/page.tsx'
        ]
      })
    };

    await connection.query(
      'INSERT INTO bugs (id, title, summary, status, metadata, created_at, updated_at) VALUES (?, ?, ?, ?, ?, NOW(), NOW())',
      [bugData.id, bugData.title, bugData.summary, bugData.status, bugData.metadata]
    );

    console.log(`✅ Bug created: ${nextId} - ${bugData.title}`);

  } finally {
    await connection.end();
  }
}

createBug().catch(console.error);
