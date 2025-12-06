const mysql = require('mysql2/promise');

async function main() {
  const conn = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'trend2024',
    database: 'trend_video'
  });

  // 수정된 테스트 코드 - force: true 옵션 추가로 nextjs-portal overlay 문제 해결
  const newTestCode = `// [자동] coupang-products 페이지 로드 확인
// 자동 감지: 페이지가 정상적으로 로드되는지 확인

// 로그인 먼저 수행 (관리자 페이지 접근 필요)
await page.goto(BASE_URL + '/auth');
await page.waitForLoadState('domcontentloaded');

// 이메일/비밀번호 입력
const emailInput = page.locator('input[type="email"]');
await emailInput.waitFor({ timeout: 10000 });
await emailInput.fill('admin-test@example.com');
await page.locator('input[type="password"]').fill('test1234');

// 로그인 버튼 클릭 (force: true로 nextjs dev overlay 문제 해결)
const loginButton = page.locator('button[type="submit"]');
await loginButton.click({ force: true });
await page.waitForURL(BASE_URL + '/', { timeout: 15000 });

// 대상 페이지로 이동
await page.goto(BASE_URL + '/admin/coupang-products');
await page.waitForLoadState('domcontentloaded');

// 페이지 주요 요소 확인 (내 목록 탭 버튼)
await page.waitForSelector('button:has-text("내 목록")', { timeout: 15000 });
`;

  try {
    await conn.execute(
      'UPDATE test_scenario SET test_code = ?, updated_at = NOW() WHERE scenario_id = ?',
      [newTestCode, 178]
    );
    console.log('시나리오 178 test_code 업데이트 완료');

    // 확인
    const [rows] = await conn.execute(
      'SELECT scenario_id, name, LEFT(test_code, 200) as preview FROM test_scenario WHERE scenario_id = 178'
    );
    console.log('업데이트 결과:', rows[0]);
  } catch (err) {
    console.error('에러:', err.message);
  } finally {
    await conn.end();
  }
}

main();
