const mysql = require('mysql2/promise');
(async () => {
  const conn = await mysql.createConnection({host:'localhost', user:'root', password:'trend2024', database:'trend_video'});
  const [rows] = await conn.execute("SELECT scenario_id,name FROM test_scenario WHERE test_code LIKE '%rememberMe%' LIMIT 20");
  console.log(rows);
  await conn.end();
})();
