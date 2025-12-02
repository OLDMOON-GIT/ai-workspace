// 유튜브 업로드 API 테스트
import mysql from 'mysql2/promise';

const taskId = '94cd4388-b6f9-4359-9f82-ab31a4f408eb';

// MySQL 연결
const connection = await mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: 'trend2024',
  database: 'trend_video'
});

try {
  // 1. '쇼츠왕' 채널 찾기
  const [channels] = await connection.execute(`
    SELECT channel_id, channel_name, is_default
    FROM youtube_channel
    WHERE channel_name = '쇼츠왕'
    LIMIT 1
  `);

  if (channels.length === 0) {
    console.error('❌ "쇼츠왕" 채널을 찾을 수 없습니다!');

    // 기본 채널 찾기
    const [defaultChannels] = await connection.execute(`
      SELECT channel_id, channel_name, is_default
      FROM youtube_channel
      WHERE is_default = 1
      LIMIT 1
    `);

    if (defaultChannels.length > 0) {
      console.log(`✅ 기본 채널 사용: ${defaultChannels[0].channel_name} (${defaultChannels[0].channel_id})`);
      channels.push(defaultChannels[0]);
    } else {
      console.error('❌ 기본 채널도 없습니다!');
      process.exit(1);
    }
  }

  const channel = channels[0];
  console.log(`✅ 채널: ${channel.channel_name} (ID: ${channel.channel_id}, 기본: ${channel.is_default})`);

  // 2. content 정보 가져오기
  const [contents] = await connection.execute(`
    SELECT content_id, title, user_id
    FROM content
    WHERE content_id = ?
  `, [taskId]);

  if (contents.length === 0) {
    console.error(`❌ Content not found: ${taskId}`);
    process.exit(1);
  }

  const content = contents[0];
  console.log(`📝 Title: ${content.title}`);
  console.log(`👤 User ID: ${content.user_id}`);

  // 3. 유튜브 업로드 API 호출
  const requestBody = {
    taskId: taskId,
    title: content.title,
    description: '자동 업로드 테스트',
    tags: ['쇼츠', '테스트'],
    privacy: 'unlisted',
    channelId: channel.channel_id,
    userId: content.user_id,
    type: 'shortform'
  };

  console.log('\n📤 Calling API: POST /api/youtube/upload');
  console.log('Body:', JSON.stringify(requestBody, null, 2));

  const response = await fetch('http://localhost:2000/api/youtube/upload', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Internal-Request': 'automation-system'
    },
    body: JSON.stringify(requestBody)
  });

  console.log(`\n📥 Response status: ${response.status}`);

  const result = await response.json();
  console.log('Response:', JSON.stringify(result, null, 2));

  if (response.ok) {
    console.log('\n✅ SUCCESS! YouTube upload started');
  } else {
    console.log('\n❌ FAILED!');
    process.exit(1);
  }
} finally {
  await connection.end();
}
