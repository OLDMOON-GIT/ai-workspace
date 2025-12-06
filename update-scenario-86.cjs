const mysql = require('mysql2/promise');

async function updateScenario() {
  const conn = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'trend2024',
    database: 'trend_video'
  });

  const testCode = `// 유효한 자격증명으로 로그인
// 올바른 이메일과 비밀번호로 로그인

await page.goto(BASE_URL + '/auth');
await page.waitForLoadState('domcontentloaded');

// Next.js dev overlay가 사라질 때까지 잠깐 대기
await page.waitForTimeout(1000);

// 이메일 입력 필드가 나타날 때까지 대기
const emailInput = page.locator('input[type="email"]');
await emailInput.waitFor({ timeout: 10000 });
await emailInput.fill(testData.email || 'admin-test@example.com');
await page.locator('input[type="password"]').fill(testData.password || 'test1234');

// 로그인 버튼 클릭 (force: true로 overlay 무시)
const loginButton = page.locator('button[type="submit"]');
await loginButton.click({ force: true });

// 로그인 성공 후 메인 페이지로 리다이렉트 대기 (더 긴 타임아웃)
await page.waitForURL(BASE_URL + '/', { timeout: 30000 });
`;

  await conn.execute(
    'UPDATE test_scenario SET test_code = ?, status = ? WHERE scenario_id = ?',
    [testCode, 'ready', 86]
  );

  console.log('Scenario 86 updated successfully');
  await conn.end();
}

updateScenario().catch(console.error);
