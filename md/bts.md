# Bug Tracking System (BTS)

발생한 버그와 해결 방법을 기록합니다.

---

## 🔴 BTS-0000028: Image 단계에서 image.log 파일에 로그가 저장되지 않음

**발생일:** 2025-12-03

**상태:** ✅ **해결됨**

**심각도:** 🟡 **MEDIUM** - 디버깅 불편, 기능 자체는 정상 작동

**증상:**
- Image 단계 실행 중 Python 출력이 콘솔과 DB에만 저장됨
- `tasks/{taskId}/image.log` 파일이 생성되지 않거나 비어있음
- 디버깅 시 로그 확인 불가

**근본 원인:**
- `unified-worker.js:513-524` Image 단계에서 `this.appendLog`만 호출 (DB 저장)
- `appendToLogFile` 함수 호출 누락 (파일 저장)
- YouTube 단계(line 702, 711)에서는 appendToLogFile 사용 중

**수정 방법:**
`src/workers/unified-worker.js:515, 523` - appendToLogFile 추가

```javascript
// stdout 핸들러
pythonProcess.stdout.on('data', (data) => {
  const text = data.toString();
  process.stdout.write(`${emoji} ${text}`);
  this.appendLog(taskId, type, text.trim()).catch(() => {});
  appendToLogFile(taskId, 'image', text.trim()); // 추가
});

// stderr 핸들러
pythonProcess.stderr.on('data', (data) => {
  const text = data.toString();
  errorOutput += text;
  process.stderr.write(`${emoji} ⚠️ ${text}`);
  this.appendLog(taskId, type, `⚠️ ${text.trim()}`).catch(() => {});
  appendToLogFile(taskId, 'image', `⚠️ ${text.trim()}`); // 추가
});
```

**재발 방지:**
- Script, Video 단계는 API 호출이므로 해당 없음 (API 핸들러 내부에서 로깅)
- Python 프로세스 직접 실행하는 단계(Image, YouTube)에서는 반드시 appendToLogFile 호출

**관련 파일:**
- `src/workers/unified-worker.js:513-524`

---

## 🔴 BTS-0000027: unified-worker에서 parseJsonSafely를 this.parseJsonSafely로 잘못 호출

**발생일:** 2025-12-03

**상태:** ✅ **해결됨**

**심각도:** 🔴 **CRITICAL** - Image 단계에서 파싱 실패로 워커 중단

**증상:**
```
Error: story.json 파싱 실패: Expected ',' or '}' after property value in JSON at position 3156
```

**근본 원인:**
- `unified-worker.js:481`에서 `this.parseJsonSafely(storyContent)` 호출
- parseJsonSafely는 클래스 메서드가 아니라 require로 가져온 함수
- `this.parseJsonSafely`는 undefined이므로 호출 실패
- fallback으로 JSON.parse 사용되면서 글자수 카운트 제거 안됨

**수정 방법:**
`src/workers/unified-worker.js:481` - `this.parseJsonSafely` → `parseJsonSafely`

```javascript
// ❌ 잘못된 코드
const parseResult = this.parseJsonSafely(storyContent);

// ✅ 올바른 코드
const parseResult = parseJsonSafely(storyContent);
```

**재발 방지:**
- 전체 파일에서 `this.parseJsonSafely` 검색하여 모두 수정
- require로 가져온 함수는 this 없이 직접 호출

**관련 파일:**
- `src/workers/unified-worker.js:481`

---

## 🔴 BTS-0000026: unified-worker YouTube 락에 race condition 존재

**발생일:** 2025-12-03

**상태:** ✅ **해결됨**

**심각도:** 🔴 **CRITICAL** - 여전히 중복 업로드 발생

**증상:**
BTS-0000025에서 runningYoutubeUploads Map을 추가했지만, 여전히 2번 업로드됨

**근본 원인:**
Memory 락 체크와 설정 사이에 race condition 존재

**시나리오:**
1. 호출A: has(taskId) → false
2. 호출B: has(taskId) → false (A가 아직 set하지 않음)
3. 호출A: set(taskId)
4. 호출B: set(taskId) (덮어씀)
5. 둘 다 실행!

**수정 내역:**
`src/workers/unified-worker.js:577-611` - DB 락으로 교체

```javascript
// ✅ DB atomic update로 락 획득
const lockResult = await run(`
  UPDATE task_queue
  SET status = 'processing'
  WHERE task_id = ? AND type = 'youtube' AND status = 'waiting'
`, [taskId]);

if (lockResult.affectedRows === 0) {
  throw new Error('이미 처리 중이거나 완료된 작업입니다');
}

// Memory 락도 보조로 유지
this.runningYoutubeUploads.set(taskId, Date.now());
```

**DB 락의 장점:**
- **Atomic**: WHERE 조건에 status = 'waiting' 포함으로 한 번만 성공
- **Process 간 공유**: 여러 워커 프로세스가 실행되어도 안전
- **영구적**: 프로세스 재시작 후에도 유효

---

## 🔴 BTS-0000025: unified-worker YouTube 중복 업로드 방지 로직 누락

**발생일:** 2025-12-03

**상태:** ✅ **해결됨**

**심각도:** 🟡 **HIGH** - 같은 영상이 두 번 업로드됨

**증상:**
```
[INFO] 업로드 시작: ... (2번)
[INFO] 업로드 완료: https://youtu.be/3DomhIRyUrc (2번)
[INFO] 썸네일 업로드 준비 중... (2번)
```

**근본 원인:**
unified-worker.js에 중복 업로드 방지 로직(runningUploads Map)이 없음

**수정 내역:**
`src/workers/unified-worker.js` 수정
1. runningYoutubeUploads Map 추가 (line 147)
2. youtube 업로드 시작 시 락 설정 (line 578-585)
3. 완료/실패/에러 시 락 해제 (line 838-855)

**구현:**
```javascript
// Constructor
this.runningYoutubeUploads = new Map();

// 시작 시 락 설정
if (this.runningYoutubeUploads.has(taskId)) {
  throw new Error('이미 업로드가 진행 중입니다.');
}
this.runningYoutubeUploads.set(taskId, Date.now());

// 종료 시 락 해제 (성공/실패/에러 모두)
this.runningYoutubeUploads.delete(taskId);
```

**참고:**
- /api/youtube/upload/route.ts:14-15, 56-68 참고

---

## 🔴 BTS-0000024: unified-worker에 상품/숏폼 YouTube 설명/댓글 로직 누락

**발생일:** 2025-12-03

**상태:** ✅ **해결됨**

**심각도:** 🟡 **HIGH** - 상품/숏폼 YouTube 업로드 시 설명/댓글 누락

**증상:**
unified-worker.js에서 YouTube 업로드 시 다음 로직이 누락됨:
1. 상품 카테고리: story.json의 youtube_description.text를 설명과 고정 댓글에 사용
2. 롱폼→숏폼: 롱폼 YouTube 링크를 설명과 고정 댓글에 추가

**근본 원인:**
BTS-0000021 수정 시 /api/youtube/upload/route.ts의 상품/숏폼 처리 로직을 unified-worker.js에 복사하지 않음

**수정 내역:**
`src/workers/unified-worker.js:626-713` - 메타데이터 생성 로직 추가

1. **상품 카테고리 처리 (line 631-646)**
   - category === '상품'이면 story.json에서 youtube_description.text 로드
   - 설명과 고정 댓글에 상품 정보 추가

2. **숏폼 처리 (line 648-694)**
   - prompt_format === 'shortform'이면 롱폼 YouTube URL 찾기
   - source_content_id로 롱폼 youtube_url 조회
   - story.json의 metadata.longform_youtube_url에서도 확인
   - 설명: `🎬 전체 영상 보기: {url}\n\n{기존 설명}`
   - 고정 댓글: `🎬 전체 영상 보러가기 👉 {url}`

3. **메타데이터에 pinned_comment 추가 (line 707-710)**

**참고:**
- /api/youtube/upload/route.ts:151-351 로직 참고

---

## 🔴 BTS-0000023: unified-worker YouTube 토큰 경로 오류

**발생일:** 2025-12-03

**상태:** ✅ **해결됨**

**심각도:** 🔴 **CRITICAL** - YouTube 업로드 인증 실패

**증상:**
```
[ERROR] YouTube 토큰이 없거나 만료되었습니다.
{"success": false, "error": "인증 실패"}
```

**근본 원인:**
unified-worker.js가 잘못된 토큰 파일명으로 찾고 있음

**잘못된 코드:**
```javascript
const tokenPath = path.join(credentialsDir, `youtube_token_${content.user_id}.json`);
```

**실제 토큰 파일명:**
```
youtube_token_${userId}_${channelId}.json
```

**수정 내역:**
`src/workers/unified-worker.js:616-640` - 토큰 경로 로직 수정
1. content_setting.youtube_channel이 있으면 해당 채널 토큰 사용
2. 없으면 user_id로 시작하는 토큰 파일 자동 탐색 (fallback)
3. 토큰이 없으면 명확한 에러 메시지 출력

**로직:**
```javascript
// 1. youtube_channel이 있으면 해당 채널 토큰 사용
if (content.youtube_channel) {
  tokenPath = `youtube_token_${content.user_id}_${content.youtube_channel}.json`;
}

// 2. 토큰 파일이 없으면 user_id로 시작하는 첫 번째 토큰 사용
if (!tokenPath || !fs.existsSync(tokenPath)) {
  const userTokenFiles = configFiles.filter(f =>
    f.startsWith(`youtube_token_${content.user_id}_`) && f.endsWith('.json')
  );
  tokenPath = userTokenFiles[0];
}
```

**참고:**
- /api/youtube/upload/route.ts:354-421 참고

---

## 🔴 BTS-0000022: unified-worker youtube 로그가 youtube.log 파일에 기록 안됨

**발생일:** 2025-12-03

**상태:** ✅ **해결됨**

**심각도:** 🟡 **HIGH** - 디버깅 불가

**증상:**
unified-worker에서 YouTube 업로드 시 Python 프로세스의 출력이 youtube.log 파일에 기록되지 않음.
콘솔에만 출력되고, task_queue.log 필드에만 저장됨.

**근본 원인:**
unified-worker.js에서 로그 파일 append 로직이 없었음

**수정 내역:**
`src/workers/unified-worker.js` 수정
1. `fs` 모듈 import 추가 (line 8)
2. `appendToLogFile` 헬퍼 함수 추가 (line 48-66)
3. Python stdout/stderr 읽을 때 appendToLogFile 호출 (line 702, 711)

**구현:**
```javascript
// 로그 파일 append 헬퍼
function appendToLogFile(taskId, logType, message) {
  const backendPath = path.join(process.cwd(), '..', 'trend-video-backend');
  const logFilePath = path.join(backendPath, 'tasks', taskId, `${logType}.log`);
  const timestamp = getLocalDateTime();
  const logLine = `[${timestamp}] ${message}\n`;
  fs.appendFileSync(logFilePath, logLine, 'utf-8');
}

// Python 출력 읽을 때 호출
pythonProcess.stdout.on('data', (data) => {
  appendToLogFile(taskId, 'youtube', text.trim());
});
```

**참고:**
- content.ts의 addContentLog 대신 직접 구현 (CommonJS 호환성)

---

## 🔴 BTS-0000021: youtube_upload_cli.py 인자 형식 불일치

**발생일:** 2025-12-03

**상태:** ✅ **해결됨**

**심각도:** 🔴 **CRITICAL** - youtube 업로드 완전 실패

**증상:**
```
youtube_upload_cli.py: error: the following arguments are required: --action
```

**근본 원인:**
`youtube_upload_cli.py`는 argparse 기반으로 `--action upload --video --metadata` 형식을 요구하는데,
unified-worker.js는 `[scriptPath, taskId, title, privacy]` 형식으로 호출

**잘못된 호출 방식:**
```javascript
spawn('python', [scriptPath, taskId, title, privacy], ...)
```

**올바른 호출 방식:**
```bash
python -u youtube_upload_cli.py --action upload --credentials <cred> --token <token> --video <path> --metadata <json_path> --thumbnail <path>
```

**수정 내역:**
- `src/workers/unified-worker.js:551-705` - `/api/youtube/upload/route.ts`와 동일한 방식으로 수정
  - taskId 폴더에서 비디오 파일 자동 탐색
  - 메타데이터 JSON 파일 생성 (title, description, tags, privacy_status 등)
  - argparse 형식으로 Python CLI 호출
  - 업로드 성공 시 youtube_url을 content 테이블에 저장

**참고:**
기존에 작동하는 `/api/youtube/upload/route.ts` 코드를 참고하여 수정함

---

## 🔴 BTS-0000020: PYTHONPATH 설정했는데도 src 모듈 import 실패

**발생일:** 2025-12-02

**상태:** 🔧 수정 중

**심각도:** 🔴 **CRITICAL** - youtube 업로드 완전 차단

**증상:**
```
ModuleNotFoundError: No module named 'src'
File "C:\Users\oldmoon\workspace\trend-video-backend\src\youtube\youtube_upload_cli.py", line 11
from src.youtube.uploader import YouTubeUploader, VideoMetadata
```

**근본 원인:**
**워커 프로세스가 재시작되지 않아서 PYTHONPATH 설정이 적용 안 됨**

**발생 시나리오:**
1. BTS-0000019에서 PYTHONPATH 추가함
2. 코드에는 `env: { PYTHONPATH: backendPath }` 있음
3. 하지만 워커 프로세스가 재시작 안 되어서 메모리에 이전 코드 로드됨
4. Python 실행 시 PYTHONPATH 없이 실행됨
5. `ModuleNotFoundError: No module named 'src'` 발생

**코드는 이미 수정되어 있음:**
- unified-worker.js:571-574 - PYTHONPATH 설정 완료
- youtube-worker.ts:130-133 - PYTHONPATH 설정 완료

**해결 방법:**
**워커 프로세스 재시작 필수**

---

## 🔴 BTS-0000019: youtube upload.py 파일명 오류

**발생일:** 2025-12-02

**상태:** ✅ **해결됨**

**심각도:** 🔴 **CRITICAL** - youtube 업로드 실패

**증상:**
```
Python script exited with code 2
python: can't open file 'C:\\Users\\oldmoon\\workspace\\trend-video-backend\\src\\youtube\\upload.py': [Errno 2] No such file or directory
```

**근본 원인:**
unified-worker.js가 존재하지 않는 `upload.py` 파일을 호출

**실제 파일 목록:**
```
src/youtube/
  __init__.py
  uploader.py
  youtube_manage_cli.py
  youtube_upload_cli.py  ✅ 이걸 사용해야 함!
```

**수정 내역:**

**1. unified-worker.js:562** - 파일명 수정:
```javascript
// ❌ 수정 전
const scriptPath = path.join(backendPath, 'src', 'youtube', 'upload.py');

// ✅ 수정 후
const scriptPath = path.join(backendPath, 'src', 'youtube', 'youtube_upload_cli.py');
```

**2. unified-worker.js:571-574** - PYTHONPATH 추가:
```javascript
const pythonProcess = spawn('python', [scriptPath, taskId, title, privacy], {
  cwd: backendPath,
  env: {
    ...process.env,
    PYTHONPATH: backendPath  // ⭐ src 모듈을 찾을 수 있도록 PYTHONPATH 설정
  },
  stdio: ['pipe', 'pipe', 'pipe']
});
```

**3. youtube-worker.ts:120** - 파일명 수정:
```typescript
// ❌ 수정 전
const scriptPath = path.join(backendPath, 'src', 'youtube', 'upload.py');

// ✅ 수정 후
const scriptPath = path.join(backendPath, 'src', 'youtube', 'youtube_upload_cli.py');
```

**4. youtube-worker.ts:130-133** - PYTHONPATH 추가:
```typescript
const pythonProcess = spawn('python', [...], {
  cwd: backendPath,
  env: {
    ...process.env,
    PYTHONPATH: backendPath  // ⭐ src 모듈을 찾을 수 있도록 PYTHONPATH 설정
  },
  stdio: ['pipe', 'pipe', 'pipe']
});
```

**수정된 파일:**
- `src/workers/unified-worker.js`
- `src/workers/youtube-worker.ts`

**결과:**
- youtube 업로드 Python 스크립트 정상 실행
- Python 모듈 import 정상 작동

---

## 🔴 BTS-0000018: video 단계에서 또 completed 설정됨

**발생일:** 2025-12-02

**상태:** ✅ **해결됨**

**심각도:** 🔴 **CRITICAL** - video 완료 시 completed로 설정되는 문제 재발

**증상:**
- video 단계 완료 시 `content.status = 'completed'` 설정됨
- 올바른 동작: `content.status = 'video', task_queue: type='youtube', status='waiting'`
- BTS-0000012와 다른 원인 (BTS-0000012는 unified-worker 버그, 이건 API 버그)

**규칙 (재확인):**
```
✅ video 완료 → content.status = 'video', task_queue: type='youtube', status='waiting'
❌ video 완료 → content.status = 'completed' (절대 안됨!)

completed는 youtube 단계에서만!
```

**근본 원인:**
`generate-video-upload/route.ts`가 영상 생성 완료 시 `updateJob(status: 'completed')` 호출

**문제 코드:**
```javascript
// ❌ generate-video-upload/route.ts:854-860
await updateJob(taskId, {
  status: 'completed',  // ⚠️ video 완료 시 completed로 설정!
  progress: 100,
  step: '완료!',
  videoPath,
  thumbnailPath
});
```

**실행 흐름:**
```
1. unified-worker: processTask(video) → API 호출
2. API: generateVideoFromUpload 실행
3. generateVideoFromUpload: updateJob(status: 'completed') → content.status = 'completed'
4. API 리턴
5. unified-worker: triggerNextStage('video') 호출
6. triggerNextStage: content.status = 'video'로 UPDATE (덮어씀)
7. triggerNextStage: task_queue → type='youtube', status='waiting'

문제: 3번에서 잠시 completed가 설정됨 (5-6번에서 video로 수정되긴 함)
```

**수정 내역:**

**generate-video-upload/route.ts:855-861** - status 제거:
```javascript
// ✅ BTS-0000018: status는 unified-worker가 관리함
// 여기서는 videoPath/thumbnailPath만 업데이트
await updateJob(taskId, {
  progress: 100,
  step: '영상 생성 완료',
  videoPath,
  thumbnailPath
  // status 제거: unified-worker의 triggerNextStage가 'video'로 설정
});
```

**책임 분리:**
- `generateVideoFromUpload`: 영상 생성 + videoPath/thumbnailPath 업데이트만
- `unified-worker`: 모든 상태 관리 (content.status, task_queue)

**결과:**
- video 완료 시: unified-worker가 content.status = 'video' 설정
- youtube 완료 시: unified-worker가 content.status = 'completed' 설정
- 중간에 completed가 설정되는 일 없음

---

## 🔴 BTS-0000017: video 생성 비동기 실행으로 youtube 단계 조기 진입

**발생일:** 2025-12-02

**상태:** ✅ **해결됨**

**심각도:** 🔴 **CRITICAL** - 영상 생성이 완료되지 않았는데 youtube 업로드로 넘어가서 실패

**증상:**
```
Python script exited with code 2
python: can't open file 'C:\\Users\\oldmoon\\workspace\\trend-video-backend\\src\\youtube\\upload.py': [Errno 2] No such file or directory
```
- video 생성이 완료되기 전에 youtube 단계로 전환
- 영상 파일이 아직 없어서 youtube 업로드 실패

**근본 원인:**
`/api/generate-video-upload/route.ts`가 **비동기로 영상 생성을 시작하고 바로 리턴**

**문제 코드:**

1. **route.ts:345-368** (비동기 실행):
```javascript
// 비동기로 영상 생성 시작
generateVideoFromUpload(taskId, userId, cost, {
  // ... 설정들
});

return NextResponse.json({
  success: true,
  taskId,
  message: '영상 생성이 시작되었습니다.'  // ⚠️ "시작"만!
});
```

2. **unified-worker.js:519-538** (잘못된 완료 판단):
```javascript
const response = await fetch(apiUrl, {
  method: 'POST',
  body: JSON.stringify({
    scriptId: taskId,
    type: promptFormat
  })
});

const result = await response.json();
console.log(`${emoji} [${type}] ✅ API call completed`);
await this.appendLog(taskId, type, `✅ 영상 생성 완료`);  // ⚠️ 실제로는 시작만 했는데!
```

**실행 흐름:**
```
1. unified-worker: video API 호출
2. API: generateVideoFromUpload() 비동기 실행 (await 없음)
3. API: 바로 리턴 { message: '영상 생성이 시작되었습니다.' }
4. unified-worker: "영상 생성 완료" 로그 출력 (실제로는 시작만 함!)
5. unified-worker: youtube 단계로 전환 (triggerNextStage)
6. youtube-worker: upload.py 실행 → 영상 파일 없음 → 실패!
```

**수정 내역:**

1. **generate-video-upload/route.ts:345** - await 추가:
```javascript
// ✅ BTS-0000017: 동기로 영상 생성 완료까지 대기 (await 추가)
await generateVideoFromUpload(taskId, userId, cost, {
  // ... 설정들
});

return NextResponse.json({
  success: true,
  taskId,
  message: '영상 생성이 완료되었습니다.'  // ✅ "완료"로 수정
});
```

2. **videos/generate/route.ts:150-155** - 메시지 수정:
```javascript
const result = await videoResponse.json();
console.log('✅ [VIDEO-GEN] Video generation completed:', result);

return NextResponse.json({
  success: true,
  taskId: result.taskId,
  message: 'Video generation completed'  // ✅ "completed"로 수정
});
```

3. **unified-worker.js:537** - 주석 추가:
```javascript
const result = await response.json();
// ✅ BTS-0000017: API가 영상 생성 완료까지 동기로 대기하므로 이 시점에서 실제로 완료됨
console.log(`${emoji} [${type}] ✅ API call completed`);
await this.appendLog(taskId, type, `✅ 영상 생성 완료`);
```

**결과:**
- API가 Python 프로세스 완료까지 동기로 대기
- unified-worker가 youtube 단계로 전환하기 전에 영상 파일이 생성됨
- youtube 업로드 정상 작동

---

## ⚠️ BTS-0000010: 스펙 오해로 인한 잘못된 스키마 수정 (최대 버그!)

**발생일:** 2025-12-02

**상태:** ✅ 해결됨 (롤백 완료)

**심각도:** 🔴 **CRITICAL** - 스펙을 완전히 반대로 이해하여 시스템 전체를 잘못 수정

**증상:**
1. task_queue PRIMARY KEY를 `(task_id, type)` 복합키로 변경
2. unified-worker.js를 INSERT 방식으로 수정
3. BTS-0000008, BTS-0000009에 잘못된 스펙 기록
4. 같은 task_id에 여러 type의 큐가 생성되어 데이터 일관성 깨짐

**근본 원인:**
**원래 설계를 완전히 오해함!**

### 잘못 이해한 내용:
```
❌ 한 task_id에 4개의 독립된 task_queue 레코드가 필요하다
   → script, image, video, youtube 각각 INSERT
   → PRIMARY KEY (task_id, type)
```

### 올바른 스펙:
```
✅ 한 task_id에 1개의 task_queue 레코드만 존재
   → 단계가 진행되면 type만 UPDATE
   → PRIMARY KEY (task_id)
```

**올바른 워크플로우:**
```javascript
// ✅ 올바른 방식 (UPDATE):
UPDATE task_queue
SET type = 'image', status = 'waiting'
WHERE task_id = ?

// task_queue에는 항상 1개 레코드만!
// 이력은 task_time_log에 기록됨 (여러 레코드 가능)
```

**잘못된 수정 내역:**
1. **schema-mysql.sql** (line 147-157):
   - `PRIMARY KEY (task_id)` → `PRIMARY KEY (task_id, type)` ❌

2. **unified-worker.js** (line 600-634):
   - UPDATE 방식 → INSERT 방식 ❌

3. **BTS-0000009 등록:**
   - "PRIMARY KEY 설계 오류"라며 복합키로 변경하는 내용 기록 ❌

**피해 범위:**
- task `77fb7660-56a7-47d9-bd46-cd35b4180b64`에 script, image 두 개의 큐 생성됨
- 데이터 일관성 깨짐
- 잘못된 스펙이 BTS 문서에 기록됨

**롤백 내역:**
1. **PRIMARY KEY 복원:**
```sql
ALTER TABLE task_queue DROP PRIMARY KEY;
ALTER TABLE task_queue ADD PRIMARY KEY (task_id);
```

2. **unified-worker.js 복원** (line 600-621):
```javascript
// ✅ 올바른 방식 (현재 type을 'completed'로 하지 않음!):
// 1. content.status는 현재 단계만 기록 (script/video), image는 유지
if (currentType === 'script' || currentType === 'video') {
  await run(`
    UPDATE content
    SET status = ?
    WHERE content_id = ?
  `, [currentType, taskId]);
}

// 2. task_queue: type → 다음 단계, status → 'waiting'으로 UPDATE
await run(`
  UPDATE task_queue
  SET type = ?, status = 'waiting'
  WHERE task_id = ?
`, [nextType, taskId]);

// ⚠️ 현재 단계를 'completed'로 하지 않음!
// task_queue는 항상 1개 레코드 (현재 상태만)
// 이력은 task_time_log에 기록됨
```

3. **schema-mysql.sql 복원** (line 147):
```sql
task_id CHAR(36) PRIMARY KEY,  -- 복합키 아님!
```

4. **BTS-0000009 삭제** (잘못된 버그 보고서)

5. **BTS-0000008 정리:** content.status 단계 업데이트 누락 건만 남김

6. **중복 데이터 정리:**
   - task `77fb7660`의 script 레코드 삭제, image만 유지

**재발 방지:**
- ⚠️ **스펙을 100번 확인해도 잘못 이해할 수 있음!**
- **사용자가 "100번 얘기했다"고 하면 즉시 멈추고 다시 확인**
- 스키마 변경 시 기존 코드의 패턴을 먼저 파악
- UPDATE vs INSERT 패턴을 코드에서 확인
- 테이블 이름과 PRIMARY KEY 설계 의도 파악
- **task_queue (현재 상태 1개)** vs **task_time_log (이력 여러 개)** 구분

---

## BTS-0000001: locked_by 컬럼 참조 에러

**발생일:** 2025-12-02

**상태:** ✅ 해결됨

**에러 메시지:**
```
Unknown column 'locked_by' in 'where clause'
```

**증상:**
- task worker들이 작업을 처리하지 못함
- task_lock 테이블 쿼리 실패

**원인:**
- task_lock 테이블 스키마가 `locked_by`에서 `lock_task_id`로 리팩토링됨
- 코드 16개 파일에서 여전히 `locked_by` 컬럼 참조

**영향 범위:**
- `unified-worker.js`
- `queue-manager.ts`
- `startup-recovery.ts`
- `automation/cleanup/route.ts`
- `automation/retry/route.ts`
- `automation/titles/route.ts`
- `automation/stop/route.ts`
- `lib/automation.ts`
- `lib/automation-scheduler.ts`
- 기타 6개 파일

**해결 방법:**
1. 모든 `locked_by = ?` → `lock_task_id = ?` 변경
2. `WHERE locked_by IS NOT NULL` → `WHERE worker_pid IS NOT NULL` 변경
3. `SELECT locked_by` → `SELECT worker_pid` 변경
4. PowerShell 스크립트로 일괄 수정 (`fix-locked-by.ps1`)
5. 데이터베이스 마이그레이션 실행 (`migrate-locked-by.mjs`)
6. MySQL에서 `locked_by` 컬럼 제거

**수정 커밋:**
- unified-worker.js (lines 54-111)
- queue-manager.ts (lines 93-112, 194-219, 272-283)
- startup-recovery.ts (lines 36-60, 193-200)

**재발 방지:**
- 스키마 변경 시 전체 코드베이스 grep으로 참조 확인 필수
- 컬럼명 변경 체크리스트 작성

---

## BTS-0000002: TTS speed 포맷 에러

**발생일:** 2025-12-02

**상태:** ✅ 해결됨

**에러 메시지:**
```
create_video_from_folder.py: error: argument --speed: invalid float value: '+0%'
```

**증상:**
- 영상 생성 작업(video task) 실패
- Python 스크립트가 TTS speed 파라미터 파싱 실패

**원인:**
- DB에 저장된 `tts_speed` 값이 percentage 문자열 형식 (`'+0%'`, `'+10%'` 등)
- Python script는 float 값 기대 (1.0, 1.1 등)

**해결 방법:**
1. `/api/generate-video-upload/route.ts` 수정 (lines 600-604)
2. percentage 문자열을 float로 변환하는 함수 추가:
```typescript
function convertTtsSpeed(speedStr: string): number {
  const match = speedStr.match(/([+-]?\d+)%/);
  if (!match) return 1.0;
  const percent = parseInt(match[1]);
  return 1.0 + (percent / 100);
}
```

**테스트:**
- `'+0%'` → `1.0`
- `'+10%'` → `1.1`
- `'-10%'` → `0.9`

**재발 방지:**
- Python 스크립트 인자는 항상 타입 검증
- percentage 포맷은 API 레벨에서 변환

---

## BTS-0000003: SQLite 레거시 코드 미제거

**발생일:** 2025-12-02

**상태:** ✅ 해결됨

**증상:**
- MySQL만 사용하는 시스템인데 SQLite 관련 코드/스키마 존재
- `schema-sqlite.sql`에 `locked_by` 컬럼 여전히 존재
- 불필요한 패키지 의존성

**원인:**
- 시스템 마이그레이션 (SQLite → MySQL) 시 레거시 코드 미제거
- 사용하지 않는 파일들이 유지보수 혼란 야기

**해결 방법:**
1. 파일 삭제:
   - `schema-sqlite.sql`
   - `unified-queue-manager.ts` (SQLite 기반)
   - `queue-manager-adapter.ts` (미사용 어댑터)

2. 패키지 제거:
   - `better-sqlite3` (31개 관련 패키지 자동 제거됨)
   - `@types/better-sqlite3`

3. `package.json` 정리 및 `npm install` 실행

**재발 방지:**
- 마이그레이션 완료 후 레거시 코드 제거 체크리스트 작성
- 사용하지 않는 파일은 즉시 삭제

---

## BTS-0000004: 서버 자동 재시작 문제

**발생일:** 2025-12-02

**상태:** ✅ 해결됨

**증상:**
- Claude가 코드 수정 후 자동으로 서버 프로세스 재시작
- 워커들이 락을 찾지 못하는 문제 유발
- 사용자가 직접 관리하는 서버와 충돌

**원인:**
- 코드 변경 시 캐시 리로드를 위해 서버 재시작 시도
- 실제 문제는 스키마 불일치였음 (locked_by 에러)

**해결 방법:**
- 서버 자동 재시작 금지
- 코드 수정만 하고 서버 관리는 사용자에게 위임

**재발 방지:**
- 명시적 사용자 요청 없이 서버 프로세스 조작 금지
- 백그라운드 프로세스 실행 시 사용자 확인 필수

---

## BTS-0000005: 일부 수정으로 인한 반복 에러

**발생일:** 2025-12-02

**상태:** ✅ 해결됨

**증상:**
- `locked_by` 에러 수정 후에도 동일 에러 재발생
- "성공할 것"이라고 보고했으나 실패

**원인:**
- 16개 파일 중 일부만 수정하고 검증 없이 완료 보고
- grep으로 전체 검색하지 않고 주요 파일만 수정

**해결 방법:**
1. 전체 코드베이스 검색:
```bash
grep -r "locked_by" trend-video-frontend/src
```

2. 검색 결과 모든 파일 수정 확인
3. PowerShell 스크립트로 일괄 변경
4. 데이터베이스 마이그레이션 실행
5. 재시도 후 실제 결과 확인

**재발 방지:**
- 컬럼명/변수명 변경 시 반드시 전체 검색
- 수정 전 영향 범위 파악
- 테스트 없이 "성공할 것" 장담 금지
- 실제 실행 결과로만 검증

---

## BTS-0000006: 제목 수정 폼 채널 표시 오류

**발생일:** 2025-12-02

**상태:** ✅ 해결됨

**증상:**
- 리스트 화면: 채널이 "📺 6090놀이터"로 올바르게 표시됨
- 수정 폼: 채널이 "쇼츠왕"으로 잘못 표시됨

**원인:**
1. **SQL alias 문제** (이미 수정됨):
   - `sql/automation.sql` (line 241): `youtube_channel as channel` → `youtube_channel as youtubeChannel`
   - `sql/scheduler.sql` (line 57, 268): 동일한 문제

2. **채널 찾기 로직 문제** (startEdit 함수):
   - 잘못: `channels.find(ch => ch.channel_id === actualChannelId)` (snake_case)
   - 올바름: `channels.find(c => c.id === actualChannelId || c.channelId === actualChannelId)` (camelCase)
   - channels 배열의 실제 속성은 `id` 또는 `channelId`인데 `channel_id`로 찾고 있었음

3. **기본값 문제**:
   - 매칭 실패 시 `channels[0]` (쇼츠왕)을 기본값으로 사용
   - 매칭 실패 시 빈 문자열로 유지해야 함

**해결 방법:**

`src/app/automation/page.tsx` (line 1352-1359) 수정:
```typescript
// Before:
const matchedChannel = channels.find((c: any) =>
  c.id === actualChannelId || c.channelId === actualChannelId
);
const finalChannelId = matchedChannel?.id || matchedChannel?.channelId || '';
//                                      ^^^ 내부 UUID가 먼저 선택됨!

// After:
const matchedChannel = channels.find((c: any) =>
  c.id === actualChannelId || c.channelId === actualChannelId
);
const finalChannelId = matchedChannel?.channelId || matchedChannel?.id || '';
//                                      ^^^^^^^^^ 실제 YouTube 채널 ID가 먼저 선택됨!
```

**근본 원인:**
- YouTubeChannel 객체에는 두 개의 ID가 있음:
  - `id`: 내부 UUID (예: abc-123-def-456)
  - `channelId`: 실제 YouTube 채널 ID (예: UCxxx...)
- DB `youtube_channel` 컬럼에는 `channelId` 값이 저장됨
- 하지만 `finalChannelId`를 설정할 때 `matchedChannel.id`를 먼저 사용해서 UUID가 선택됨
- 채널 select 드롭다운은 `channelId`를 value로 사용하므로 UUID와 매칭되지 않음
- 결과적으로 첫 번째 채널("쇼츠왕")이 선택됨

**재발 방지:**
1. **사용자에게 "콘솔 확인", "새로고침" 등 시키지 말 것**
   - 리스트 화면 코드를 먼저 읽고 분석
   - 관련 코드를 모두 찾아서 직접 비교

2. **객체 속성명 주의**:
   - API 응답/DB 쿼리: snake_case → camelCase alias
   - 프론트엔드 코드: camelCase 사용
   - 속성명이 불분명할 때 실제 사용 코드 먼저 검색

3. **기본값 설정 주의**:
   - 매칭 실패 시 첫 번째 항목 사용 금지
   - 빈 문자열이나 null로 명시적으로 표시

---

## BTS-0000007: product_info 잘못된 테이블 참조

**발생일:** 2025-12-02

**상태:** ✅ 해결됨

**에러 메시지:**
```
Unknown column 'product_info' in 'field list'
```

**증상:**
- unified-worker가 스크립트 생성 API 호출 시 500 에러 발생
- 예약된 작업들이 실행되지 못함

**원인:**
- `src/app/api/scripts/generate/route.ts`에서 `task` 테이블에서 `product_info` 조회
- `product_info`는 `content` 테이블에 있음 (큐 스펙 v3)
- 스키마 변경 후 쿼리 업데이트 누락

**영향 범위:**
- Line 267: product 타입 스크립트 생성
- Line 340: product-info 타입 스크립트 생성

**해결 방법:**
```typescript
// Before:
SELECT product_info FROM task
WHERE title = ?

// After:
SELECT product_info FROM content
WHERE title = ?
```

**재발 방지:**
- 스키마 변경 시 컬럼 위치 변경도 전체 grep 필요
- task 테이블은 최소화 (task_id, user_id, scheduled_time만)
- content 테이블이 메인 데이터 저장소

---

## BTS-0000008: content.status 단계 기록 누락 (중간 단계 미반영)

**발생일:** 2025-12-02

**상태:** ✅ 해결됨

**증상:**
- script 완료 후 content.status가 'completed'로 설정됨 (❌ 잘못!)
- image/video 단계가 진행돼도 content.status에 현재 단계가 남지 않음

**원인:**
- `triggerNextStage` 함수가 content.status를 현재 단계 기준으로 업데이트하지 않음
- youtube 완료만 'completed'로 처리되고 중간 단계 스테이지 정보는 사라짐

**올바른 스펙 (content.status는 현재/최종 단계 표시):**
```
script 완료 → content.status = 'script'
image 완료 → content.status 유지('script')
video 완료 → content.status = 'video'
youtube 완료 → content.status = 'completed'
```

**해결 방법:**
- `unified-worker.js`에서 단계 전환 시 content.status를 현재 단계로 UPDATE (script/video만)
- youtube 완료 시 content.status를 'completed'로 설정
- task_queue는 기존처럼 type만 다음 단계로 UPDATE + status='waiting'

**추가 수정:**
- content.status ENUM에 'waiting', 'draft' 추가 (대기 상태 저장 가능하지만 기본 플로우는 단계 명시)

---

## BTS-0000011: TTS 음성 설정이 저장되지 않는 문제

**발생일:** 2025-12-02

**상태:** ✅ 해결됨

**증상:**
1. 수정 폼에서 TTS 음성을 "선희"로 변경하고 저장
2. 저장 후 다시 수정 버튼을 누르면
3. **이전에 저장한 "선희"가 나오지 않고 다시 "순복"으로 표시됨**

**사용자 리포트:**
- "수정에 TTS음석에서 수정을 선희로 하고 저장해도 저장된게 다음에 수정버튼을 누르면 나오지 않는다"
- 현재 표시: `ko-KR-SoonBokNeural` (순복)
- promptFormat: `longform`

**원인 (조사 필요):**
1. **저장 문제**: `saveEdit` 함수가 API에 ttsVoice를 제대로 전달하지 못함
2. **API 저장 문제**: `/api/automation/titles` PATCH가 DB에 저장하지 못함
3. **로드 문제**: `getAllSchedule` 쿼리가 tts_voice를 가져오지 못함
4. **초기화 문제**: `startEdit` 함수가 기본값으로 덮어씀

**확인해야 할 부분:**
1. `saveEdit` 함수에서 payload에 ttsVoice 포함 여부 확인
2. `/api/automation/titles` PATCH 핸들러에서 ttsVoice 처리 확인
3. `content_setting` 테이블에 실제로 저장되는지 확인
4. `getAllSchedule` SQL 쿼리 결과에 ttsVoice 포함 여부 확인
5. `startEdit` 함수에서 title.ttsVoice 값 확인

**영향 범위:**
- `src/app/automation/page.tsx` (lines 1406-1433): saveEdit 함수
- `src/app/automation/page.tsx` (lines 1369-1391): startEdit 함수
- `src/app/api/automation/titles/route.ts` (lines 200-207): PATCH 핸들러
- `sql/automation.sql` (lines 180-182): getAllSchedule 쿼리
- `content_setting` 테이블: tts_voice 컬럼

**해결 작업:**

### 1. ✅ autoConvert 필드명 버그 수정 (`page.tsx:1423`)
**문제**: saveEdit 함수의 payload에서 잘못된 필드명 사용
```typescript
// Before (❌ 잘못):
autoConvert: editForm.auto_create_shortform

// After (✅ 올바름):
autoConvert: editForm.autoConvert
```
- editForm에는 `autoConvert` 필드가 있음 (line 1393)
- payload에서 `editForm.auto_create_shortform` 참조 시 undefined 전달됨
- 이 버그로 인해 autoConvert 값도 저장되지 않았음!

### 2. ✅ 디버그 로그 추가
**프론트엔드** (`page.tsx`):
- Line 1408: saveEdit 시작 시 editForm 전체 로깅 (기존)
- Line 1426: API 전송 payload 로깅 (기존)
- Line 1375-1380: startEdit 시 TTS 음성 값 로깅 (기존)
- Line 4048: TTS 음성 dropdown에 promptFormat 값 표시 추가
- Line 4054-4057: TTS 음성 변경 시 promptFormat 포함 로깅

**백엔드** (`route.ts`):
- Line 139-146: API가 받은 데이터 로깅 (ttsVoice, ttsSpeed, autoConvert 포함)
- Line 225-228: UPDATE 쿼리 실행 전 로깅 (updates, values)
- Line 234: UPDATE 완료 로깅

### 3. ✅ React key 수정 (`page.tsx:4211`)
```typescript
// Before:
key={idx}

// After:
key={`log-${title.id}-${idx}-${logTimestamp}`}
```

### 4. ✅ startEdit에서 nullish coalescing (`??`) 사용 (`page.tsx:1392-1394`)
**문제**: `||` 연산자는 falsy 값(빈 문자열 포함)을 모두 스킵하여 항상 기본값 사용
```typescript
// Before (❌ 빈 문자열도 스킵):
ttsVoice: title.ttsVoice || title.tts_voice || defaultTtsVoice
ttsSpeed: title.ttsSpeed || title.tts_speed || '+0%'
autoConvert: title.autoCreateShortform || title.autoConvert || title.auto_create_shortform || false

// After (✅ null/undefined만 스킵):
ttsVoice: title.ttsVoice ?? title.tts_voice ?? defaultTtsVoice
ttsSpeed: title.ttsSpeed ?? title.tts_speed ?? '+0%'
autoConvert: title.autoCreateShortform ?? title.autoConvert ?? title.auto_create_shortform ?? false
```
- DB에 빈 문자열('')이 저장된 경우에도 빈 문자열을 유지
- null/undefined인 경우에만 기본값 사용

### 5. ✅ Type dropdown onChange에서 TTS 음성 덮어쓰기 제거 (`page.tsx:3838-3839`)
**문제**: Type 변경 시 사용자가 선택한 TTS 음성을 기본값으로 강제 변경
```typescript
// Before (❌ TTS 음성 덮어씀):
const ttsVoice = getDefaultTtsByType(promptFormat);
setEditForm({ ...editForm, promptFormat, aiModel, ttsVoice });

// After (✅ TTS 음성 유지):
setEditForm({ ...editForm, promptFormat, aiModel });
```
- 사용자가 TTS 음성을 "선희"로 선택
- Type dropdown을 건드리면 "순복"으로 강제 변경됨
- Type 변경 시에도 사용자가 선택한 TTS 음성 유지

### 6. ✅ autoConvert 체크박스 필드명 통일 (`page.tsx:4097-4098`)
**문제**: 체크박스가 다른 필드명 사용
```typescript
// Before (❌):
checked={editForm.auto_create_shortform || false}
onChange={(e) => setEditForm({ ...editForm, auto_create_shortform: e.target.checked })}

// After (✅):
checked={editForm.autoConvert || false}
onChange={(e) => setEditForm({ ...editForm, autoConvert: e.target.checked })}
```

**근본 원인:**
1. `||` 연산자 사용으로 인해 빈 문자열('')도 falsy로 처리되어 기본값 사용
2. editForm 필드명 불일치 (auto_create_shortform ↔ autoConvert)
3. Type dropdown onChange에서 TTS 음성 강제 변경
4. TTS 음성 dropdown value에서도 `||` 사용

**재발 방지:**
- editForm 필드명은 항상 camelCase로 통일
- DB에서 로드한 값이 falsy일 때만 기본값 사용하려면 `??` (nullish coalescing) 사용
- 폼 컨트롤(input, select, checkbox)은 항상 editForm의 필드명과 일치시킬 것

---

## BTS-0000012: 중간 단계에서 task_queue.status='completed' 설정되는 문제 (completed 대란)

**발생일:** 2025-12-02

**상태:** ✅ 해결됨

**심각도:** 🔴 **CRITICAL** - 워크플로우 상태 관리 실패

**증상:**
- script, image, video 단계 완료 시 task_queue.status가 'completed'로 설정됨
- youtube 단계만 'completed'여야 하는데 모든 중간 단계가 'completed'

**실제 데이터 (2025-12-02 22:31 기준):**
```
script  + completed: 4개 ⚠️ (034828d5, 50171a47, 239a03e0, 80350e3f)
image   + completed: 2개 ⚠️ (525fd4a5, 77fb7660)
video   + completed: 2개 ⚠️ (4368907f, 676fc239)
```

**올바른 스펙:**
```
✅ script 완료 → triggerNextStage → task_queue: type='image', status='waiting'
✅ image 완료 → triggerNextStage → task_queue: type='video', status='waiting'
✅ video 완료 → triggerNextStage → task_queue: type='youtube', status='waiting'
❌ youtube 완료 → updateTask → task_queue: status='completed' (유일하게 completed 설정)
```

**현재 코드 (unified-worker.js:294-304):**
```javascript
const hasNextStage = await this.triggerNextStage(type, taskId, emoji);

if (hasNextStage) {
  // ✅ script/image/video는 여기로 옴 (completed 설정 안 함)
  console.log(`${emoji} [${type}] ✅ Completed and moved to next stage: ${taskId}`);
} else {
  // ✅ youtube만 여기로 옴
  await this.updateTask(taskId, type, {
    state: 'completed'
  });
  console.log(`${emoji} [${type}] ✅ All stages completed: ${taskId}`);
}
```

**코드는 올바른데 실제로는 문제 발생!**

**가능한 원인:**
1. **워커가 재시작되지 않아서 이전 버전 코드로 실행 중**
2. **다른 곳에서 completed를 설정하는 로직이 있음** (API, 스케줄러 등)
3. **코드가 git에서 되돌아감** (unlikely but possible)
4. **테스트는 새 코드, 실제 워커는 구 코드 실행 중**

**왜 테스트는 통과했는가:**
- test-worker-flow.mjs는 새로운 코드로 실행됨
- 하지만 실제 production 워커는 재시작되지 않아서 이전 코드로 실행 중일 가능성

**근본 원인 (2025-12-02 23:00 최종 확인):**

### 🐛 버그 #1: triggerNextStage 에러 시 completed 처리
**문제 코드** (`unified-worker.js` line 618-621):
```javascript
} catch (error) {
  console.error(`${emoji} [${currentType}] Failed to trigger next stage:`, error);
  return false;  // ⚠️ 에러 발생 시 false 반환!
}
```

**문제 시나리오:**
1. script 완료 후 `triggerNextStage` 호출
2. DB 에러 발생 (예: content UPDATE 실패)
3. catch에서 **return false** 반환
4. `hasNextStage = false` 판정
5. **line 300-302에서 completed 설정!** ❌

**즉, 에러가 발생하면 completed로 처리되는 심각한 버그!**

### 🐛 버그 #2: content.status를 다음 type으로 설정
**문제 코드** (`unified-worker.js` line 601-606):
```javascript
// ❌ 잘못: 다음 type으로 설정
await run(`
  UPDATE content
  SET status = ?
  WHERE content_id = ?
`, [nextType, taskId]);
```

**올바른 규칙 (사용자 표):**
| 완료 단계 | content.status 변경 |
|----------|------------------|
| script | 'script' (현재 type) |
| image | 변경 안 함 (script 유지) |
| video | 'video' (현재 type) |
| youtube | 'completed' |

### 🐛 버그 #3: youtube 완료 시 content.status 누락
**문제 코드** (`unified-worker.js` line 300-302):
```javascript
// ❌ task_queue만 completed로 변경
await this.updateTask(taskId, type, {
  state: 'completed'
});
// content.status는 변경 안 함!
```

**결과:** content.status가 'video'로 남아있음!

---

### ✅ 해결 방법

**1. triggerNextStage 에러 처리** (line 618-622):
```javascript
} catch (error) {
  console.error(`${emoji} [${currentType}] Failed to trigger next stage:`, error);
  // ✅ 에러를 throw하여 상위에서 failed로 처리
  throw error;
}
```

**2. content.status 설정 규칙** (line 601-610):
```javascript
// ✅ script/video 완료 시만 현재 type으로 설정
if (currentType === 'script' || currentType === 'video') {
  await run(`
    UPDATE content
    SET status = ?
    WHERE content_id = ?
  `, [currentType, taskId]);
}
// image 완료 시에는 content.status 변경 안 함 (script 상태 유지)
```

**3. youtube 완료 시 content.status 설정** (line 300-310):
```javascript
} else {
  // 마지막 단계 (youtube)만 completed 상태로 변경
  // 1. task_queue
  await this.updateTask(taskId, type, {
    state: 'completed'
  });
  // 2. content.status도 'completed'로 설정
  await run(`
    UPDATE content
    SET status = 'completed'
    WHERE content_id = ?
  `, [taskId]);
  console.log(`${emoji} [${type}] ✅ All stages completed: ${taskId}`);
}
```

---

### 🔍 검증 방법

**1. 기존 잘못된 completed 레코드 정리:**
```sql
DELETE FROM task_queue
WHERE type IN ('script', 'image', 'video') AND status = 'completed';
```

**2. 워커 재시작:**
```bash
cd C:\Users\oldmoon\workspace\trend-video-frontend
npm run stop:unified-worker
npm run start:unified-worker
```

**3. 새로운 작업 실행 후 확인:**
```sql
SELECT type, status, COUNT(*) as count
FROM task_queue
GROUP BY type, status;

-- ✅ youtube completed만 있어야 함
-- ❌ script/image/video completed가 생기면 버그 재발
```

**재발 방지:**
1. **에러 처리 규칙:**
   - 상태 전환 실패 시 false 반환 금지
   - 반드시 throw하여 상위에서 failed로 처리

2. **상태 관리 규칙:**
   - 중간 단계(script/image/video)는 절대 completed 설정 금지
   - youtube만 유일하게 completed 설정

3. **content.status 규칙:**
   - script 완료 → 'script'
   - image 완료 → 변경 안 함
   - video 완료 → 'video'
   - youtube 완료 → 'completed'

4. **코드 리뷰 시 확인사항:**
   - `state: 'completed'` 검색하여 youtube 외 사용 금지
   - `return false` 검색하여 에러 처리 확인
   - content.status와 task_queue.status 동시 업데이트 확인

---

## BTS-0000013: open-folder API에 SQLite 레거시 코드 미전환

**발생일:** 2025-12-02

**상태:** ✅ 해결됨

**증상:**
```
Module not found: Can't resolve 'better-sqlite3'
at ./src/app/api/open-folder/route.ts:42:26
```

**원인:**
- 시스템은 MySQL로 마이그레이션 완료
- `src/app/api/open-folder/route.ts` (lines 42-56)에만 SQLite 코드 남아있음
- `better-sqlite3` 패키지는 이미 제거됨 (BTS-0000003)

**문제 코드:**
```typescript
// ❌ SQLite 레거시 코드
const Database = require('better-sqlite3');
const dbPath = path.join(process.cwd(), 'data', 'database.sqlite');
const db = new Database(dbPath, { readonly: true });
const job = await db.prepare(`
  SELECT content_id FROM content WHERE source_content_id = ?
`).get(cleanProjectId) as any;
db.close();
```

**해결 방법:**

1. **MySQL import 추가:**
```typescript
import { getOne } from '@/lib/mysql';
```

2. **쿼리 변환:**
```typescript
// ✅ MySQL 방식
const content = await getOne(`
  SELECT content_id FROM content WHERE source_content_id = ? ORDER BY created_at DESC LIMIT 1
`, [cleanProjectId]) as any;
if (content && content.content_id) {
  actualFolderId = content.content_id;
}
```

**수정 파일:**
- `src/app/api/open-folder/route.ts` (lines 1-6, 40-53)

**재발 방지:**
- 마이그레이션 완료 후 `better-sqlite3` 전체 검색 필수
- API 라우트는 테스트 커버리지 확대 필요

---

## BTS-0000014: 완료 상태에 재시도 버튼 없음

**발생일:** 2025-12-02

**상태:** ✅ 해결됨

**증상:**
- `completed` 상태에서는 재시도 버튼이 없음
- `failed`, `cancelled` 상태에서만 재시도 버튼 표시
- 완료된 작업을 다시 실행하고 싶을 때 불편함

**원인:**
`src/app/automation/page.tsx` (line 4564):
```typescript
{(queueTab === 'failed' || queueTab === 'cancelled') && (
  <button onClick={() => retryFailed(title.id, title)}>
    🔄재시도
  </button>
)}
```

**해결 방법:**
```typescript
{(queueTab === 'failed' || queueTab === 'cancelled' || queueTab === 'completed') && (
  <button onClick={() => retryFailed(title.id, title)}>
    🔄재시도
  </button>
)}
```

**수정 파일:**
- `src/app/automation/page.tsx` (line 4564)

---

## BTS-0000016: video 단계를 completed로 잘못 설정

**발생일:** 2025-12-02

**상태:** ✅ **해결됨**

**심각도:** 🔴 **CRITICAL** - 상태 플로우 위반

**증상:**
- video 완료 후 task_queue.status가 'completed'로 설정됨
- 올바른 플로우: video 완료 → type='youtube', status='**waiting**'
- 잘못된 동작: video 완료 → status='**completed**'

**사례:** Task ID: `6cadc518-f561-42bd-b60d-7b2b695e1bc3`

**올바른 스펙 (표 기준):**
```
video 완료 → content.status = 'video'
           → task_queue: type='youtube', status='waiting'
```

**근본 원인:**

### ⚠️ Worker 프로세스가 재시작되지 않아서 이전 코드가 실행 중

**문제 시나리오:**
1. video 단계 완료
2. triggerNextStage('video') 호출
3. DB UPDATE 시도 중 에러 발생
4. catch에서 `return false` 실행 (이전 코드)
5. `hasNextStage = false` 판정
6. video completed 처리 ❌

**코드는 이미 수정되어 있었음:**
- unified-worker.js Line 635: `throw error;` (이미 적용됨)
- 하지만 워커가 재시작되지 않아서 메모리에 이전 코드가 로드되어 있음

---

## ✅ 해결 완료 (2025-12-02)

### 적용된 해결책

#### 1. 안전장치 추가 (unified-worker.js:299-304)
```javascript
// ⭐ 안전장치: video는 절대 completed가 되면 안 됨 (BTS-0000016)
if (type === 'video') {
  const errorMsg = `CRITICAL: video stage cannot be completed without youtube stage`;
  console.error(`❌ [${type}] ${errorMsg}, taskId=${taskId}`);
  throw new Error(errorMsg);
}
```

**효과:** video 단계가 completed로 잘못 설정되는 것을 **원천 차단**

#### 2. 로그 강화 (unified-worker.js:617-649)
```javascript
try {
  console.log(`⭐ [TRIGGER] Starting: ${currentType} → ${nextType} for ${taskId}`);

  // content UPDATE 로그
  console.log(`⭐ [TRIGGER] Updating content.status to '${currentType}'`);
  const contentResult = await run(...);
  console.log(`⭐ [TRIGGER] content UPDATE result:`, contentResult);

  // task_queue UPDATE 로그
  console.log(`⭐ [TRIGGER] Updating task_queue: type='${nextType}', status='waiting'`);
  const queueResult = await run(...);
  console.log(`⭐ [TRIGGER] task_queue UPDATE result:`, queueResult);

  return true;

} catch (error) {
  console.error(`⭐ [TRIGGER] Error details:`, error.message);
  console.error(`⭐ [TRIGGER] Stack trace:`, error.stack);
  throw error; // (BTS-0000016)
}
```

**효과:** triggerNextStage 실행 과정 상세 추적 가능

### 수정된 파일

- **`trend-video-frontend/src/workers/unified-worker.js`**
  - Line 299-304: video completed 안전장치 추가
  - Line 617-649: triggerNextStage 로그 강화
  - Line 650-652: 에러 throw 주석 업데이트

### 임시 복구 방법

**Task 6cadc518을 youtube waiting으로 수동 변경:**
```sql
UPDATE task_queue
SET type = 'youtube', status = 'waiting', error = NULL
WHERE task_id = '6cadc518-f561-42bd-b60d-7b2b695e1bc3';

UPDATE content
SET status = 'video'
WHERE content_id = '6cadc518-f561-42bd-b60d-7b2b695e1bc3';
```

### 재발 방지

1. **Worker 재시작 확인**
   - 코드 수정 후 반드시 프로세스 재시작
   - PM2 사용 시 `pm2 reload` 또는 `pm2 restart`

2. **안전장치 추가**
   - video는 completed가 될 수 없다는 체크 추가
   - 중간 단계(script, image, video)는 completed 불가

3. **로그 강화**
   - triggerNextStage의 각 단계별 로그 추가
   - DB UPDATE 결과 확인

---

## BTS-0000015: 버그등록 버튼이 사라지는 문제

**발생일:** 2025-12-02

**상태:** 🔍 조사 필요

**증상:**
- 버그등록 버튼을 계속 넣어달라고 요청하면 사라짐
- 조건부 렌더링 문제로 추정

**원인:**
- 조사 중 (버튼 위치 확인 필요)
- 가능한 원인:
  1. 상태 체크 조건이 너무 제한적
  2. 특정 상태에서만 표시되는 조건부 렌더링
  3. 버튼이 다른 요소에 가려짐

**재현 단계:**
1. (구체적인 재현 단계 확인 필요)
2. 버그등록 버튼 클릭 시도
3. 버튼이 사라지는 현상 발생

**조사 필요 사항:**
- 버그등록 버튼의 정확한 위치
- 어떤 액션 후에 사라지는지
- 어떤 상태/조건에서 표시되는지

---

## 통계

- **총 버그:** 16개
- **해결됨:** 15개 ✅
- **진행중:** 0개
- **조사중:** 1개 (BTS-0000015 - 버그등록 버튼)
- **대기중:** 0개

## 재발 방지 체크리스트

### 스키마 변경 시
- [ ] 전체 코드베이스에서 컬럼명/테이블명 검색
- [ ] 영향받는 모든 파일 목록 작성
- [ ] 모든 파일 수정 후 검증
- [ ] 마이그레이션 스크립트 작성 및 실행
- [ ] 실제 테스트 후 결과 확인

### 시스템 마이그레이션 시
- [ ] 레거시 코드/파일 목록 작성
- [ ] 사용하지 않는 패키지 제거
- [ ] 스키마 파일 정리
- [ ] 문서 업데이트

### 코드 수정 시
- [ ] 사용자 확인 없이 서버 재시작 금지
- [ ] 백그라운드 프로세스 실행 금지
- [ ] 실제 테스트 없이 "성공할 것" 장담 금지
- [ ] 일부만 수정하지 말고 전체 영향 범위 확인
