/**
 * generated_videos 폴더의 씬들만 병합
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const PROJECT_DIR = 'C:\\Users\\oldmoon\\workspace\\trend-video-backend\\input\\project_197951ed-d849-4c50-97c5-2282bb8e7b56';
const VIDEOS_DIR = path.join(PROJECT_DIR, 'generated_videos');

console.log('\ngenerated_videos 폴더 씬 병합');
console.log('='.repeat(70));

// scene_01~08만 수집
const sceneVideos = [];
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
const concatListPath = path.join(VIDEOS_DIR, 'concat_list.txt');
const concatList = sceneVideos.map(v => `file '${v.replace(/\\/g, '/')}'`).join('\n');
fs.writeFileSync(concatListPath, concatList, 'utf-8');

console.log('concat_list.txt:');
console.log('-'.repeat(70));
console.log(concatList);
console.log('');

// 출력 파일
const outputPath = path.join(PROJECT_DIR, 'merged_generated_videos.mp4');

console.log('='.repeat(70));
console.log('병합 시작');
console.log('-'.repeat(70));

try {
  execSync(
    `ffmpeg -y -f concat -safe 0 -i "${concatListPath}" -c copy "${outputPath}"`,
    { stdio: 'inherit' }
  );

  console.log('\n✅ 병합 완료!');

  const stats = fs.statSync(outputPath);
  const probe = execSync(
    `ffprobe -v error -show_entries format=duration -of csv=p=0 "${outputPath}"`,
    { encoding: 'utf-8' }
  ).trim();

  console.log(`\n파일: ${path.basename(outputPath)}`);
  console.log(`크기: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
  console.log(`재생시간: ${(parseFloat(probe) / 60).toFixed(1)} 분`);

} catch (error) {
  console.log('\n❌ concat demuxer 실패, concat filter 시도...');

  const inputs = sceneVideos.map(v => `-i "${v}"`).join(' ');
  const filterParts = sceneVideos.map((_, i) => `[${i}:v][${i}:a]`).join('');
  const filterComplex = `${filterParts}concat=n=${sceneVideos.length}:v=1:a=1[outv][outa]`;

  try {
    execSync(
      `ffmpeg -y ${inputs} -filter_complex "${filterComplex}" -map "[outv]" -map "[outa]" ` +
      `-c:v libx264 -c:a aac -b:v 3M -preset medium "${outputPath}"`,
      { stdio: 'inherit' }
    );

    console.log('\n✅ concat filter 완료!');

    const stats = fs.statSync(outputPath);
    const probe = execSync(
      `ffprobe -v error -show_entries format=duration -of csv=p=0 "${outputPath}"`,
      { encoding: 'utf-8' }
    ).trim();

    console.log(`\n파일: ${path.basename(outputPath)}`);
    console.log(`크기: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
    console.log(`재생시간: ${(parseFloat(probe) / 60).toFixed(1)} 분`);

  } catch (error2) {
    console.error('\n❌ 병합 실패:', error2.message);
    process.exit(1);
  }
}

console.log('\n='.repeat(70));
