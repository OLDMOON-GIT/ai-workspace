# Whisk 이미지 크롤링 자동 실행 수정 내역

## 문제점
자동화에서 "업로드대기" 상태일 때 Whisk 이미지 크롤링이 자동으로 실행되지 않는 문제

## 원인 분석
1. `automation-scheduler.ts`에서 `waiting_for_upload` 상태 설정 시 이미지 크롤링 작업을 큐에 등록
2. 하지만 이미지 워커 프로세스가 실행되지 않아 큐에 있는 작업이 처리되지 않음
3. 기존 `start-with-check.js`에서 이미지 워커를 시작하지만 `stdio: 'ignore'`로 로그가 보이지 않음

## 해결 방법

### 1. 이미지 워커 로그 파일 저장 (`start-with-check.js`)
```javascript
// 이미지 워커 로그를 파일로 저장
const imageWorkerLogPath = path.join(logsDir, 'image-worker.log');
const imageWorkerLogStream = fs.createWriteStream(imageWorkerLogPath, { flags: 'a' });

const imageWorker = spawn('node', [imageWorkerPath], {
  cwd: __dirname,
  detached: true,
  stdio: ['ignore', imageWorkerLogStream, imageWorkerLogStream],
  shell: true
});
```

### 2. 스케줄러에서 이미지 워커 자동 시작 (`automation-scheduler.ts`)
```typescript
// 이미지 워커가 실행 중인지 확인하고 필요시 시작
async function ensureImageWorkerRunning() {
  // 큐에 대기 중인 이미지 작업 확인
  // 작업이 있으면 이미지 워커 프로세스 시작
  // 로그는 logs/image-worker-auto.log에 저장
}
```

### 3. 모니터링 스크립트 (`monitor-image-worker.js`)
- 30초마다 이미지 워커 상태 확인
- 큐에 대기 중인 작업이 있으면 자동으로 워커 시작
- 워커가 비정상 종료시 자동 재시작

### 4. 테스트 스크립트 (`test-image-worker.js`)
- 이미지 워커를 포그라운드에서 실행하여 로그 확인 가능

## 사용 방법

### 기본 사용 (자동 시작)
```bash
npm run dev
# 이미지 워커가 자동으로 시작되며 로그는 logs/image-worker.log에 저장
```

### 수동 테스트
```bash
# 이미지 워커 직접 실행 (콘솔에 로그 출력)
node test-image-worker.js

# 모니터링과 함께 실행
node monitor-image-worker.js
```

### 큐 상태 확인
```bash
# 대기 중인 이미지 작업 확인
sqlite3 data/queue.sqlite "SELECT task_id, type, status, created_at FROM tasks_queue WHERE type='image'"
```

### 로그 확인
```bash
# 이미지 워커 로그
tail -f logs/image-worker.log
tail -f logs/image-worker-auto.log

# 모니터 로그
tail -f logs/monitor.log
```

## 동작 프로세스

1. **자동화 스케줄 실행**
   - 대본 생성 완료 후 `waiting_for_upload` 상태 설정
   - `mediaMode === 'crawl'`인 경우 이미지 작업을 큐에 등록

2. **이미지 워커 자동 시작**
   - 스케줄러가 5분마다 큐 상태 확인
   - 대기 중인 이미지 작업이 있으면 워커 프로세스 시작

3. **이미지 크롤링 실행**
   - 워커가 큐에서 작업을 가져와 처리
   - Python 스크립트 `image_crawler_enhanced.py` 실행
   - 완료 후 자동으로 영상 생성 단계로 진행

## 주요 파일

- `/src/lib/automation-scheduler.ts` - 스케줄러에 이미지 워커 관리 기능 추가
- `/start-with-check.js` - 이미지 워커 로그 파일 저장 설정
- `/monitor-image-worker.js` - 이미지 워커 모니터링 스크립트
- `/test-image-worker.js` - 이미지 워커 테스트 스크립트
- `/src/workers/image-worker.ts` - 이미지 워커 구현

## 현재 대기 중인 작업
```
title_1763882009829_m4ruowe883l - 2025-11-23T07:21:19.707Z
title_1763874608712_fn1dkoqeth - 2025-11-23T05:11:36.357Z
title_1763872953664_43qpvtkp233 - 2025-11-23T04:50:02.960Z
```

이 작업들은 이미지 워커가 시작되면 자동으로 처리됩니다.