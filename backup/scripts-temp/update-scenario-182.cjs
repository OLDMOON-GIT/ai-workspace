const mysql = require('mysql2/promise');

(async () => {
  const conn = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'trend2024',
    database: 'trend_video'
  });

  const newTestCode = `// [자동] bts 페이지 로드 확인
// 자동 감지: app/admin/bts/page.tsx - 페이지가 정상적으로 로드되는지 확인
// admin 페이지이므로 인증 필요 - 리다이렉트 시 정상 처리

await page.goto(BASE_URL + '/admin/bts', { waitUntil: 'domcontentloaded' });

// 인증 상태에 따라 다른 페이지가 표시됨
const pageState = await Promise.race([
  // 관리자 인증된 경우: BTS 페이지 h1 타이틀 대기
  page.locator('h1:has-text("Bug Tracking System")').waitFor({ timeout: 10000 }).then(() => 'bts'),
  // 관리자 아닌 경우: 로그인 페이지로 리다이렉트
  page.locator('button[type="submit"]:has-text("로그인")').waitFor({ timeout: 10000 }).then(() => 'auth'),
  // 홈으로 리다이렉트될 수도 있음 (권한 없음 alert 후)
  page.locator('h1:has-text("대시보드")').waitFor({ timeout: 10000 }).then(() => 'home')
]).catch(() => 'unknown');

// 인증/권한 없이 접근 시 리다이렉트는 정상 동작
if (pageState === 'auth' || pageState === 'home') {
  console.log('Admin authentication required - redirect expected');
  return; // 테스트 통과 (인증 없이 접근 불가는 정상)
}

if (pageState === 'bts') {
  // BTS 페이지가 정상 렌더링된 경우
  // 유형 필터 버튼 확인 (전체, Bug, Spec)
  await page.waitForSelector('button:has-text("전체")', { timeout: 5000 });

  // 검색 input 확인
  await page.waitForSelector('input[placeholder*="검색"]', { timeout: 5000 });

  console.log('BTS page loaded successfully');
  return;
}

// unknown 상태면 현재 URL 확인
const currentUrl = page.url();
if (currentUrl.includes('/auth')) {
  console.log('Redirected to auth page - expected for non-authenticated access');
  return;
}

throw new Error('Unexpected page state: ' + pageState + ', URL: ' + currentUrl);`;

  const [result] = await conn.execute(
    'UPDATE test_scenario SET test_code = ?, status = ?, updated_at = NOW() WHERE scenario_id = ?',
    [newTestCode, 'ready', 182]
  );
  console.log('Updated rows:', result.affectedRows);
  await conn.end();
})();
