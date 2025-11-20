/**
 * 기존 프로젝트의 자막 파일 검증
 * scene_01에 .ass 파일이 있는지 빠르게 확인
 */

const fs = require('fs');
const path = require('path');

const projectDir = 'C:\\Users\\oldmoon\\workspace\\trend-video-backend\\input\\project_98bd3b57-f17b-421f-bb0e-2c6e612bb1e6\\generated_videos';

console.log('🔍 자막 파일 검증\n');
console.log('='.repeat(60));
console.log(`프로젝트: ${projectDir}\n`);

// 모든 scene 파일 확인
const files = fs.readdirSync(projectDir);
const sceneNumbers = [];

files.forEach(file => {
  const match = file.match(/scene_(\d+)\.mp4/);
  if (match) {
    sceneNumbers.push(parseInt(match[1]));
  }
});

sceneNumbers.sort((a, b) => a - b);

console.log(`발견된 씬: ${sceneNumbers.length}개\n`);

let allPass = true;

sceneNumbers.forEach(num => {
  const sceneNum = num.toString().padStart(2, '0');
  const assFile = path.join(projectDir, `scene_${sceneNum}_audio.ass`);
  const mp4File = path.join(projectDir, `scene_${sceneNum}.mp4`);
  const mp3File = path.join(projectDir, `scene_${sceneNum}_audio.mp3`);

  const hasAss = fs.existsSync(assFile);
  const hasMp4 = fs.existsSync(mp4File);
  const hasMp3 = fs.existsSync(mp3File);

  const status = hasAss ? '✅' : '❌';
  console.log(`${status} Scene ${sceneNum}:`);
  console.log(`   - MP4: ${hasMp4 ? '있음' : '없음'}`);
  console.log(`   - MP3: ${hasMp3 ? '있음' : '없음'}`);
  console.log(`   - ASS: ${hasAss ? '있음' : '없음'} ${!hasAss ? '← 문제!' : ''}`);

  if (hasAss) {
    // ASS 파일 내용 간단 검증
    const content = fs.readFileSync(assFile, 'utf-8');
    const dialogueCount = (content.match(/Dialogue:/g) || []).length;
    console.log(`   - 자막 라인: ${dialogueCount}개`);
  }

  console.log('');

  if (!hasAss && hasMp3) {
    allPass = false;
  }
});

console.log('='.repeat(60));

if (allPass) {
  console.log('✅ 모든 씬에 .ass 파일이 있습니다!');
  console.log('\n📝 수정 내용:');
  console.log('  - long_form_creator.py에 _save_ass_file() 함수 추가');
  console.log('  - Whisper transcribe 후 자동으로 .ass 파일 저장');
  console.log('  - scene_01부터 모든 씬에 자막 파일 생성됨');
} else {
  console.log('❌ 일부 씬에 .ass 파일이 없습니다.');
  console.log('\n⚠️  새로운 비디오를 생성해야 수정 사항이 적용됩니다.');
  console.log('   기존 프로젝트는 수정 전에 생성된 것입니다.');
}
