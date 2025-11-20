// YouTube Shorts 감지 로직 테스트
// Node.js로 실행: node test-youtube-shorts-detection.js

const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

async function testShortsDetection(videoPath) {
  console.log('=== YouTube Shorts 자동 감지 테스트 ===\n');

  const title = "김장철마다 늦게와서 김장만 챙겨가는 며느리 (쇼츠)";
  const description = "어느날 가본 아들의 집...";

  console.log('📹 비디오 경로:', videoPath);

  // 1. 비디오 해상도 확인
  let isShorts = false;
  try {
    const { stdout } = await execAsync(
      `ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0 "${videoPath}"`
    );

    const [width, height] = stdout.trim().split(',').map(Number);
    console.log(`📐 비디오 해상도: ${width}x${height}`);

    // 세로 비율 체크
    if (height > width) {
      const ratio = height / width;
      console.log(`   세로 비율: ${ratio.toFixed(2)}`);

      if (ratio >= 1.5 && ratio <= 2.0) {
        isShorts = true;
        console.log('✅ YouTube Shorts 형식 감지 (세로 비율)\n');
      } else {
        console.log('❌ 세로 비율이 Shorts 범위를 벗어남 (1.5~2.0)\n');
      }
    } else {
      console.log('❌ 가로 영상 (Shorts 아님)\n');
    }
  } catch (error) {
    console.error('⚠️ 비디오 해상도 확인 실패:', error.message, '\n');
  }

  // 2. 제목과 설명 변환
  let finalTitle = title;
  let finalDescription = description;

  if (isShorts) {
    // 제목에 #Shorts 추가
    if (!finalTitle.includes('#Shorts') && !finalTitle.includes('#shorts')) {
      finalTitle = `${finalTitle} #Shorts`;
      console.log('📝 제목에 #Shorts 추가');
      console.log(`   변경 전: ${title}`);
      console.log(`   변경 후: ${finalTitle}\n`);
    }

    // 설명 맨 앞에 #Shorts 추가
    if (!finalDescription.includes('#Shorts') && !finalDescription.includes('#shorts')) {
      finalDescription = `#Shorts\n\n${finalDescription}`;
      console.log('📝 설명 맨 앞에 #Shorts 추가');
      console.log(`   변경 전: ${description}`);
      console.log(`   변경 후: ${finalDescription}\n`);
    }
  } else {
    console.log('ℹ️  Shorts가 아니므로 제목/설명 수정 안 함\n');
  }

  // 3. 최종 메타데이터
  console.log('=== 최종 YouTube 업로드 메타데이터 ===');
  const metadata = {
    title: finalTitle,
    description: finalDescription,
    tags: ['AI', '숏폼', '자동화'],
    category_id: "27",
    privacy_status: "public"
  };
  console.log(JSON.stringify(metadata, null, 2));
}

// 테스트 실행
const videoPath = process.argv[2] || 'trend-video-backend/output/merge_1762761210740/scenes/scene_1.mp4';
testShortsDetection(videoPath).catch(console.error);
