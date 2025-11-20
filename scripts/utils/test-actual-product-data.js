const path = require('path');
const Database = require('./trend-video-frontend/node_modules/better-sqlite3');

const dbPath = path.join(__dirname, 'trend-video-frontend', 'data', 'database.sqlite');
const db = new Database(dbPath);

console.log('🔍 실제 DB 데이터 확인\n');
console.log('='.repeat(70));

// 1. product 타입 titles 확인
console.log('\n📦 1. Product 타입 video_titles 확인');
const productTitles = db.prepare(`
  SELECT id, title, type, product_url, product_data, created_at
  FROM video_titles
  WHERE type = 'product'
  ORDER BY created_at DESC
  LIMIT 5
`).all();

if (productTitles.length === 0) {
  console.log('❌ product 타입 데이터가 없습니다.');
} else {
  console.log(`✅ ${productTitles.length}개 발견\n`);
  productTitles.forEach((t, i) => {
    console.log(`${i + 1}. ID: ${t.id}`);
    console.log(`   제목: ${t.title}`);
    console.log(`   타입: ${t.type}`);
    console.log(`   상품 URL: ${t.product_url || '없음'}`);
    console.log(`   product_data: ${t.product_data ? '있음 ✅' : '없음 ❌'}`);
    if (t.product_data) {
      try {
        const parsed = JSON.parse(t.product_data);
        console.log(`   - title: ${parsed.title || '없음'}`);
        console.log(`   - thumbnail: ${parsed.thumbnail ? parsed.thumbnail.substring(0, 50) + '...' : '없음'}`);
        console.log(`   - product_link: ${parsed.product_link ? parsed.product_link.substring(0, 50) + '...' : '없음'}`);
        console.log(`   - description: ${parsed.description ? parsed.description.substring(0, 50) + '...' : '없음'}`);
      } catch (e) {
        console.log(`   ❌ JSON 파싱 실패: ${e.message}`);
      }
    }
    console.log(`   생성일: ${t.created_at}\n`);
  });
}

// 2. product 타입의 script 확인
console.log('\n📝 2. Product 타입 scripts 확인');
const productScripts = db.prepare(`
  SELECT s.id, s.title, s.type, s.content, s.created_at,
         json_extract(s.product_info, '$.title') as pi_title,
         json_extract(s.product_info, '$.thumbnail') as pi_thumbnail,
         json_extract(s.product_info, '$.product_link') as pi_product_link,
         json_extract(s.product_info, '$.description') as pi_description
  FROM scripts s
  WHERE s.type = 'product'
  ORDER BY s.created_at DESC
  LIMIT 3
`).all();

if (productScripts.length === 0) {
  console.log('❌ product 타입 script가 없습니다.');
} else {
  console.log(`✅ ${productScripts.length}개 발견\n`);
  productScripts.forEach((s, i) => {
    console.log(`${i + 1}. Script ID: ${s.id}`);
    console.log(`   제목: ${s.title}`);
    console.log(`   타입: ${s.type}`);
    console.log(`   생성일: ${s.created_at}`);
    console.log(`   productInfo 확인:`);
    console.log(`   - title: ${s.pi_title || '없음'}`);
    console.log(`   - thumbnail: ${s.pi_thumbnail ? s.pi_thumbnail.substring(0, 50) + '...' : '없음'}`);
    console.log(`   - product_link: ${s.pi_product_link ? s.pi_product_link.substring(0, 50) + '...' : '없음'}`);
    console.log(`   - description: ${s.pi_description ? s.pi_description.substring(0, 50) + '...' : '없음'}`);

    // 대본 내용에서 플레이스홀더 확인
    if (s.content) {
      const hasPlaceholder = s.content.includes('{thumbnail}') ||
                              s.content.includes('{product_link}') ||
                              s.content.includes('{product_description}');
      if (hasPlaceholder) {
        console.log(`   ⚠️ 대본에 플레이스홀더가 남아있음!`);
        console.log(`      - {thumbnail}: ${s.content.includes('{thumbnail}')}`);
        console.log(`      - {product_link}: ${s.content.includes('{product_link}')}`);
        console.log(`      - {product_description}: ${s.content.includes('{product_description}')}`);
      } else {
        console.log(`   ✅ 플레이스홀더 없음 (정상 치환됨)`);
      }
    }
    console.log();
  });
}

// 3. product-info 타입 script 확인
console.log('\n🛍️ 3. Product-info 타입 scripts 확인');
const productInfoScripts = db.prepare(`
  SELECT s.id, s.title, s.type, s.content, s.created_at,
         json_extract(s.product_info, '$.title') as pi_title,
         json_extract(s.product_info, '$.thumbnail') as pi_thumbnail,
         json_extract(s.product_info, '$.product_link') as pi_product_link,
         json_extract(s.product_info, '$.description') as pi_description
  FROM scripts s
  WHERE s.type = 'product-info'
  ORDER BY s.created_at DESC
  LIMIT 3
`).all();

if (productInfoScripts.length === 0) {
  console.log('❌ product-info 타입 script가 없습니다.');
} else {
  console.log(`✅ ${productInfoScripts.length}개 발견\n`);
  productInfoScripts.forEach((s, i) => {
    console.log(`${i + 1}. Script ID: ${s.id}`);
    console.log(`   제목: ${s.title}`);
    console.log(`   타입: ${s.type}`);
    console.log(`   생성일: ${s.created_at}`);
    console.log(`   productInfo 확인:`);
    console.log(`   - title: ${s.pi_title || '없음'}`);
    console.log(`   - thumbnail: ${s.pi_thumbnail ? s.pi_thumbnail.substring(0, 50) + '...' : '없음'}`);
    console.log(`   - product_link: ${s.pi_product_link ? s.pi_product_link.substring(0, 50) + '...' : '없음'}`);
    console.log(`   - description: ${s.pi_description ? s.pi_description.substring(0, 50) + '...' : '없음'}`);

    // 대본 내용에서 플레이스홀더 확인
    if (s.content) {
      const hasPlaceholder = s.content.includes('{thumbnail}') ||
                              s.content.includes('{product_link}') ||
                              s.content.includes('{product_description}');
      if (hasPlaceholder) {
        console.log(`   ⚠️ 대본에 플레이스홀더가 남아있음!`);
        console.log(`      - {thumbnail}: ${s.content.includes('{thumbnail}')}`);
        console.log(`      - {product_link}: ${s.content.includes('{product_link}')}`);
        console.log(`      - {product_description}: ${s.content.includes('{product_description}')}`);

        // 실제 플레이스홀더 위치 표시
        if (s.content.includes('{thumbnail}')) {
          const idx = s.content.indexOf('{thumbnail}');
          console.log(`      예시: ...${s.content.substring(Math.max(0, idx - 30), idx + 50)}...`);
        }
      } else {
        console.log(`   ✅ 플레이스홀더 없음 (정상 치환됨)`);

        // 실제 URL이 포함되어 있는지 확인
        const hasUrl = s.content.includes('http://') || s.content.includes('https://');
        if (hasUrl) {
          console.log(`   ✅ 실제 URL 포함됨`);
          // URL 일부 표시
          const urlMatch = s.content.match(/(https?:\/\/[^\s\)]+)/);
          if (urlMatch) {
            console.log(`      예시: ${urlMatch[1].substring(0, 60)}...`);
          }
        }
      }
    }
    console.log();
  });
}

// 4. 자동화 큐 확인
console.log('\n🤖 4. 자동화 큐 (video_schedules) 확인');
const schedules = db.prepare(`
  SELECT s.id, s.title_id, s.status, s.scheduled_time,
         t.title, t.type, t.product_data
  FROM video_schedules s
  JOIN video_titles t ON s.title_id = t.id
  WHERE t.type = 'product'
  ORDER BY s.created_at DESC
  LIMIT 3
`).all();

if (schedules.length === 0) {
  console.log('❌ product 타입 schedule이 없습니다.');
} else {
  console.log(`✅ ${schedules.length}개 발견\n`);
  schedules.forEach((s, i) => {
    console.log(`${i + 1}. Schedule ID: ${s.id}`);
    console.log(`   제목: ${s.title}`);
    console.log(`   상태: ${s.status}`);
    console.log(`   스케줄 시간: ${s.scheduled_time}`);
    console.log(`   product_data: ${s.product_data ? '있음 ✅' : '없음 ❌'}`);
    if (s.product_data) {
      try {
        const parsed = JSON.parse(s.product_data);
        console.log(`   - title: ${parsed.title || '없음'}`);
        console.log(`   - thumbnail: ${parsed.thumbnail ? '있음' : '없음'}`);
        console.log(`   - product_link: ${parsed.product_link ? '있음' : '없음'}`);
        console.log(`   - description: ${parsed.description ? '있음' : '없음'}`);
      } catch (e) {
        console.log(`   ❌ JSON 파싱 실패`);
      }
    }
    console.log();
  });
}

console.log('='.repeat(70));
console.log('\n📊 결과 요약\n');

const summary = {
  product_titles: productTitles.length,
  product_titles_with_data: productTitles.filter(t => t.product_data).length,
  product_scripts: productScripts.length,
  product_info_scripts: productInfoScripts.length,
  schedules: schedules.length,
  schedules_with_data: schedules.filter(s => s.product_data).length
};

console.log(`product 타입 titles: ${summary.product_titles}개 (product_data: ${summary.product_titles_with_data}개)`);
console.log(`product 타입 scripts: ${summary.product_scripts}개`);
console.log(`product-info 타입 scripts: ${summary.product_info_scripts}개`);
console.log(`product 타입 schedules: ${summary.schedules}개 (product_data: ${summary.schedules_with_data}개)`);

db.close();
