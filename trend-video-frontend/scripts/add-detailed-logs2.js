const fs = require('fs');
const path = require('path');

const schedulerPath = path.join(__dirname, '..', 'src', 'lib', 'automation-scheduler.ts');
let content = fs.readFileSync(schedulerPath, 'utf-8');

let changes = 0;

// 1. 작업 완료 대기 로그 추가
const old1 = `// 작업 완료 대기 (최대 30분)
      const maxWaitTime = 30 * 60 * 1000; // 30분`;
const new1 = `// 작업 완료 대기 (최대 30분)
      addTitleLog(schedule.title_id, 'info', \`⏳ 영상 렌더링 대기 중... (최대 30분)\`);
      const maxWaitTime = 30 * 60 * 1000; // 30분`;

if (content.includes(old1) && !content.includes('영상 렌더링 대기 중')) {
  content = content.replace(old1, new1);
  changes++;
  console.log('✅ 1. 작업 완료 대기 로그 추가');
}

// 2. 영상 생성 시작 후 미디어 모드 로그
const old2 = `addTitleLog(titleId, 'info', \`🎬 영상 생성 시작...\`);
    addTitleLog(titleId, 'info', \`🎥 영상 생성 API 호출 중...\`);`;

// 이미 추가된 것 확인
if (!content.includes('미디어 모드:')) {
  const pattern = /addTitleLog\(titleId, 'info', `🎬 영상 생성 시작\.\.\.`\);/;
  const match = content.match(pattern);
  if (match) {
    const replacement = match[0] + `\n    addTitleLog(titleId, 'info', \`⚙️ 미디어 모드: \${mediaMode}\`);`;
    content = content.replace(pattern, replacement);
    changes++;
    console.log('✅ 2. 미디어 모드 로그 추가');
  }
}

// 3. 이미지/비디오 발견 로그 - 더 유연한 패턴
if (!content.includes('미디어 발견:')) {
  const foundLog = content.indexOf('Found ${imageFiles.length} image(s) and ${videoFiles.length} video(s)');
  if (foundLog === -1) {
    // 리터럴 백틱 찾기
    const pattern = /console\.log\(`\[Scheduler\] Found \$\{imageFiles\.length\} image\(s\) and \$\{videoFiles\.length\} video\(s\) in \$\{scriptFolderPath\}`\);(\s*)\}/;
    const match = content.match(pattern);
    if (match) {
      const replacement = `console.log(\`[Scheduler] Found \${imageFiles.length} image(s) and \${videoFiles.length} video(s) in \${scriptFolderPath}\`);
        addTitleLog(titleId, 'info', \`📁 미디어 발견: 이미지 \${imageFiles.length}개, 비디오 \${videoFiles.length}개\`);${match[1]}}`;
      content = content.replace(pattern, replacement);
      changes++;
      console.log('✅ 3. 미디어 발견 로그 추가');
    }
  }
}

if (changes > 0) {
  fs.writeFileSync(schedulerPath, content);
  console.log(`\n🎉 총 ${changes}개 로그 개선 완료!`);
} else {
  console.log('\n⚠️ 변경사항 없음 (이미 적용되었거나 패턴이 다름)');
}
