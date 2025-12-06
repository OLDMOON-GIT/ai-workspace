const mysql = require('mysql2/promise');

async function updateScenario() {
  const conn = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'trend2024',
    database: 'trend_video'
  });

  const testCode = `// 잘못된 비밀번호로 로그인 시도
// 틀린 비밀번호로 로그인 시 에러 메시지 확인

await page.goto(BASE_URL + '/auth');
await page.waitForLoadState('domcontentloaded');

// Next.js dev overlay가 사라질 때까지 잠깐 대기
await page.waitForTimeout(1000);

// 이메일/비밀번호 입력
const emailInput = page.locator('input[type="email"]');
await emailInput.waitFor({ timeout: 10000 });
await emailInput.fill(testData.email || 'admin-test@example.com');
await page.locator('input[type="password"]').fill(testData.wrong_password || 'wrongpassword');

// 로그인 버튼 클릭
await page.click('button[type="submit"]', { force: true });

// 에러 메시지가 나타날 때까지 대기 (Tailwind의 /를 피해 class*= 사용)
await page.waitForSelector('[class*="bg-red"][class*="text-red"]', { timeout: 10000 });
`;

  await conn.execute(
    'UPDATE test_scenario SET test_code = ?, status = ? WHERE scenario_id = ?',
    [testCode, 'ready', 80]
  );

  console.log('Scenario 80 updated successfully');
  await conn.end();
}

updateScenario().catch(console.error);
