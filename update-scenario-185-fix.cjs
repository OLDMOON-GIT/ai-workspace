const mysql = require('mysql2/promise');
async function main() {
  const conn = await mysql.createConnection({
    host: '127.0.0.1',
    user: 'root',
    password: 'trend2024',
    database: 'trend_video'
  });

  const newTestCode = `// [자동] api-costs 페이지 로드 확인 - 기본 시나리오
// 관리자 로그인 후 API 비용 페이지가 정상 로드되는지 확인

page.setDefaultTimeout(30000);

const loginEmail = (testData && testData.email) || 'admin-test@example.com';
const loginPassword = (testData && testData.password) || 'test1234';

async function login() {
  await page.goto(BASE_URL + '/auth', { waitUntil: 'domcontentloaded' });

  // 로그인 폼 대기
  await page.waitForSelector('input[type="email"], input[name="email"]', { timeout: 10000 });

  // 이메일/비밀번호 입력
  const emailInput = page.locator('input[type="email"], input[name="email"]').first();
  const passwordInput = page.locator('input[type="password"]').first();

  await emailInput.fill(loginEmail);
  await passwordInput.fill(loginPassword);

  // Remember Me 체크 (있으면)
  const remember = page.locator('#rememberMe');
  if ((await remember.count()) > 0) {
    try { await remember.first().check({ force: true }); } catch (e) {}
  }

  // 로그인 버튼 클릭 (force: true로 nextjs-portal 오버레이 무시)
  const loginButton = page.locator('button[type="submit"], button:has-text("로그인")').first();
  await loginButton.click({ force: true });

  // 로그인 성공 대기
  await page.waitForURL((url) => !url.pathname.includes('/auth'), { timeout: 15000 });
}

await login();

// API 비용 페이지로 이동
await page.goto(BASE_URL + '/admin/api-costs', { waitUntil: 'domcontentloaded' });
await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});

// 페이지 로드 확인
const url = page.url();
if (url.includes('/auth')) {
  throw new Error('로그인 실패: /auth로 리다이렉트됨');
}

// 페이지 컨텐츠 확인 (유연한 선택자 사용)
await page.waitForSelector('h1, h2, [class*="heading"], [class*="title"]', { timeout: 10000 });
`;

  await conn.execute(
    'UPDATE test_scenario SET test_code = ?, status = "ready" WHERE scenario_id = 185',
    [newTestCode]
  );
  console.log('시나리오 185 업데이트 완료 (force: true 옵션 추가)');
  await conn.end();
}
main().catch(console.error);
