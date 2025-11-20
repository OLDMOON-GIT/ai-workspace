// automation-scheduler를 1회 실행해서 로그 확인
const path = require('path');

// DB path 설정
const dbPath = path.join(__dirname, 'trend-video-frontend', 'data', 'database.sqlite');
const Database = require('./trend-video-frontend/node_modules/better-sqlite3');

console.log('🔍 Scheduler 수동 실행 테스트\n');

// 1. pending schedule 확인
const db = new Database(dbPath);
const pendingSchedules = db.prepare(`
  SELECT s.*, t.product_data, t.title, t.type
  FROM video_schedules s
  JOIN video_titles t ON s.title_id = t.id
  WHERE s.status = 'pending' AND t.type = 'product'
  ORDER BY s.scheduled_time ASC
  LIMIT 1
`).all();

console.log(`📋 pending product schedules: ${pendingSchedules.length}개`);

if (pendingSchedules.length === 0) {
  console.log('\n⚠️ pending schedule이 없습니다.');
  console.log('새로운 schedule을 만들어 테스트하겠습니다.\n');

  // product_data가 있는 title 찾기
  const productTitle = db.prepare(`
    SELECT id, title, product_data
    FROM video_titles
    WHERE type = 'product' AND product_data IS NOT NULL
    LIMIT 1
  `).get();

  if (!productTitle) {
    console.log('❌ product_data가 있는 title이 없습니다!');
    db.close();
    process.exit(1);
  }

  console.log('✅ Title 발견:', productTitle.title);
  console.log('   product_data:', productTitle.product_data ? '있음' : '없음');

  // 새 schedule 생성
  const scheduleId = `schedule_${Date.now()}_test`;
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO video_schedules (id, title_id, scheduled_time, status, created_at)
    VALUES (?, ?, ?, 'pending', ?)
  `).run(scheduleId, productTitle.id, now, now);

  console.log(`✅ 테스트 schedule 생성: ${scheduleId}\n`);
} else {
  const schedule = pendingSchedules[0];
  console.log(`\n✅ Pending schedule 발견:`);
  console.log(`   ID: ${schedule.id}`);
  console.log(`   제목: ${schedule.title}`);
  console.log(`   타입: ${schedule.type}`);
  console.log(`   product_data: ${schedule.product_data ? '있음 ✅' : '없음 ❌'}`);

  if (schedule.product_data) {
    try {
      const parsed = JSON.parse(schedule.product_data);
      console.log(`   - title: ${parsed.title}`);
      console.log(`   - thumbnail: ${parsed.thumbnail ? '있음' : '없음'}`);
      console.log(`   - product_link: ${parsed.product_link ? '있음' : '없음'}`);
      console.log(`   - description: ${parsed.description ? '있음' : '없음'}`);
    } catch (e) {
      console.log(`   ❌ JSON 파싱 실패!`);
    }
  }
}

db.close();

console.log('\n='.repeat(70));
console.log('💡 다음 단계:');
console.log('   1. 브라우저에서 자동화 페이지 열기');
console.log('   2. "진행 큐" 탭에서 schedule 확인');
console.log('   3. 브라우저 F12 → Console 탭 열기');
console.log('   4. Scheduler가 자동 실행될 때까지 대기 (10초마다)');
console.log('   5. 로그 확인:');
console.log('      - "🛍️ [SCHEDULER] Product data found:"');
console.log('      - "🛍️🛍️🛍️ 상품 정보 치환 시작:"');
console.log('      - "✅ 상품 정보 플레이스홀더 치환 완료"');
console.log('='.repeat(70));
