const mysql = require('mysql2/promise');

async function updateScenario() {
  const conn = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'trend2024',
    database: 'trend_video'
  });

  // BTS-14935: /admin/titles → /admin/title-pool로 수정 (실제 존재하는 페이지)
  // "대본 제목 등록" → "제목 풀"로 수정 (실제 페이지 h1 텍스트)
  const testCode = `// [자동] title-pool 페이지 로드 확인
// 자동 감지: 페이지가 정상적으로 로드되는지 확인

// 로그인 먼저 수행 (관리자 페이지 접근 필요)
await page.goto(BASE_URL + '/auth');
await page.waitForLoadState('domcontentloaded');

// Next.js dev overlay가 사라질 때까지 잠깐 대기
await page.waitForTimeout(1000);

// 이메일/비밀번호 입력
const emailInput = page.locator('input[type="email"]');
await emailInput.waitFor({ timeout: 10000 });
await emailInput.fill('admin-test@example.com');
await page.locator('input[type="password"]').fill('test1234');

// 로그인 버튼 클릭 (force: true로 Next.js 오버레이 무시)
const loginButton = page.locator('button[type="submit"]');
await loginButton.click({ force: true });
await page.waitForURL(BASE_URL + '/', { timeout: 15000 });

// 대상 페이지로 이동 (BTS-14935: 올바른 경로로 수정)
await page.goto(BASE_URL + '/admin/title-pool');
await page.waitForLoadState('domcontentloaded');

// 페이지 제목 확인 (이모지 제외한 부분 매칭, BTS-14935: 실제 페이지 텍스트로 수정)
await page.waitForSelector('text=제목 풀', { timeout: 15000 });
`;

  // 시나리오 이름과 test_code 업데이트 (BTS-14935)
  await conn.execute(
    `UPDATE test_scenario
     SET test_code = ?,
         status = ?,
         name = ?
     WHERE scenario_id = ?`,
    [testCode, 'ready', '[자동] title-pool 페이지 로드 확인 - 기본 시나리오', 166]
  );

  console.log('Scenario 166 updated successfully (BTS-14935)');
  await conn.end();
}

updateScenario().catch(console.error);
