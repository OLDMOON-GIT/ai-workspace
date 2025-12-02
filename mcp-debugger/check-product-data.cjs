#!/usr/bin/env node
const mysql = require('mysql2/promise');

(async () => {
  const conn = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'trend2024',
    database: 'trend_video'
  });

  console.log('\n상품 데이터 확인:\n');

  const [rows] = await conn.execute(`
    SELECT content_id, title, category, prompt_format, product_info
    FROM content
    WHERE category = '상품' OR title LIKE '%상품%' OR prompt_format = 'product'
    ORDER BY created_at DESC
    LIMIT 5
  `);

  if (rows.length === 0) {
    console.log('❌ 상품 데이터 없음');
  } else {
    rows.forEach((row, idx) => {
      console.log(`${idx + 1}. ${row.content_id}`);
      console.log(`   제목: ${row.title}`);
      console.log(`   카테고리: ${row.category}`);
      console.log(`   prompt_format: ${row.prompt_format || '(NULL)'}`);
      console.log(`   product_info: ${row.product_info ? '(있음)' : '(없음)'}`);
      console.log('');
    });
  }

  await conn.end();
})();
