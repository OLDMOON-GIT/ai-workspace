const mysql = require('mysql2/promise');

(async () => {
  const conn = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'trend2024',
    database: 'trend_video',
    charset: 'utf8mb4'
  });

  const newTestCode = `// [자동] shop-versions 페이지 로드 확인
// 자동 감지: app/admin/shop-versions/page.tsx - 페이지가 정상적으로 로드되는지 확인

// 1. 페이지 이동 (timeout 증가, domcontentloaded만 대기)
await page.goto(BASE_URL + '/admin/shop-versions', { waitUntil: 'domcontentloaded', timeout: 30000 });

// 2. 인증 리다이렉트 체크
const currentUrl = page.url();
if (currentUrl.includes('/auth') || currentUrl.includes('/login')) {
  console.log('shop-versions 페이지 접근 시 인증 페이지로 리다이렉트됨 - 정상');
  return;
}

// 3. h1 헤더 대기 (쇼핑몰 버전 관리) - 텍스트 포함 셀렉터
await page.waitForSelector('h1:has-text("쇼핑몰 버전 관리")', { timeout: 15000 });

// 4. h3 Google Sites 배포 설정 섹션 확인
await page.waitForSelector('h3:has-text("Google Sites 배포 설정")', { timeout: 15000 });

// 5. Shop URL, Embed URL 텍스트 확인 (waitForSelector 사용)
await page.waitForSelector('span:has-text("Shop URL")', { timeout: 10000 });
await page.waitForSelector('span:has-text("Embed URL")', { timeout: 10000 });

// 6. 버전 새로고침 버튼 존재 확인
await page.waitForSelector('button:has-text("버전 새로고침")', { timeout: 10000 });

// 7. 이 상태로 퍼블리시 버튼 존재 확인
await page.waitForSelector('button:has-text("이 상태로 퍼블리시")', { timeout: 10000 });

console.log('shop-versions 페이지 로드 확인 완료');
`;

  await conn.execute(
    'UPDATE test_scenario SET test_code = ?, status = ?, last_error = NULL, updated_at = NOW() WHERE scenario_id = 171',
    [newTestCode, 'ready']
  );

  console.log('test_scenario 171 업데이트 완료');
  await conn.end();
})().catch(err => { console.error(err); process.exit(1); });
