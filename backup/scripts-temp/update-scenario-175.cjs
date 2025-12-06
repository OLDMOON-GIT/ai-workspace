const mysql = require('mysql2/promise');

(async () => {
  const conn = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'trend2024',
    database: 'trend_video',
    charset: 'utf8mb4'
  });

  const newTestCode = `// [자동] sora2 페이지 로드 확인
// 자동 감지: app/admin/prompts/sora2/page.tsx - 페이지가 정상적으로 로드되는지 확인

// 페이지 이동 (API 서버가 없어도 페이지 자체는 렌더링됨)
await page.goto(BASE_URL + '/admin/prompts/sora2', { waitUntil: 'domcontentloaded', timeout: 30000 });

// 페이지 기본 컨테이너 확인 (min-h-screen bg-slate-950 배경)
await expect(page.locator('.min-h-screen.bg-slate-950')).toBeVisible({ timeout: 10000 });

// 페이지 제목 또는 로딩 상태 확인 - 둘 중 하나가 보이면 성공
// 로딩 중: animate-spin 클래스가 있는 로딩 스피너
// 로딩 완료: 'Sora2 프롬프트 관리' 제목이 있는 h1
const hasLoading = await page.locator('.animate-spin').isVisible().catch(() => false);
const hasTitle = await page.locator('h1:has-text("Sora2 프롬프트 관리")').isVisible().catch(() => false);

// 둘 중 하나라도 보이면 페이지 로드 성공
if (!hasLoading && !hasTitle) {
  // 5초 대기 후 다시 확인
  await page.waitForTimeout(5000);
  const hasLoadingRetry = await page.locator('.animate-spin').isVisible().catch(() => false);
  const hasTitleRetry = await page.locator('h1:has-text("Sora2 프롬프트 관리")').isVisible().catch(() => false);
  expect(hasLoadingRetry || hasTitleRetry).toBe(true);
}
`;

  const [result] = await conn.execute(
    'UPDATE test_scenario SET test_code = ?, updated_at = NOW() WHERE scenario_id = 175',
    [newTestCode]
  );

  console.log('Updated rows:', result.affectedRows);
  await conn.end();
})();
