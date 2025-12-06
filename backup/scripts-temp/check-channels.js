const mysql = require('mysql2/promise');

async function main() {
  const conn = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'trend2024',
    database: 'trend_video'
  });

  // 최근 콘텐츠의 youtube_channel 확인
  const [contents] = await conn.execute(`
    SELECT content_id, title, youtube_channel, prompt_format, source_content_id, created_at
    FROM content
    ORDER BY created_at DESC
    LIMIT 10
  `);

  console.log('=== 최근 콘텐츠의 youtube_channel ===');
  contents.forEach(c => {
    const title = c.title ? c.title.substring(0, 25) : 'N/A';
    console.log(`[${c.prompt_format || 'unknown'}] ${title}... | channel: ${c.youtube_channel || 'NULL'}`);
  });

  // YouTube 채널 목록
  const [channels] = await conn.execute('SELECT id, channel_id, channel_title, is_default FROM youtube_channels');
  console.log('\n=== 등록된 YouTube 채널 ===');
  channels.forEach(ch => {
    console.log(`[ID:${ch.id}] ${ch.channel_title} (channelId: ${ch.channel_id}) default: ${ch.is_default}`);
  });

  await conn.end();
}

main().catch(console.error);
