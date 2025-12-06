const fs = require('fs');
const path = require('path');

const schedulerPath = path.join(__dirname, '..', 'src', 'lib', 'automation-scheduler.ts');
let content = fs.readFileSync(schedulerPath, 'utf-8');

let changes = 0;

// 1. 미디어 발견 로그 추가
const old1 = `if (hasUploadedImages || hasUploadedVideos) {
        console.log(\`[Scheduler] Found \${imageFiles.length} image(s) and \${videoFiles.length} video(s) in \${scriptFolderPath}\`);
      }`;

const new1 = `if (hasUploadedImages || hasUploadedVideos) {
        console.log(\`[Scheduler] Found \${imageFiles.length} image(s) and \${videoFiles.length} video(s) in \${scriptFolderPath}\`);
        addTitleLog(titleId, 'info', \`📁 미디어 발견: 이미지 \${imageFiles.length}개, 비디오 \${videoFiles.length}개\`);
      }`;

if (content.includes(old1) && !content.includes('미디어 발견:')) {
  content = content.replace(old1, new1);
  changes++;
  console.log('✅ 1. 미디어 발견 로그 추가');
}

// 2. 영상 렌더링 대기 로그
const old2 = `// 작업 완료 대기 (최대 30분)
      const maxWaitTime = 30 * 60 * 1000; // 30분`;

const new2 = `// 작업 완료 대기 (최대 30분)
      addTitleLog(schedule.title_id, 'info', \`⏳ 영상 렌더링 대기 중... (최대 30분)\`);
      const maxWaitTime = 30 * 60 * 1000; // 30분`;

if (content.includes(old2) && !content.includes('영상 렌더링 대기 중')) {
  content = content.replace(old2, new2);
  changes++;
  console.log('✅ 2. 영상 렌더링 대기 로그 추가');
}

if (changes > 0) {
  fs.writeFileSync(schedulerPath, content);
  console.log(`\n🎉 총 ${changes}개 로그 개선 완료!`);
} else {
  console.log('\n⚠️ 변경사항 없음');
}
