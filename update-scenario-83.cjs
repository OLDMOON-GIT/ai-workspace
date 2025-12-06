const mysql = require('mysql2/promise');

(async () => {
  const conn = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'trend2024',
    database: 'trend_video'
  });

  const newCode = `// 대시보드(메인) 페이지 로드
// 대시보드가 정상적으로 로드되는지 확인

await page.goto(BASE_URL + '/');
await page.waitForLoadState('domcontentloaded');
await expect(page).toHaveURL(BASE_URL + '/');
`;

  const [result] = await conn.execute(
    'UPDATE test_scenario SET test_code = ?, status = ? WHERE scenario_id = ?',
    [newCode, 'ready', 83]
  );

  console.log('Updated rows:', result.affectedRows);
  await conn.end();
})();
