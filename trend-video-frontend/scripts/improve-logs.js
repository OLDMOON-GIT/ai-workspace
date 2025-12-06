const fs = require('fs');
const path = require('path');

// ==================== automation-scheduler.ts 개선 ====================
const schedulerPath = path.join(__dirname, '..', 'src', 'lib', 'automation-scheduler.ts');
let scheduler = fs.readFileSync(schedulerPath, 'utf-8');

// 1. 영상 생성 시작 부분에 상세 로그 추가
const old1 = `addTitleLog(titleId, 'info', \`🎬 영상 생성 시작...\`);`;
const new1 = `addTitleLog(titleId, 'info', \`🎬 영상 생성 시작...\`);
    addTitleLog(titleId, 'info', \`⚙️ 미디어 모드: \${mediaMode}\`);`;

if (scheduler.includes(old1) && !scheduler.includes('미디어 모드:')) {
  scheduler = scheduler.replace(old1, new1);
  console.log('✅ 영상 생성 시작 로그 추가');
}

// 2. API 호출 로그 추가 (대본 생성)
const old2 = `console.log(\`📤 [SCHEDULER] Calling /api/scripts/generate?mode=\${scriptMode}...\`);`;
const new2 = `console.log(\`📤 [SCHEDULER] Calling /api/scripts/generate?mode=\${scriptMode}...\`);
    addTitleLog(schedule.title_id, 'info', \`🤖 AI 대본 생성 API 호출 중...\`);`;

if (scheduler.includes(old2) && !scheduler.includes('AI 대본 생성 API')) {
  scheduler = scheduler.replace(old2, new2);
  console.log('✅ API 호출 로그 추가');
}

// 3. 대본 생성 작업 시작 로그
const old3 = `addQueueLog(taskId, 'info', \`대본 생성 작업 시작 (mode: \${scriptMode})\`);`;
const new3 = `addQueueLog(taskId, 'info', \`대본 생성 작업 시작 (mode: \${scriptMode})\`);
      addTitleLog(schedule.title_id, 'info', \`📄 대본 작업 ID: \${taskId.substring(0, 12)}...\`);
      addTitleLog(schedule.title_id, 'info', \`⏳ AI가 대본을 작성 중입니다... (최대 10분)\`);`;

if (scheduler.includes(old3) && !scheduler.includes('대본 작업 ID')) {
  scheduler = scheduler.replace(old3, new3);
  console.log('✅ 대본 작업 ID 로그 추가');
}

// 4. 영상 생성 API 호출 로그
const old4 = `const videoResponse = await fetch(\`http://localhost:\${process.env.PORT || 3000}/api/generate-video\`, {`;
const new4 = `addTitleLog(titleId, 'info', \`🎥 영상 생성 API 호출 중...\`);
    const videoResponse = await fetch(\`http://localhost:\${process.env.PORT || 3000}/api/generate-video\`, {`;

if (scheduler.includes(old4) && !scheduler.includes('영상 생성 API 호출')) {
  scheduler = scheduler.replace(old4, new4);
  console.log('✅ 영상 생성 API 호출 로그 추가');
}

// 5. 유튜브 업로드 로그 상세화
const old5 = `addTitleLog(schedule.title_id, 'info', \`📤 Uploading to YouTube...\`);`;
const new5 = `addTitleLog(schedule.title_id, 'info', \`📤 유튜브 업로드 시작...\`);
    addTitleLog(schedule.title_id, 'info', \`📺 채널: \${schedule.channel_id || '기본 채널'}\`);`;

if (scheduler.includes(old5)) {
  scheduler = scheduler.replace(old5, new5);
  console.log('✅ 유튜브 업로드 로그 추가');
}

fs.writeFileSync(schedulerPath, scheduler);
console.log('\n✅ automation-scheduler.ts 로그 개선 완료!');

// ==================== image-worker.ts 개선 ====================
const workerPath = path.join(__dirname, '..', 'src', 'workers', 'image-worker.ts');
let worker = fs.readFileSync(workerPath, 'utf-8');

// 1. 크롤링 시작 시 더 상세한 정보
const oldW1 = `await this.manager.appendLog(
      taskId, 'image',
      useImageFX ? '🚀 ImageFX + Whisk 자동화 시작' : '🚀 Whisk 자동화 시작'
    );`;
const newW1 = `await this.manager.appendLog(
      taskId, 'image',
      useImageFX ? '🚀 ImageFX + Whisk 자동화 시작' : '🚀 Whisk 자동화 시작'
    );
    addTitleLog(taskId, 'info', \`🌐 Google 이미지 검색 자동화 실행 중...\`);`;

if (worker.includes(oldW1) && !worker.includes('Google 이미지 검색')) {
  worker = worker.replace(oldW1, newW1);
  console.log('✅ Whisk 시작 로그 추가');
}

// 2. 실패 시 상세 로그
const oldW2 = `await this.manager.appendLog(taskId, 'image', \`❌ \${error}\`);`;
const newW2 = `await this.manager.appendLog(taskId, 'image', \`❌ \${error}\`);
        addTitleLog(taskId, 'error', \`⚠️ 크롤링 오류: \${error.substring(0, 100)}\`);`;

if (worker.includes(oldW2) && !worker.includes('크롤링 오류')) {
  worker = worker.replace(oldW2, newW2);
  console.log('✅ 에러 로그 추가');
}

fs.writeFileSync(workerPath, worker);
console.log('✅ image-worker.ts 로그 개선 완료!\n');

console.log('🎉 전체 로그 개선 완료!');
