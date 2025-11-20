/**
 * concat filter로 재인코딩하면서 병합
 * 모든 씬을 1080p 25fps로 통일
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const PROJECT_DIR = 'C:\\Users\\oldmoon\\workspace\\trend-video-backend\\input\\project_197951ed-d849-4c50-97c5-2282bb8e7b56';
const VIDEOS_DIR = path.join(PROJECT_DIR, 'generated_videos');

console.log('\nconcat filter로 재인코딩 병합 (1080p 25fps 통일)');
console.log('='.repeat(70));

// scene_01~08 수집
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

// 출력 파일
const outputPath = path.join(PROJECT_DIR, 'merged_with_filter.mp4');

console.log('='.repeat(70));
console.log('concat filter로 병합 (재인코딩, 모든 씬 1080p 25fps 통일)');
console.log('-'.repeat(70));

const inputs = sceneVideos.map(v => `-i "${v}"`).join(' ');
const filterParts = sceneVideos.map((_, i) => `[${i}:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=25[v${i}];[${i}:a]aresample=48000[a${i}]`).join(';');
const concatInputs = sceneVideos.map((_, i) => `[v${i}][a${i}]`).join('');
const filterComplex = `${filterParts};${concatInputs}concat=n=${sceneVideos.length}:v=1:a=1[outv][outa]`;

try {
  execSync(
    `ffmpeg -y ${inputs} -filter_complex "${filterComplex}" -map "[outv]" -map "[outa]" ` +
    `-c:v libx264 -preset medium -crf 23 -c:a aac -b:a 192k -ar 48000 "${outputPath}"`,
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
  console.error('\n❌ 병합 실패:', error.message);
  process.exit(1);
}

console.log('\n='.repeat(70));
