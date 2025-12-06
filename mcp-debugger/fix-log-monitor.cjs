const fs = require('fs');

const filePath = 'C:/Users/oldmoon/workspace/automation/log-monitor.js';
let content = fs.readFileSync(filePath, 'utf-8');

// 175번 줄의 한 줄로 압축된 코드를 찾아서 수정
const oldCodePattern = /\/\*\* \* 숫자 ID를 BTS- 형식 문자열로 변환 \*\/function formatBugId\(numId\) \{  return `BTS-\$\{String\(numId\)\.padStart\(7, '0'\)\}`;}\*\* \* 버그 DB에 등록 \(AUTO_INCREMENT 사용\) \*\/async function registerBug\(errorInfo\) \{.*?\} finally \{    await conn\.end\(\);  \}\}/s;

const newCode = `/**
 * 숫자 ID를 BTS- 형식 문자열로 변환
 */
function formatBugId(numId) {
  return \`BTS-\${String(numId).padStart(7, '0')}\`;
}

/**
 * 버그 DB에 등록 (AUTO_INCREMENT 사용)
 */
async function registerBug(errorInfo) {
  const conn = await mysql.createConnection(DB_CONFIG);

  try {
    const title = errorInfo.type || 'Server Runtime Error';
    // summary에 컨텍스트 포함 (최대 2000자)
    const summary = errorInfo.fullText.substring(0, 2000);
    const logPath = errorInfo.logPath || SERVER_LOG;

    const [result] = await conn.execute(\`
      INSERT INTO bugs (
        title, summary, status, log_path,
        created_at, updated_at, assigned_to, metadata
      ) VALUES (?, ?, ?, ?, NOW(), NOW(), ?, ?)
    \`, [
      title,
      summary,
      'open',
      logPath,
      'auto',
      JSON.stringify({
        type: 'runtime-error',
        source: 'log-monitor',
        error_type: errorInfo.type,
        stack: errorInfo.stack,
        timestamp: errorInfo.timestamp,
        log_file: logPath
      })
    ]);

    const bugId = formatBugId(result.insertId);
    console.log(\`✅ 버그 등록: \${bugId} - \${title}\`);
    return bugId;
  } finally {
    await conn.end();
  }
}`;

// 한 줄로 압축된 코드 찾기
const singleLineCode = content.match(/\/\*\* \* 숫자 ID를 BTS-.*?finally \{    await conn\.end\(\);  \}\}/);

if (singleLineCode) {
  content = content.replace(singleLineCode[0], newCode);
  fs.writeFileSync(filePath, content);
  console.log('log-monitor.js registerBug 함수 수정 완료');
} else {
  console.log('수정할 코드를 찾지 못했습니다. 직접 확인 필요.');
}
