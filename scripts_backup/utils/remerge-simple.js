/**
 * 기존 병합 로직 그대로 사용해서 다시 병합
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const PROJECT_DIR = 'C:\\Users\\oldmoon\\workspace\\trend-video-backend\\input\\project_197951ed-d849-4c50-97c5-2282bb8e7b56';
const VIDEOS_DIR = path.join(PROJECT_DIR, 'generated_videos');

console.log('\n롱폼 비디오 재병합 (기존 로직 사용)');
console.log('='.repeat(70));

// scene_0 + scene_01~08 수집
const sceneVideos = [];

// scene_0
const scene0Path = path.join(PROJECT_DIR, 'scene_0.mp4');
if (fs.existsSync(scene0Path)) {
  sceneVideos.push(scene0Path);
  console.log('scene_0.mp4 (루트)');
}

// scene_01~08
const files = fs.readdirSync(VIDEOS_DIR)
  .filter(f => f.match(/^scene_\d+\.mp4$/))
  .sort((a, b) => {
    const numA = parseInt(a.match(/scene_(\d+)\.mp4/)[1]);
    const numB = parseInt(b.match(/scene_(\d+)\.mp4/)[1]);
    return numA - numB;
  });

files.forEach(f => {
  sceneVideos.push(path.join(VIDEOS_DIR, f));
  console.log(f);
});

console.log(`\n총 ${sceneVideos.length}개 씬\n`);

// concat_list.txt 생성
const concatListPath = path.join(PROJECT_DIR, 'concat_list.txt');
const concatList = sceneVideos.map(v => `file '${v.replace(/\\/g, '/')}'`).join('\n');
fs.writeFileSync(concatListPath, concatList, 'utf-8');

console.log('concat_list.txt 생성');
console.log('-'.repeat(70));
console.log(concatList);
console.log('');

// 출력 파일
const story = JSON.parse(fs.readFileSync(path.join(PROJECT_DIR, 'story.json'), 'utf-8'));
const outputPath = path.join(PROJECT_DIR, `${story.title.replace(/[/\\?%*:|"<>]/g, '_')}_remerged.mp4`);

console.log('='.repeat(70));
console.log('Method 1: concat demuxer (재인코딩 없음)');
console.log('-'.repeat(70));

try {
  execSync(
    `ffmpeg -y -f concat -safe 0 -i "${concatListPath}" -c copy "${outputPath}"`,
    { stdio: 'inherit' }
  );

  console.log('\n✅ concat demuxer 성공!');

  // 정보 출력
  const stats = fs.statSync(outputPath);
  const probe = execSync(
    `ffprobe -v error -show_entries format=duration -of csv=p=0 "${outputPath}"`,
    { encoding: 'utf-8' }
  ).trim();

  console.log(`\n파일: ${path.basename(outputPath)}`);
  console.log(`크기: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
  console.log(`재생시간: ${(parseFloat(probe) / 60).toFixed(1)} 분`);

} catch (error) {
  console.log('\n❌ concat demuxer 실패 (비디오 파라미터 불일치)');
  console.log('\n='.repeat(70));
  console.log('Method 2: concat filter (재인코딩)');
  console.log('-'.repeat(70));

  const inputs = sceneVideos.map(v => `-i "${v}"`).join(' ');
  const filterParts = sceneVideos.map((_, i) => `[${i}:v][${i}:a]`).join('');
  const filterComplex = `${filterParts}concat=n=${sceneVideos.length}:v=1:a=1[outv][outa]`;

  try {
    execSync(
      `ffmpeg -y ${inputs} -filter_complex "${filterComplex}" -map "[outv]" -map "[outa]" ` +
      `-c:v libx264 -c:a aac -b:v 3M -preset medium "${outputPath}"`,
      { stdio: 'inherit' }
    );

    console.log('\n✅ concat filter 성공!');

    const stats = fs.statSync(outputPath);
    const probe = execSync(
      `ffprobe -v error -show_entries format=duration -of csv=p=0 "${outputPath}"`,
      { encoding: 'utf-8' }
    ).trim();

    console.log(`\n파일: ${path.basename(outputPath)}`);
    console.log(`크기: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
    console.log(`재생시간: ${(parseFloat(probe) / 60).toFixed(1)} 분`);

  } catch (error2) {
    console.error('\n❌ concat filter도 실패:', error2.message);
    process.exit(1);
  }
}

console.log('\n='.repeat(70));
console.log('완료!');
console.log('='.repeat(70));
