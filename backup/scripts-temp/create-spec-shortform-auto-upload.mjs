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

const title = '자동화 페이지에서 숏폼 제작 체크 시 YouTube 자동 업로드 미구현';

const summary = `자동화 페이지에서 "롱폼→숏폼 자동생성" 체크 시 숏폼 영상은 생성되지만 YouTube 업로드는 수동으로 해야 함.

현재 상태:
- ✅ 롱폼 완료 → 숏폼 자동 변환 (이미지 9:16)
- ✅ 숏폼 영상 자동 생성
- ❌ 숏폼 YouTube 자동 업로드 (수동 필요)
- ❌ 설명/댓글에 롱폼 링크 자동 추가 안됨

요구사항:
- 숏폼 완료 시 자동으로 YouTube 업로드
- 설명란에 롱폼 링크 자동 추가
- 고정 댓글에 롱폼 링크 자동 추가`;

const metadata = {
  type: 'spec',
  severity: 'MEDIUM',
  priority: 'MEDIUM',
  category: 'automation-shortform',
  source: 'automation workflow',
  related_files: [
    'trend-video-frontend/src/lib/automation-scheduler.ts',
    'trend-video-frontend/src/app/api/youtube/upload/route.ts',
    'trend-video-frontend/src/app/api/automation/convert-to-shortform/route.ts'
  ],
  full_content: `## 📋 기본 정보

- **타입**: SPEC (개선 사양)
- **생성일**: ${new Date().toLocaleString('ko-KR')}
- **우선순위**: 🟡 **MEDIUM**
- **카테고리**: automation-shortform
- **관련 파일**:
  - \`trend-video-frontend/src/lib/automation-scheduler.ts\`
  - \`trend-video-frontend/src/app/api/youtube/upload/route.ts\`
  - \`trend-video-frontend/src/app/api/automation/convert-to-shortform/route.ts\`

## 요구사항

자동화 페이지에서 "롱폼→숏폼 자동생성" 체크박스 활성화 시 전체 플로우 자동화

### 현재 상황 (70% 자동화)

**✅ 구현된 부분:**
1. UI 설정: \`content_setting.auto_create_shortform = 1\` 저장
2. 롱폼 완료 감지: YouTube 업로드 후 자동 감지
3. 숏폼 자동 변환: 이미지 16:9 → 9:16 변환
4. 숏폼 영상 생성: \`/api/generate-video-upload\` 자동 호출
5. 롱폼 URL 저장: \`story.json\` metadata에 저장

**❌ 미구현 부분:**
1. 숏폼 YouTube 자동 업로드
2. 설명란에 롱폼 링크 자동 추가
3. 고정 댓글에 롱폼 링크 자동 추가

**현재 문제:**
- 숏폼 영상이 완료되면 "내 콘텐츠" 페이지에서 **수동 업로드** 필요
- 설명란에 롱폼 링크 수동으로 추가해야 함
- 사용자가 체크박스만 누르면 끝나야 하는데 수동 개입 필요

### 원하는 동작 (100% 자동화)

\`\`\`
[자동화 페이지]
    ↓
[사용자가 "롱폼 제작" + "숏폼 자동생성" 체크] ✅
    ↓
[롱폼 파이프라인 실행] ✅
 ├─ 대본 생성
 ├─ 이미지 크롤링
 ├─ 영상 생성
 └─ YouTube 업로드 ✅
    ↓
[숏폼 자동 변환] ✅
 ├─ 이미지 16:9 → 9:16 변환
 └─ story.json에 롱폼 URL 저장
    ↓
[숏폼 영상 생성] ✅
    ↓
[숏폼 YouTube 자동 업로드] ❌ **구현 필요**
 ├─ 설명란에 롱폼 링크 추가
 └─ 고정 댓글에 롱폼 링크 추가
    ↓
[완료! 사용자 개입 없음] ✅
\`\`\`

## 구현 방안

### 1. automation-scheduler.ts에 processShortformUploads() 추가

**파일**: \`trend-video-frontend/src/lib/automation-scheduler.ts\`

\`\`\`typescript
/**
 * 완료된 숏폼을 자동으로 YouTube에 업로드
 */
export async function processShortformUploads() {
  try {
    // 1. 완료된 숏폼 찾기 (아직 업로드 안된 것)
    const [completedShortforms] = await db.query(\`
      SELECT
        c.content_id,
        c.title,
        c.user_id,
        c.youtube_channel,
        c.source_content_id,
        cs.youtube_privacy,
        cs.tags
      FROM content c
      LEFT JOIN content_setting cs ON c.content_id = cs.content_id
      WHERE c.prompt_format = 'shortform'
        AND c.status = 'completed'
        AND c.youtube_url IS NULL
        AND c.source_content_id IS NOT NULL
    \`);

    if (completedShortforms.length === 0) {
      console.log('[processShortformUploads] 업로드 대기 중인 숏폼 없음');
      return;
    }

    console.log(\`[processShortformUploads] \${completedShortforms.length}개 숏폼 업로드 시작\`);

    for (const shortform of completedShortforms) {
      try {
        // 2. 롱폼 YouTube URL 조회
        const [longformRows] = await db.query(
          'SELECT youtube_url FROM content WHERE content_id = ?',
          [shortform.source_content_id]
        );
        const longform = longformRows[0];
        const longformUrl = longform?.youtube_url;

        if (!longformUrl) {
          console.log(\`[processShortformUploads] 롱폼 URL 없음, 숏폼 \${shortform.content_id} 스킵\`);
          continue;
        }

        // 3. story.json 읽기 (메타데이터 확인)
        const storyPath = path.join(BACKEND_PATH, 'tasks', shortform.content_id, 'story.json');
        let storyJson;
        try {
          const storyContent = fs.readFileSync(storyPath, 'utf-8');
          storyJson = JSON.parse(storyContent);
        } catch (err) {
          console.error(\`[processShortformUploads] story.json 읽기 실패: \${shortform.content_id}\`, err);
          continue;
        }

        // 4. 설명란 생성 (롱폼 링크 포함)
        const description = \`🎬 전체 영상 보기: \${longformUrl}

\${storyJson.script?.map(s => s.scene_description || '').join('\\n') || ''}

구독과 좋아요 부탁드립니다 ❤️\`;

        // 5. YouTube 업로드 API 호출
        console.log(\`[processShortformUploads] 숏폼 업로드 시작: \${shortform.content_id}\`);

        const uploadResponse = await fetch(\`http://localhost:\${PORT}/api/youtube/upload\`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Internal-Request': 'automation-scheduler',
            'X-User-Id': shortform.user_id
          },
          body: JSON.stringify({
            taskId: shortform.content_id,
            title: \`\${shortform.title} #Shorts\`,
            description: description,
            type: 'shortform',
            privacy: shortform.youtube_privacy || 'public',
            channelId: shortform.youtube_channel,
            tags: shortform.tags || '',
            pinnedComment: \`🎬 전체 영상 보러가기 👉 \${longformUrl}\`
          })
        });

        if (uploadResponse.ok) {
          const result = await uploadResponse.json();
          console.log(\`[processShortformUploads] 숏폼 업로드 성공: \${result.video_url}\`);
        } else {
          const error = await uploadResponse.text();
          console.error(\`[processShortformUploads] 숏폼 업로드 실패: \${error}\`);
        }

      } catch (err) {
        console.error(\`[processShortformUploads] 숏폼 업로드 중 오류: \${shortform.content_id}\`, err);
      }
    }

  } catch (error) {
    console.error('[processShortformUploads] 처리 중 오류:', error);
  }
}
\`\`\`

### 2. 스케줄러에 processShortformUploads() 추가

\`\`\`typescript
// startAutomationScheduler() 함수 내부

export function startAutomationScheduler() {
  if (schedulerInterval) {
    console.log('⚠️ Automation scheduler already running');
    return;
  }

  console.log('🚀 Starting automation scheduler...');

  const checkInterval = 30000; // 30초마다 확인

  schedulerInterval = setInterval(async () => {
    await processAutomationQueue();
    await processYoutubeQueue();
    await processShortformUploads(); // ✅ 추가
  }, checkInterval);

  console.log(\`✅ Automation scheduler started (check interval: \${checkInterval}ms)\`);
}
\`\`\`

### 3. YouTube upload API 수정 (이미 구현됨)

**파일**: \`trend-video-frontend/src/app/api/youtube/upload/route.ts\` (253-269번 줄)

이미 구현되어 있음:
- 숏폼 업로드 시 \`source_content_id\`로 롱폼 URL 조회
- 설명란에 자동 추가: \`🎬 전체 영상 보기: {longformUrl}\`
- 고정 댓글 자동 생성: \`🎬 전체 영상 보러가기 👉 {longformUrl}\`

### 4. 비디오 파일 경로 확인

숏폼 비디오 파일 경로:
\`\`\`
C:/Users/oldmoon/workspace/trend-video-backend/tasks/{content_id}/{title}.mp4
\`\`\`

YouTube upload API가 이미 올바르게 처리하고 있음.

## 이점

1. **완전 자동화**
   - 사용자는 체크박스만 누르면 끝
   - 롱폼 → 숏폼 → 업로드까지 수동 개입 없음

2. **롱폼 링크 자동 추가**
   - 숏폼 시청자가 롱폼으로 유입
   - 설명란 + 고정 댓글에 롱폼 링크
   - 크로스 프로모션 자동화

3. **일관성**
   - 모든 숏폼에 롱폼 링크 추가 보장
   - 수동 작업 시 누락 방지

4. **시간 절약**
   - 숏폼 수동 업로드 시간 절약
   - 대량 콘텐츠 생성 시 효율적

## 체크리스트

- [ ] \`processShortformUploads()\` 함수 구현
- [ ] \`startAutomationScheduler()\`에 함수 추가
- [ ] 롱폼 URL 조회 로직 (content.source_content_id)
- [ ] 설명란에 롱폼 링크 추가 (이미 구현됨)
- [ ] 고정 댓글에 롱폼 링크 추가 (이미 구현됨)
- [ ] 중복 업로드 방지 (youtube_url IS NULL 조건)
- [ ] 테스트: 롱폼 → 숏폼 → 자동 업로드 전체 플로우
- [ ] 테스트: 설명/댓글에 롱폼 링크 확인
- [ ] 문서 업데이트

## 테스트 시나리오

1. **전체 플로우 테스트**
   - 자동화 페이지에서 롱폼 + 숏폼 체크
   - 롱폼 YouTube 업로드 완료 대기
   - 숏폼 자동 생성 확인
   - 숏폼 자동 업로드 확인
   - 설명/댓글에 롱폼 링크 확인

2. **롱폼 URL 조회 테스트**
   - source_content_id로 롱폼 URL 조회
   - 롱폼 URL 없을 때 스킵 확인

3. **중복 업로드 방지**
   - 이미 업로드된 숏폼은 재업로드 안됨
   - youtube_url IS NULL 조건 작동 확인

4. **에러 처리**
   - 숏폼 업로드 실패 시 로그 확인
   - 다음 숏폼은 계속 처리되는지 확인

## 참고

- **현재 상태**: 숏폼 생성까지만 자동화 (70%)
- **목표**: 숏폼 YouTube 업로드까지 자동화 (100%)
- **영향도**: 사용자 경험 크게 개선
- **우선순위**: MEDIUM (편의성 향상)

## 추가 개선 사항 (선택적)

1. **업로드 상태 알림**
   - 숏폼 업로드 완료 시 사용자에게 알림
   - 이메일 또는 푸시 알림

2. **실패 재시도**
   - 업로드 실패 시 자동 재시도 (3회)
   - 실패 로그 저장

3. **배치 업로드**
   - 여러 숏폼을 한 번에 업로드
   - API 호출 최적화
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
    'spec',
    title,
    summary,
    'open',
    JSON.stringify(metadata)
  ]
);

console.log(`✅ 스펙 등록 완료: ${bugId}`);
console.log(`📄 타입: SPEC`);
console.log(`📋 제목: ${title}`);
console.log(`🔗 URL: http://localhost:2000/admin/bugs`);

await conn.end();
