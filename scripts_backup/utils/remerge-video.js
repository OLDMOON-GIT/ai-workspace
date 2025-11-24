/**
 * 롱폼 비디오 재병합 스크립트
 * 해상도/fps 불일치 문제 해결
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const PROJECT_DIR = 'C:\\Users\\oldmoon\\workspace\\trend-video-backend\\input\\project_197951ed-d849-4c50-97c5-2282bb8e7b56';
const VIDEOS_DIR = path.join(PROJECT_DIR, 'generated_videos');
const TEMP_DIR = path.join(PROJECT_DIR, 'temp_normalized');

console.log('\n='.repeat(70));
console.log('롱폼 비디오 재병합 (해상도/FPS 통일)');
console.log('='.repeat(70));
console.log(`프로젝트: ${PROJECT_DIR}\n`);

// 임시 폴더 생성
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

// 씬 파일 찾기
const scene0Path = path.join(PROJECT_DIR, 'scene_0.mp4');
const sceneFiles = fs.readdirSync(VIDEOS_DIR)
  .filter(f => f.match(/^scene_\d+\.mp4$/))
  .sort((a, b) => {
    const numA = parseInt(a.match(/scene_(\d+)\.mp4/)[1]);
    const numB = parseInt(b.match(/scene_(\d+)\.mp4/)[1]);
    return numA - numB;
  });

console.log('발견된 씬:');
console.log(`  scene_0.mp4 (루트)`);
sceneFiles.forEach(f => console.log(`  ${f}`));
console.log('');

// Step 1: 모든 씬을 1080p 25fps로 정규화
console.log('Step 1: 비디오 파라미터 정규화 (1080p 25fps)');
console.log('-'.repeat(70));

const normalizedFiles = [];

// scene_0 정규화
console.log('Normalizing scene_0.mp4...');
const scene0Normalized = path.join(TEMP_DIR, 'scene_00_normalized.mp4');
try {
  execSync(
    `ffmpeg -y -i "${scene0Path}" ` +
    `-vf "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=25" ` +
    `-c:v libx264 -preset medium -crf 23 -c:a aac -b:a 192k -ar 48000 ` +
    `"${scene0Normalized}"`,
    { stdio: 'inherit' }
  );
  normalizedFiles.push({ original: 'scene_0.mp4', normalized: scene0Normalized });
  console.log('  OK scene_0 normalized\n');
} catch (error) {
  console.error('  ERROR normalizing scene_0:', error.message);
  process.exit(1);
}

// scene_01~08 정규화
for (const sceneFile of sceneFiles) {
  const sceneNum = sceneFile.match(/scene_(\d+)\.mp4/)[1];
  const scenePath = path.join(VIDEOS_DIR, sceneFile);
  const normalizedPath = path.join(TEMP_DIR, `scene_${sceneNum}_normalized.mp4`);

  console.log(`Normalizing ${sceneFile}...`);

  // 먼저 현재 파라미터 확인
  const probeResult = execSync(
    `ffprobe -v error -select_streams v:0 -show_entries stream=width,height,r_frame_rate -of csv=p=0 "${scenePath}"`,
    { encoding: 'utf-8' }
  ).trim().split(',');

  const width = parseInt(probeResult[0]);
  const height = parseInt(probeResult[1]);
  const fps = probeResult[2];

  console.log(`  Current: ${width}x${height} @ ${fps}`);

  // 이미 1080p 25fps면 복사, 아니면 변환
  if (width === 1920 && height === 1080 && fps === '25/1') {
    console.log('  Already 1080p 25fps, copying...');
    fs.copyFileSync(scenePath, normalizedPath);
  } else {
    console.log('  Converting to 1080p 25fps...');
    try {
      execSync(
        `ffmpeg -y -i "${scenePath}" ` +
        `-vf "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=25" ` +
        `-c:v libx264 -preset medium -crf 23 -c:a aac -b:a 192k -ar 48000 ` +
        `"${normalizedPath}"`,
        { stdio: 'inherit' }
      );
    } catch (error) {
      console.error(`  ERROR converting ${sceneFile}:`, error.message);
      process.exit(1);
    }
  }

  normalizedFiles.push({ original: sceneFile, normalized: normalizedPath });
  console.log(`  OK ${sceneFile} normalized\n`);
}

// Step 2: concat list 생성
console.log('\n' + '='.repeat(70));
console.log('Step 2: Concat list 생성');
console.log('-'.repeat(70));

const concatListPath = path.join(TEMP_DIR, 'concat_list.txt');
const concatList = normalizedFiles.map(f => `file '${f.normalized.replace(/\\/g, '/')}'`).join('\n');

fs.writeFileSync(concatListPath, concatList, 'utf-8');
console.log(`Concat list created: ${concatListPath}`);
console.log('\nContents:');
console.log(concatList);
console.log('');

// Step 3: Concat
console.log('\n' + '='.repeat(70));
console.log('Step 3: 비디오 병합 (concat demuxer)');
console.log('-'.repeat(70));

const story = JSON.parse(fs.readFileSync(path.join(PROJECT_DIR, 'story.json'), 'utf-8'));
const outputFilename = `${story.title.replace(/[/\\?%*:|"<>]/g, '_')}.mp4`;
const outputPath = path.join(PROJECT_DIR, outputFilename);

console.log(`Output: ${outputFilename}\n`);

console.log('Merging videos...');
try {
  execSync(
    `ffmpeg -y -f concat -safe 0 -i "${concatListPath}" -c copy "${outputPath}"`,
    { stdio: 'inherit' }
  );
  console.log('\nOK Video merged successfully!');
} catch (error) {
  console.error('ERROR during concat:', error.message);
  console.log('\nTrying concat filter method instead...');

  // concat filter 방식으로 재시도
  const filterComplex = normalizedFiles.map((_, i) => `[${i}:v][${i}:a]`).join('') +
    `concat=n=${normalizedFiles.length}:v=1:a=1[outv][outa]`;

  const inputs = normalizedFiles.map(f => `-i "${f.normalized}"`).join(' ');

  try {
    execSync(
      `ffmpeg -y ${inputs} -filter_complex "${filterComplex}" -map "[outv]" -map "[outa]" "${outputPath}"`,
      { stdio: 'inherit' }
    );
    console.log('\nOK Video merged successfully with concat filter!');
  } catch (error2) {
    console.error('ERROR: Both concat methods failed:', error2.message);
    process.exit(1);
  }
}

// Step 4: 검증
console.log('\n' + '='.repeat(70));
console.log('Step 4: 최종 비디오 검증');
console.log('-'.repeat(70));

if (fs.existsSync(outputPath)) {
  const stats = fs.statSync(outputPath);
  console.log(`OK File exists: ${outputPath}`);
  console.log(`OK Size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);

  const finalProbe = execSync(
    `ffprobe -v error -select_streams v:0 -show_entries stream=width,height,r_frame_rate,duration -of csv=p=0 "${outputPath}"`,
    { encoding: 'utf-8' }
  ).trim().split(',');

  console.log(`OK Resolution: ${finalProbe[0]}x${finalProbe[1]}`);
  console.log(`OK FPS: ${finalProbe[2]}`);
  console.log(`OK Duration: ${parseFloat(finalProbe[3]).toFixed(2)}s`);
} else {
  console.error('ERROR: Output file not created');
  process.exit(1);
}

// Step 5: 정리
console.log('\n' + '='.repeat(70));
console.log('Step 5: 임시 파일 정리');
console.log('-'.repeat(70));

console.log('Cleaning up temp files...');
try {
  fs.rmSync(TEMP_DIR, { recursive: true, force: true });
  console.log('OK Temp files removed');
} catch (error) {
  console.warn('Warning: Could not remove temp files:', error.message);
}

console.log('\n' + '='.repeat(70));
console.log('완료!');
console.log('='.repeat(70));
console.log(`\n최종 영상: ${outputPath}\n`);
