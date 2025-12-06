const mysql = require('mysql2/promise');

const newTestCode = `// [자동] /admin/title-pool - "↩️ 전체 되돌리기" 버튼 존재 확인
// admin-only 버튼 -> 관리자 로그인 후 페이지 접근하여 확인함.
// BTS-14860: Next.js dev overlay intercept 방지 - overlay 완전 제거 및 force 클릭 적용

page.setDefaultTimeout(60000);
page.setDefaultNavigationTimeout(60000);

const baseUrl = BASE_URL || 'http://localhost:2000';
const credentials = {
  email: testData?.email || 'admin-test@example.com',
  password: testData?.password || 'test1234'
};

// Next.js dev overlay 완전 제거 (BTS-14860: 포인터 이벤트 가로채기 방지)
async function closeNextJsDevOverlay() {
  try {
    await page.evaluate(() => {
      // nextjs-portal 요소 완전 제거 (DOM에서 삭제)
      document.querySelectorAll('nextjs-portal').forEach(el => el.remove());
      // data-nextjs-dev-overlay 스크립트 비활성화 및 제거
      document.querySelectorAll('[data-nextjs-dev-overlay]').forEach(el => {
        el.style.display = 'none';
        el.style.pointerEvents = 'none';
        el.remove();
      });
      // Next.js 에러 오버레이 클래스 포인터 이벤트 비활성화
      document.querySelectorAll('[class*="nextjs"]').forEach(el => {
        if (el.style) {
          el.style.pointerEvents = 'none';
          el.style.display = 'none';
        }
      });
    });
  } catch (e) {
    // 오버레이가 없으면 무시
  }
}

async function ensureAdminSession() {
  const sessionRes = await page.request.get(baseUrl + '/api/auth/session');
  const sessionJson = sessionRes.ok() ? await sessionRes.json() : null;

  if (sessionJson?.user?.isAdmin) {
    console.log('기존 관리자 세션으로 진행합니다:', sessionJson.user.email);
    return;
  }

  // 로그인 페이지 이동
  await page.goto(baseUrl + '/auth', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForLoadState('load');

  // Next.js dev overlay 즉시 제거
  await closeNextJsDevOverlay();

  // 이메일 입력 필드 대기
  const emailInput = page.locator('input[type="email"], input[name="email"], input#email').first();
  await emailInput.waitFor({ state: 'visible', timeout: 30000 });

  // overlay 다시 제거 (혹시 다시 생성된 경우)
  await closeNextJsDevOverlay();

  await emailInput.fill(credentials.email);

  // 비밀번호 입력
  const passwordInput = page.locator('input[type="password"]').first();
  await passwordInput.fill(credentials.password);

  // 다시 overlay 제거 후 클릭
  await closeNextJsDevOverlay();

  // 로그인 버튼 클릭 (force: true로 오버레이 무시)
  const loginButton = page.locator('button:has-text("로그인")').first();
  await loginButton.click({ force: true });

  // 로그인 후 리다이렉션 대기
  await page.waitForURL(url => !url.toString().includes('/auth'), { timeout: 30000 });
  await page.waitForLoadState('load');

  const verifyRes = await page.request.get(baseUrl + '/api/auth/session');
  const verifyJson = verifyRes.ok() ? await verifyRes.json() : null;

  if (!verifyJson?.user?.isAdmin) {
    throw new Error('관리자 로그인에 실패했습니다.');
  }
  console.log('관리자 로그인 완료:', verifyJson.user.email);
}

await ensureAdminSession();

// 관리자 페이지 접근
await page.goto(baseUrl + '/admin/title-pool', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForLoadState('load');

// Next.js dev overlay 제거
await closeNextJsDevOverlay();

// 페이지 로딩 완료 대기
await page.waitForSelector('h1, [class*="title"], [class*="header"]', { timeout: 30000 });

// 전체 되돌리기 버튼 존재 확인
const resetButton = page.locator('button:has-text("전체 되돌리기"), button:has-text("↩"), [aria-label*="되돌리기"]').first();
await resetButton.waitFor({ state: 'visible', timeout: 30000 });
console.log('전체 되돌리기 버튼 존재 확인 완료');
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
    [newTestCode, 'ready', 189]
  );
  console.log('시나리오 189 테스트 코드 업데이트 완료');
  await conn.end();
})();
