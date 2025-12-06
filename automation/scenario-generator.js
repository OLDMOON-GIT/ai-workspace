/**
 * 시나리오 생성기
 * BTS-0001241: 유스케이스에서 테스트 시나리오(코드) 자동 생성
 */

const mysql = require("mysql2/promise");

const dbConfig = {
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "trend2024",
  database: process.env.DB_NAME || "trend_video"
};

function parseArgs() {
  const args = process.argv.slice(2);
  const parsed = {};
  for (let i = 0; i < args.length; i++) {
    const current = args[i];
    if (current.startsWith("--")) {
      const key = current.replace(/^--/, "");
      const value = args[i + 1] && !args[i + 1].startsWith("--") ? args[++i] : true;
      parsed[key] = value;
    }
  }
  return parsed;
}

async function getConnection() { return await mysql.createConnection(dbConfig); }

function escapeSelector(str) {
  // 작은따옴표 이스케이프 (JS 문자열 내에서 사용)
  return (str || "").replace(/'/g, "\\'").replace(/"/g, '\\"');
}

function generatePlaywrightCode(usecase) {
  const steps = typeof usecase.steps === "string" ? JSON.parse(usecase.steps) : (usecase.steps || []);
  let code = "// " + usecase.name + "\n// " + (usecase.description || "") + "\n\n";
  for (const step of steps) {
    const action = step.action || "unknown";
    const target = escapeSelector(step.target || "");
    switch (action) {
      case "goto": code += "await page.goto(BASE_URL + '" + target + "');\n"; break;
      case "waitForSelector": code += "await page.waitForSelector('" + target + "');\n"; break;
      case "waitForURL": code += "await page.waitForURL('**" + target + "**');\n"; break;
      case "waitForLoadState": code += "await page.waitForLoadState('" + target + "');\n"; break;
      case "fill": code += "await page.fill('" + target + "', testData." + (step.value || "").replace(/[{}]/g, "") + ");\n"; break;
      case "click": code += "await page.click('" + target + "');\n"; break;
      case "checkBodyText": code += "const bodyLength = await page.evaluate(() => document.body.innerText.trim().length);\nif (bodyLength < " + (step.minLength || 50) + ") throw new Error('Body text too short');\n"; break;
      default: code += "// TODO: " + action + " - " + target + "\n";
    }
  }
  return code;
}

async function createScenario(conn, usecase) {
  const scenarioName = usecase.name + " - 기본 시나리오";
  const [existing] = await conn.execute("SELECT scenario_id FROM test_scenario WHERE usecase_id = ? AND name = ?", [usecase.usecase_id, scenarioName]);
  if (existing.length > 0) { console.log("Skip: " + usecase.name); return existing[0].scenario_id; }
  const testCode = generatePlaywrightCode(usecase);
  const testData = { email: "test@example.com", password: "test1234" };
  const [result] = await conn.execute("INSERT INTO test_scenario (usecase_id, name, test_code, test_data, status, run_count, pass_count, fail_count, created_at, updated_at) VALUES (?, ?, ?, ?, 'draft', 0, 0, 0, NOW(), NOW())", [usecase.usecase_id, scenarioName, testCode, JSON.stringify(testData)]);
  console.log("Created: " + usecase.name + " (ID: " + result.insertId + ")");
  return result.insertId;
}

async function listScenarios(conn, category) {
  let query = "SELECT s.scenario_id, s.name, s.status, u.category FROM test_scenario s JOIN test_usecase u ON s.usecase_id = u.usecase_id";
  const params = [];
  if (category) { query += " WHERE u.category = ?"; params.push(category); }
  query += " ORDER BY u.category, s.name";
  const [rows] = await conn.execute(query, params);
  if (rows.length === 0) { console.log("No scenarios found"); return; }
  console.log("\nScenarios (" + rows.length + ")\n");
  for (const row of rows) { console.log("[" + row.scenario_id + "] " + row.category + " | " + row.name + " | " + row.status); }
}

async function generateFromUsecases(conn, category) {
  let query = "SELECT * FROM test_usecase WHERE is_active = 1";
  const params = [];
  if (category) { query += " AND category = ?"; params.push(category); }
  const [usecases] = await conn.execute(query, params);
  if (usecases.length === 0) { console.log("No usecases found"); return; }
  console.log("Generating from " + usecases.length + " usecases...");
  for (const uc of usecases) { await createScenario(conn, uc); }
  console.log("Done!");
}

async function showScenarioCode(conn, scenarioId) {
  const [rows] = await conn.execute("SELECT * FROM test_scenario WHERE scenario_id = ?", [scenarioId]);
  if (rows.length === 0) { console.log("Not found: " + scenarioId); return; }
  console.log("\n=== " + rows[0].name + " ===\n" + rows[0].test_code);
}

async function main() {
  const args = parseArgs();
  const conn = await getConnection();
  try {
    if (args.list) { await listScenarios(conn, args.category); }
    else if (args.usecaseId) { const [ucs] = await conn.execute("SELECT * FROM test_usecase WHERE usecase_id = ?", [args.usecaseId]); if (ucs.length > 0) await createScenario(conn, ucs[0]); }
    else if (args.category) { await generateFromUsecases(conn, args.category); }
    else if (args.all) { await generateFromUsecases(conn); }
    else if (args.show) { await showScenarioCode(conn, args.show); }
    else { console.log("Usage:\n  --list              List scenarios\n  --all               Generate all\n  --category <name>   By category\n  --usecaseId <id>    By ID\n  --show <id>         Show code"); }
  } finally { await conn.end(); }
}

main().catch(e => { console.error("Error:", e.message); process.exit(1); });