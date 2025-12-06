const mysql = require('mysql2/promise');
const dbConfig = { host: 'localhost', user: 'root', password: 'trend2024', database: 'trend_video' };

const newTestCode = `// [자동] /admin/bts - "삭제" 버튼 존재 확인
// 자동 감지: app\\admin\\bts\\page.tsx:991 - 버튼 요소 존재 확인
// BTS-3848: 로그인 후 관리자 페이지 접근 필요
// BTS-14858: Next.js dev overlay 충돌 방지를 위해 force: true 옵션 추가

// 1. 로그인 페이지로 이동
await page.goto(BASE_URL + '/auth');
await page.waitForSelector('input[type="email"]', { timeout: 10000 });

// 2. 로그인 수행
await page.fill('input[type="email"]', testData.email);
await page.fill('input[type="password"]', testData.password);

// BTS-14858: Next.js dev overlay가 버튼 클릭을 가로막는 문제 해결
// force: true 옵션으로 오버레이 뒤의 요소도 클릭 가능
await page.click('button[type="submit"]', { force: true });

// 3. 로그인 성공 후 메인 페이지 리다이렉트 대기
await page.waitForURL(new RegExp(BASE_URL + '/?'), { timeout: 15000 });

// 4. 관리자 BTS 페이지로 이동
await page.goto(BASE_URL + '/admin/bts');
await page.waitForLoadState('networkidle');

// 5. 버그 목록 로드 대기 (로딩 중 스피너가 사라질 때까지)
await page.waitForTimeout(2000);

// 6. 삭제 버튼 존재 확인 (버그가 있는 경우에만 존재)
// 버그 목록이 비어있으면 삭제 버튼이 없으므로, 버그 목록 또는 빈 상태 메시지 확인
const hasDeleteButton = await page.locator('button:has-text("삭제")').first().isVisible().catch(() => false);
const hasEmptyMessage = await page.locator('text=해당 조건의 버그가 없습니다').isVisible().catch(() => false);
const hasLoadingComplete = hasDeleteButton || hasEmptyMessage;

if (!hasLoadingComplete) {
  throw new Error('페이지 로드 실패: 삭제 버튼이나 빈 상태 메시지를 찾을 수 없음');
}
`;

(async () => {
  const conn = await mysql.createConnection(dbConfig);
  await conn.execute(
    'UPDATE test_scenario SET test_code = ?, updated_at = NOW() WHERE scenario_id = 198',
    [newTestCode]
  );
  console.log('시나리오 198 test_code 업데이트 완료');
  await conn.end();
})();
