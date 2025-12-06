const fs = require('fs');

const filePath = 'trend-video-frontend/src/app/api/jobs/[id]/longform-url/route.ts';
let content = fs.readFileSync(filePath, 'utf-8');

// 1. job 쿼리에 youtube_channel 추가
const oldQuery = `\`SELECT content_id, prompt_format, source_content_id
       FROM content WHERE content_id = ?\``;
const newQuery = `\`SELECT content_id, prompt_format, source_content_id, youtube_channel
       FROM content WHERE content_id = ?\``;

if (content.includes(oldQuery)) {
  content = content.replace(oldQuery, newQuery);
  console.log('✅ job 쿼리에 youtube_channel 추가');
} else {
  console.log('⚠️ job 쿼리를 찾을 수 없음 (이미 수정됨?)');
}

// 2. 타입 정의 업데이트
const oldType = `{ content_id?: string; prompt_format?: string; source_content_id?: string }`;
const newType = `{ content_id?: string; prompt_format?: string; source_content_id?: string; youtube_channel?: string }`;

if (content.includes(oldType)) {
  content = content.replace(oldType, newType);
  console.log('✅ 타입 정의에 youtube_channel 추가');
}

// 3. 비숏폼 분기에서 별도 쿼리 대신 job.youtube_channel 사용
const oldNonShortformBlock = `    // BTS-0001166: 숏폼이 아니어도 현재 콘텐츠의 youtube_channel 반환
    if (job.prompt_format !== 'shortform') {
      // 현재 콘텐츠의 youtube_channel 조회
      const currentContent = await getOne(
        "SELECT youtube_channel FROM content WHERE content_id = ?",
        [taskId]
      ) as { youtube_channel?: string } | undefined;

      return NextResponse.json({
        success: true,
        longformUrl: null,
        longformChannelId: currentContent?.youtube_channel || null,
        reason: '숏폼이 아님',
        isShortform: false
      });
    }`;

const newNonShortformBlock = `    // BTS-0001166 + BTS-0001170: 숏폼이 아닌 경우 현재 콘텐츠의 youtube_channel 반환
    if (job.prompt_format !== 'shortform') {
      return NextResponse.json({
        success: true,
        longformUrl: null,
        longformChannelId: job.youtube_channel || null,
        reason: '숏폼이 아님',
        isShortform: false
      });
    }`;

if (content.includes(oldNonShortformBlock)) {
  content = content.replace(oldNonShortformBlock, newNonShortformBlock);
  console.log('✅ 비숏폼 분기 최적화 (별도 쿼리 제거)');
} else {
  console.log('⚠️ 비숏폼 분기를 찾을 수 없음');
}

fs.writeFileSync(filePath, content);
console.log('✅ 파일 저장 완료');
