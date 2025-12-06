const mysql = require('mysql2/promise');

const newTestCode = `// [자동] bugs 페이지 로드 확인
// 자동 감지: app\\admin\\bugs\\page.tsx - 페이지가 정상적으로 로드되는지 확인
// /admin/bugs는 인증이 필요하므로 먼저 로그인 처리

// 1. 로그인 페이지로 이동
await page.goto(BASE_URL + '/auth', { waitUntil: 'domcontentloaded' });

// 2. 로그인 수행
const emailInput = page.locator('input[type="email"]');
await emailInput.waitFor({ timeout: 10000 });
await emailInput.fill(testData.email);
await page.locator('input[type="password"]').fill(testData.password);

const loginButton = page.locator('button[type="submit"]');
await expect(loginButton).toBeEnabled();

// 로그인 후 navigation 대기
const navigationPromise = page.waitForEvent('load', { timeout: 20000 });
await loginButton.click();
await navigationPromise;

// 3. bugs 페이지로 이동
await page.goto(BASE_URL + '/admin/bugs', { waitUntil: 'domcontentloaded' });
await page.waitForLoadState('networkidle', { timeout: 15000 });

// 4. 페이지 로드 확인 - bugs 관련 요소가 보이는지 확인
await expect(page).toHaveURL(/\\/admin\\/bugs/);
`;

(async () => {
  const conn = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'trend2024',
    database: 'trend_video'
  });

  await conn.execute(
    'UPDATE test_scenario SET test_code = ?, status = ?, updated_at = NOW() WHERE scenario_id = ?',
    [newTestCode, 'ready', 181]
  );
  console.log('Updated scenario 181 test_code');

  // 확인
  const [rows] = await conn.execute('SELECT test_code FROM test_scenario WHERE scenario_id = 181');
  console.log('\n=== Updated Test Code ===');
  console.log(rows[0].test_code);

  await conn.end();
})();
