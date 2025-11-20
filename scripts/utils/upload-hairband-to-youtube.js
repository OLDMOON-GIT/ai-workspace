const videoId = 'auto_1763302045037_ytu6o7wgr';

console.log('=== 헤어밴드 YouTube 업로드 시작 ===\n');
console.log(`Video ID: ${videoId}`);
console.log('');

async function uploadToYouTube() {
  try {
    const response = await fetch('http://localhost:3000/api/youtube/upload', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jobId: videoId
      })
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('❌ YouTube 업로드 실패:', data.error || data.message);
      console.error('상세:', JSON.stringify(data, null, 2));
      return;
    }

    console.log('✅ YouTube 업로드 성공!');
    console.log('URL:', data.videoUrl || '(URL 없음)');
    console.log('응답:', JSON.stringify(data, null, 2));

  } catch (error) {
    console.error('❌ 오류 발생:', error.message);
    console.error(error);
  }
}

uploadToYouTube();
