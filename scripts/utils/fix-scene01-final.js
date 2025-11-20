/**
 * scene_01을 1080p 25fps, 24kHz mono로 완전히 맞춰서 병합
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const PROJECT_DIR = 'C:\\Users\\oldmoon\\workspace\\trend-video-backend\\input\\project_197951ed-d849-4c50-97c5-2282bb8e7b56';
const VIDEOS_DIR = path.join(PROJECT_DIR, 'generated_videos');
const TEMP_DIR = path.join(PROJECT_DIR, 'temp_fix');

console.log('\nscene_01 완전 수정 (비디오+오디오 모두 맞춤)');
console.log('='.repeat(70));

// 임시 폴더 생성
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

// Step 1: scene_01을 1080p 25fps, 24kHz mono로 변환
console.log('Step 1: scene_01 완전 변환');
console.log('  비디오: 720p 24fps -> 1080p 25fps');
console.log('  오디오: 48kHz -> 24kHz mono');
console.log('-'.repeat(70));

const scene01Original = path.join(VIDEOS_DIR, 'scene_01.mp4');
const scene01Fixed = path.join(TEMP_DIR, 'scene_01_fixed.mp4');

execSync(
  `ffmpeg -y -i "${scene01Original}" ` +
  `-vf "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=25" ` +
  `-c:v libx264 -preset veryfast -crf 23 ` +
  `-c:a aac -ac 1 -ar 24000 -b:a 62k ` +
  `"${scene01Fixed}"`,
  { stdio: 'inherit' }
);

console.log('\n✅ scene_01 변환 완료\n');

// 변환된 파일 파라미터 확인
console.log('변환된 scene_01 파라미터 확인:');
const params = execSync(
  `ffprobe -v error -select_streams v:0 -show_entries stream=width,height,r_frame_rate -of csv=p=0 "${scene01Fixed}"`,
  { encoding: 'utf-8' }
).trim();
const audioParams = execSync(
  `ffprobe -v error -select_streams a:0 -show_entries stream=sample_rate,channels -of csv=p=0 "${scene01Fixed}"`,
  { encoding: 'utf-8' }
).trim();
console.log(`  비디오: ${params}`);
console.log(`  오디오: ${audioParams}\n`);

// Step 2: concat list 생성
console.log('Step 2: concat list 생성');
console.log('-'.repeat(70));

const concatList = [];
concatList.push(`file '${scene01Fixed.replace(/\\/g, '/')}'`);

// scene_02~08 추가
const files = fs.readdirSync(VIDEOS_DIR)
  .filter(f => f.match(/^scene_(0[2-9]|[1-9]\d+)\.mp4$/))
  .sort((a, b) => {
    const numA = parseInt(a.match(/scene_(\d+)\.mp4/)[1]);
    const numB = parseInt(b.match(/scene_(\d+)\.mp4/)[1]);
    return numA - numB;
  });

files.forEach(f => {
  concatList.push(`file '${path.join(VIDEOS_DIR, f).replace(/\\/g, '/')}'`);
});

const concatListPath = path.join(TEMP_DIR, 'concat_list.txt');
fs.writeFileSync(concatListPath, concatList.join('\n'), 'utf-8');

console.log(concatList.join('\n'));
console.log('');

// Step 3: concat demuxer로 병합
console.log('Step 3: concat demuxer로 병합');
console.log('-'.repeat(70));

const outputPath = path.join(PROJECT_DIR, 'merged_final.mp4');

execSync(
  `ffmpeg -y -f concat -safe 0 -i "${concatListPath}" -c copy "${outputPath}"`,
  { stdio: 'inherit' }
);

console.log('\n✅ 병합 완료!');

// 정보 출력
const stats = fs.statSync(outputPath);
const probe = execSync(
  `ffprobe -v error -show_entries format=duration -of csv=p=0 "${outputPath}"`,
  { encoding: 'utf-8' }
).trim();

console.log(`\n파일: ${path.basename(outputPath)}`);
console.log(`크기: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
console.log(`재생시간: ${(parseFloat(probe) / 60).toFixed(1)} 분`);

// 임시 폴더 삭제
console.log('\n임시 파일 정리 중...');
fs.rmSync(TEMP_DIR, { recursive: true, force: true });

console.log('\n='.repeat(70));
console.log('✅ 완료! 이제 타임스탬프 문제가 해결되어야 합니다.');
console.log('='.repeat(70));
