const mysql = require('mysql2/promise');
(async () => {
  const conn = await mysql.createConnection({host:'localhost',user:'root',password:'trend2024',database:'trend_video'});
  
  const [rows] = await conn.execute('SELECT id, title, type, status FROM bugs ORDER BY id');
  
  const groups = {};
  
  for (const r of rows) {
    const t = r.title.toLowerCase();
    let cat = '기타';
    
    if (t.includes('youtube') || t.includes('유튜브')) cat = 'YouTube';
    else if (t.includes('영상') || t.includes('video') || t.includes('videopath')) cat = '영상생성';
    else if (t.includes('이미지') || t.includes('image') || t.includes('크롤') || t.includes('whisk') || t.includes('imagefx') || t.includes('dalle')) cat = '이미지';
    else if (t.includes('스크립트') || t.includes('script') || t.includes('대본') || t.includes('narration') || t.includes('gemini 응답')) cat = '스크립트/대본';
    else if (t.includes('worker') || t.includes('워커') || t.includes('unified') || t.includes('자동화') || t.includes('automation')) cat = 'Worker/자동화';
    else if (t.includes('db') || t.includes('mysql') || t.includes('sqlite') || t.includes('컬럼') || t.includes('테이블') || t.includes('schema')) cat = 'DB/스키마';
    else if (t.includes('ui') || t.includes('페이지') || t.includes('버튼') || t.includes('표시') || t.includes('화면') || t.includes('모달')) cat = 'UI/프론트';
    else if (t.includes('쿠팡') || t.includes('coupang') || t.includes('상품') || t.includes('product') || t.includes('딥링크')) cat = '쿠팡/상품';
    else if (t.includes('spawn') || t.includes('codex') || t.includes('gemini worker') || t.includes('claude')) cat = 'Spawning Pool';
    else if (t.includes('api') || t.includes('route') || t.includes('endpoint')) cat = 'API';
    else if (t.includes('lock') || t.includes('락') || t.includes('중복')) cat = '락/중복방지';
    else if (t.includes('task') || t.includes('태스크') || t.includes('큐')) cat = 'Task/Queue';
    else if (t.includes('error') || t.includes('에러') || t.includes('실패') || t.includes('오류')) cat = '에러/실패';
    else if (t.includes('log') || t.includes('로그')) cat = '로그';
    else if (t.includes('tts') || t.includes('음성')) cat = 'TTS/음성';
    else if (t.includes('thumbnail') || t.includes('썸네일')) cat = '썸네일';
    else if (t.includes('schedule') || t.includes('스케줄') || t.includes('예약')) cat = '스케줄';
    else if (t.includes('credit') || t.includes('크레딧')) cat = '크레딧';
    else if (t.includes('shortform') || t.includes('숏폼') || t.includes('shorts')) cat = '숏폼';
    else if (t.includes('channel') || t.includes('채널')) cat = '채널';
    else if (t.includes('test') || t.includes('테스트')) cat = '테스트/스펙';
    else if (t.includes('메일') || t.includes('email')) cat = '이메일';
    else if (t.includes('chrome') || t.includes('브라우저')) cat = 'Chrome/브라우저';
    
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(r);
  }
  
  console.log('=== 버그 유형별 상세 그룹핑 ===\n');
  const sorted = Object.entries(groups).sort((a,b) => b[1].length - a[1].length);
  for (const [g, bugs] of sorted) {
    const res = bugs.filter(b => b.status === 'resolved').length;
    const open = bugs.filter(b => b.status === 'open').length;
    const prog = bugs.filter(b => b.status === 'in_progress').length;
    console.log(g.padEnd(18) + ': ' + String(bugs.length).padStart(4) + '건  (resolved:' + res + ', open:' + open + ', in_progress:' + prog + ')');
  }
  
  console.log('\n=== 기타 카테고리 샘플 (최근 20개) ===');
  const etc = groups['기타'] || [];
  etc.slice(-20).forEach(b => console.log('  BTS-' + b.id + ': ' + b.title.substring(0, 60)));
  
  await conn.end();
})();
