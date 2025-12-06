/**
 * automation-scheduler.ts의 모든 인라인 SQL을 추출하는 스크립트
 */

const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'lib', 'automation-scheduler.ts');
const content = fs.readFileSync(filePath, 'utf-8');

const lines = content.split('\n');
const sqlQueries = [];
let currentSql = null;
let inSqlBlock = false;
let braceCount = 0;

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  const trimmed = line.trim();

  // db.prepare(` 패턴 찾기
  if (trimmed.includes('db.prepare(`') || trimmed.includes('await db.prepare(`')) {
    inSqlBlock = true;
    currentSql = {
      lineNumber: i + 1,
      context: lines[i - 2] ? lines[i - 2].trim() : '',
      sqlLines: [],
      fullLine: line
    };

    // 같은 줄에 SQL이 시작되는 경우
    const sqlStart = line.substring(line.indexOf('db.prepare(`') + 12);
    if (sqlStart && !sqlStart.startsWith('UPDATE') && !sqlStart.startsWith('SELECT')) {
      currentSql.sqlLines.push(sqlStart);
    }
    continue;
  }

  // SQL 블록 내부
  if (inSqlBlock && currentSql) {
    // 닫는 백틱 찾기
    if (trimmed.includes('`)')) {
      // 마지막 라인 추가
      const lastLine = line.substring(0, line.indexOf('`)'));
      if (lastLine.trim()) {
        currentSql.sqlLines.push(lastLine);
      }

      // SQL 저장
      const sqlText = currentSql.sqlLines.join('\n').trim();
      if (sqlText.length > 10) { // 의미있는 SQL만
        sqlQueries.push({
          ...currentSql,
          sql: sqlText
        });
      }

      inSqlBlock = false;
      currentSql = null;
    } else {
      // SQL 라인 추가
      currentSql.sqlLines.push(line);
    }
  }
}

// 결과 출력
console.log(`Found ${sqlQueries.length} SQL queries\n`);

sqlQueries.forEach((query, index) => {
  console.log(`\n=== SQL ${index + 1} (Line ${query.lineNumber}) ===`);
  console.log(`Context: ${query.context}`);
  console.log(`SQL:\n${query.sql}`);
  console.log('---');
});

// SQL 파일로 저장
let sqlFileContent = '-- ============================================================\n';
sqlFileContent += '-- Automation Scheduler SQL Queries (Auto-extracted)\n';
sqlFileContent += '-- ============================================================\n\n';

sqlQueries.forEach((query, index) => {
  const sqlId = `query_${index + 1}_line_${query.lineNumber}`;
  sqlFileContent += `-- @sqlId: ${sqlId}\n`;
  sqlFileContent += `-- Context: ${query.context}\n`;
  sqlFileContent += query.sql + '\n\n';
});

const outputPath = path.join(__dirname, 'sql', 'scheduler-extracted.sql');
fs.writeFileSync(outputPath, sqlFileContent, 'utf-8');
console.log(`\n✅ SQL queries saved to: ${outputPath}`);
console.log(`Total queries: ${sqlQueries.length}`);
