const mysql = require('mysql2/promise');

(async () => {
  const conn = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'trend2024',
    database: 'trend_video'
  });

  const newTestCode = `// [자동] settings 페이지 로드 확인
// 자동 감지: app/admin/settings/page.tsx - 페이지가 정상적으로 로드되는지 확인

await page.goto(BASE_URL + '/admin/settings', { waitUntil: 'domcontentloaded', timeout: 30000 });

// 인증 리다이렉트 체크
const currentUrl = page.url();
if (currentUrl.includes('/auth') || currentUrl.includes('/login')) {
  console.log('settings 페이지 접근 시 인증 페이지로 리다이렉트됨');
  return;
}

// 로딩 완료 대기: 로딩 스피너가 사라질 때까지 또는 헤더가 나타날 때까지
await Promise.race([
  page.locator('h1:has-text("크레딧 가격 설정")').waitFor({ state: 'visible', timeout: 15000 }),
  page.getByText('로딩 중...').waitFor({ state: 'hidden', timeout: 15000 }).catch(() => {})
]);

// 페이지 로드 확인: 헤더 텍스트 확인
await expect(page.locator('h1:has-text("크레딧 가격 설정")')).toBeVisible({ timeout: 10000 });

// 섹션 헤더 확인
await expect(page.locator('h2:has-text("AI 대본 생성 비용")')).toBeVisible({ timeout: 10000 });
await expect(page.locator('h2:has-text("영상 생성 비용")')).toBeVisible({ timeout: 10000 });

// 버튼 확인
await expect(page.locator('button:has-text("설정 저장")')).toBeVisible({ timeout: 10000 });
await expect(page.locator('button:has-text("기본값 복원")')).toBeVisible({ timeout: 10000 });
`;

  await conn.execute(
    'UPDATE test_scenario SET test_code = ?, status = ?, updated_at = NOW() WHERE scenario_id = 172',
    [newTestCode, 'ready']
  );

  console.log('test_scenario 172 업데이트 완료');
  await conn.end();
})().catch(err => { console.error(err); process.exit(1); });
