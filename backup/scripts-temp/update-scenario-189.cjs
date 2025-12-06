const mysql = require('mysql2/promise');

async function updateScenario() {
  const conn = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'trend2024',
    database: 'trend_video'
  });

  const testCode = `// [자동] /admin/title-pool - 페이지 로드 확인
// 관리자 로그인 후 제목 풀 페이지 로드 확인

// 로그인 먼저 수행 (관리자 권한이 있는 계정 필요)
await page.goto(BASE_URL + '/auth');
await page.waitForLoadState('domcontentloaded');

// Next.js dev overlay가 사라질 때까지 잠깐 대기
await page.waitForTimeout(1000);

// 이메일/비밀번호 입력
const emailInput = page.locator('input[type="email"]');
await emailInput.waitFor({ timeout: 10000 });
await emailInput.fill('admin-test@example.com');
await page.locator('input[type="password"]').fill('test1234');

// 로그인 버튼 클릭 (force: true로 overlay 무시)
const loginButton = page.locator('button[type="submit"]');
await loginButton.click({ force: true });
await page.waitForURL(BASE_URL + '/', { timeout: 15000 });

// 관리자 페이지로 이동
await page.goto(BASE_URL + '/admin/title-pool');
await page.waitForLoadState('domcontentloaded');

// 페이지 헤더 확인
await page.waitForSelector('text=제목 풀', { timeout: 15000 });

// 관리자 버튼 확인 (전체 되돌리기) - 관리자로 로그인해야 표시됨
const resetButton = page.locator('text=전체 되돌리기');
await resetButton.waitFor({ state: 'visible', timeout: 15000 });
`;

  await conn.execute(
    'UPDATE test_scenario SET test_code = ?, status = ? WHERE scenario_id = ?',
    [testCode, 'ready', 189]
  );

  console.log('Scenario 189 updated successfully');
  await conn.end();
}

updateScenario().catch(console.error);
