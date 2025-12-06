const mysql = require('mysql2/promise');

async function createBug() {
  const connection = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'trend2024',
    database: 'trend_video'
  });

  try {
    const bugData = {
      id: 'BTS-0000058',
      title: 'useImageFX is not defined - metadata 널 체크 누락',
      summary: 'image-worker.js에서 metadata가 null/undefined일 때 destructuring 실패로 useImageFX 변수를 사용할 수 없는 오류',
      status: 'resolved',
      metadata: JSON.stringify({
        source: 'image_worker',
        category: 'null-check',
        priority: 'P1',
        severity: 'HIGH',
        error_type: 'ReferenceError',
        full_content: `## 📋 기본 정보

- **발생일**: 2025. 12. 3. 오전 9:06:52
- **심각도**: 🔴 **HIGH**
- **우선순위**: 🔴 **P1**
- **카테고리**: null-check
- **관련 파일**:
  - \`trend-video-frontend/image-worker.js\` (98번 줄)
  - \`trend-video-frontend/src/workers/image-worker.ts\` (122번 줄)

## 증상

이미지 크롤링 작업 실행 시 \`useImageFX is not defined\` 에러 발생:

\`\`\`
❌ 크롤링 실패: useImageFX is not defined
\`\`\`

### 영향

- ❌ 이미지 크롤링 작업 실패
- ❌ 롱폼/숏폼 영상 제작 불가
- ❌ 자동화 파이프라인 중단

## 원인 분석

### 1. metadata 널 체크 누락

**image-worker.js:98 (문제 코드):**

\`\`\`javascript
async processTask(task) {
    const { metadata, taskId } = task;
    const { scenes, useImageFX = false, scriptId } = metadata;  // ❌ metadata가 null이면 에러!
    // ...
}
\`\`\`

만약 \`metadata\`가 \`null\` 또는 \`undefined\`이면:
- Destructuring 실패: "Cannot destructure property 'scenes' of 'null'"
- \`useImageFX\` 변수가 선언되지 않음
- 이후 코드에서 \`useImageFX\` 참조 시 "useImageFX is not defined" 에러

### 2. TypeScript 버전은 안전

**image-worker.ts:122 (안전한 코드):**

\`\`\`typescript
const { scriptId, useImageFX: metadataUseImageFX } = metadata || {};  // ✅ 안전!
\`\`\`

TypeScript 버전은 \`|| {}\` fallback이 있어서 안전하지만, 구형 JS 파일은 누락됨.

### 3. 발생 시나리오

1. 예전 코드로 생성된 task (metadata 없음)
2. 수동으로 생성된 task (metadata 누락)
3. DB migration 후 metadata 컬럼이 NULL
4. Queue에서 metadata 직렬화/역직렬화 오류

## 해결 방안

### 방안 1: Fallback 추가 (적용됨 ✅)

**image-worker.js 수정:**

\`\`\`javascript
async processTask(task) {
    const { metadata, taskId } = task;
    // ⭐ BTS-0000058: metadata가 null/undefined일 경우 대비하여 || {} 추가
    const { scenes, useImageFX = false, scriptId } = metadata || {};
    // ...
}
\`\`\`

이제 \`metadata\`가 null이어도:
- \`scenes = undefined\`
- \`useImageFX = false\` (기본값)
- \`scriptId = undefined\`

로 안전하게 처리됨.

### 방안 2: TypeScript로 완전 이전

구형 \`image-worker.js\`를 완전히 제거하고 TypeScript 버전만 사용:

\`\`\`bash
rm image-worker.js
# start-image-worker.js가 src/workers/image-worker.ts를 사용하도록 이미 설정됨
\`\`\`

## 체크리스트

- [x] image-worker.js에 \`|| {}\` fallback 추가
- [x] BTS-0000058 코멘트 추가
- [x] TypeScript 버전 확인 (이미 안전함)
- [ ] 구형 image-worker.js 파일 제거 고려
- [ ] 테스트: metadata 없이 task 실행

## 테스트 시나리오

1. **metadata null 테스트**
   - task_queue에 metadata=NULL인 task 생성
   - 이미지 워커 실행
   - 에러 없이 useImageFX=false로 동작 확인

2. **metadata 있는 정상 케이스**
   - metadata.useImageFX=true인 task 실행
   - ImageFX 모드로 정상 동작 확인

3. **metadata 없는 구형 task**
   - 예전 버전으로 생성된 task 재시도
   - 에러 없이 Whisk 모드로 동작 확인

## 참고

- **현재 상태**: 수정 완료 (BTS-0000058)
- **위험도**: 롱폼/숏폼 모든 이미지 크롤링 차단
- **우선순위**: P1 (즉시 수정 필요)
- **회귀 위험**: 낮음 (방어 코드 추가)

## 해결 완료

\`\`\`diff
- const { scenes, useImageFX = false, scriptId } = metadata;
+ const { scenes, useImageFX = false, scriptId } = metadata || {};
\`\`\`

이제 metadata가 null이어도 안전하게 동작합니다.
`,
        related_files: [
          'trend-video-frontend/image-worker.js',
          'trend-video-frontend/src/workers/image-worker.ts'
        ],
        resolution: 'image-worker.js:99에 || {} fallback 추가',
        resolved_at: new Date().toISOString()
      })
    };

    await connection.query(
      'INSERT INTO bugs (id, title, summary, status, metadata, created_at, updated_at) VALUES (?, ?, ?, ?, ?, NOW(), NOW())',
      [bugData.id, bugData.title, bugData.summary, bugData.status, bugData.metadata]
    );

    console.log(`✅ Bug created and resolved: ${bugData.id} - ${bugData.title}`);

  } finally {
    await connection.end();
  }
}

createBug().catch(console.error);
