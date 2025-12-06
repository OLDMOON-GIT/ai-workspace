const fs = require('fs');
const path = require('path');

const schedulerPath = path.join(__dirname, '..', 'src', 'lib', 'automation-scheduler.ts');
let content = fs.readFileSync(schedulerPath, 'utf-8');

let changes = 0;

// 1. start-image-worker 경로 수정 (Turbopack 우회)
const old1 = `const imageWorkerPath = path.join(process.cwd(), 'start-image-worker.js');`;
const new1 = `const imageWorkerPath = require.resolve('../../../start-image-worker');`;

if (content.includes(old1)) {
  content = content.replace(old1, new1);
  changes++;
  console.log('✅ 1. start-image-worker 경로 수정');
}

// 2. 영상 생성 시작 후 미디어 모드 로그 추가
const old2 = `addTitleLog(titleId, 'info', \`🎬 영상 생성 시작...\`);

    // DB에서 대본 조회`;
const new2 = `addTitleLog(titleId, 'info', \`🎬 영상 생성 시작...\`);
    addTitleLog(titleId, 'info', \`⚙️ 미디어 모드: \${mediaMode}\`);

    // DB에서 대본 조회`;

if (content.includes(old2)) {
  content = content.replace(old2, new2);
  changes++;
  console.log('✅ 2. 미디어 모드 로그 추가');
}

// 3. 영상 생성 API 호출 로그 추가
const old3 = `console.log('📤 [SCHEDULER] Calling /api/generate-video-upload...');`;
const new3 = `addTitleLog(titleId, 'info', \`🎥 영상 생성 API 호출 중...\`);
    console.log('📤 [SCHEDULER] Calling /api/generate-video-upload...');`;

if (content.includes(old3) && !content.includes('영상 생성 API 호출 중')) {
  content = content.replace(old3, new3);
  changes++;
  console.log('✅ 3. 영상 생성 API 호출 로그 추가');
}

// 4. 유튜브 업로드 로그 한글화
const old4 = `addTitleLog(schedule.title_id, 'info', \`📤 Uploading to YouTube...\`);`;
const new4 = `addTitleLog(schedule.title_id, 'info', \`📤 유튜브 업로드 시작...\`);
    addTitleLog(schedule.title_id, 'info', \`📺 채널: \${schedule.channel_id || '기본 채널'}\`);`;

if (content.includes(old4)) {
  content = content.replace(old4, new4);
  changes++;
  console.log('✅ 4. 유튜브 업로드 로그 한글화');
}

// 5. 미디어 발견 로그 추가
const old5 = `if (hasUploadedImages || hasUploadedVideos) {
        console.log(\`[Scheduler] Found \${imageFiles.length} image(s) and \${videoFiles.length} video(s) in \${scriptFolderPath}\`);
      }`;
const new5 = `if (hasUploadedImages || hasUploadedVideos) {
        console.log(\`[Scheduler] Found \${imageFiles.length} image(s) and \${videoFiles.length} video(s) in \${scriptFolderPath}\`);
        addTitleLog(titleId, 'info', \`📁 미디어 발견: 이미지 \${imageFiles.length}개, 비디오 \${videoFiles.length}개\`);
      }`;

if (content.includes(old5) && !content.includes('미디어 발견:')) {
  content = content.replace(old5, new5);
  changes++;
  console.log('✅ 5. 미디어 발견 로그 추가');
}

// 6. 영상 렌더링 대기 로그 추가
const old6 = `// 작업 완료 대기 (최대 30분)
      const maxWaitTime = 30 * 60 * 1000; // 30분`;
const new6 = `// 작업 완료 대기 (최대 30분)
      addTitleLog(schedule.title_id, 'info', \`⏳ 영상 렌더링 대기 중... (최대 30분)\`);
      const maxWaitTime = 30 * 60 * 1000; // 30분`;

if (content.includes(old6) && !content.includes('영상 렌더링 대기 중')) {
  content = content.replace(old6, new6);
  changes++;
  console.log('✅ 6. 영상 렌더링 대기 로그 추가');
}

if (changes > 0) {
  fs.writeFileSync(schedulerPath, content, 'utf-8');
  console.log(`\n🎉 총 ${changes}개 변경 완료!`);
} else {
  console.log('\n⚠️ 변경사항 없음');
}
