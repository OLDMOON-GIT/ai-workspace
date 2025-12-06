const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'notification-worker.cjs');
let content = fs.readFileSync(filePath, 'utf-8');

// Replace getNextBugId function with formatBugId
const oldFunc = `// 다음 버그 ID 가져오기 (bug_sequence 테이블 사용 - race condition 방지)
async function getNextBugId() {
  let connection;
  try {
    connection = await mysql.createConnection(dbConfig);

    // bug_sequence에서 다음 번호 생성 (원자적 연산)
    await connection.execute(\`UPDATE bug_sequence SET next_number = next_number + 1 WHERE id = 1\`);
    const [rows] = await connection.execute(\`SELECT next_number FROM bug_sequence WHERE id = 1\`);

    const nextNum = rows?.[0]?.next_number;
    if (!nextNum) {
      // fallback: 기존 방식
      const [bugRows] = await connection.execute(
        "SELECT id FROM bugs WHERE id LIKE 'BTS-%' ORDER BY id DESC LIMIT 1"
      );
      if (bugRows.length > 0) {
        const lastNum = parseInt(bugRows[0].id.replace('BTS-', ''));
        return \`BTS-\${String(lastNum + 1).padStart(7, '0')}\`;
      }
      return 'BTS-0000001';
    }

    return \`BTS-\${String(nextNum).padStart(7, '0')}\`;
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}`;

const newFunc = `// 숫자 ID를 BTS- 형식 문자열로 변환
function formatBugId(numId) {
  return \`BTS-\${String(numId).padStart(7, '0')}\`;
}`;

if (content.includes('async function getNextBugId()')) {
  content = content.replace(oldFunc, newFunc);

  // Update registerBuildError function to use AUTO_INCREMENT
  content = content.replace(
    `const bugId = await getNextBugId();`,
    `// AUTO_INCREMENT - bugId will be set from insertId`
  );

  content = content.replace(
    `await connection.execute(
      \`INSERT INTO bugs (id, title, summary, status, metadata, created_at, updated_at)
       VALUES (?, ?, ?, 'open', ?, NOW(), NOW())\`,
      [bugId, title, summary, metadata]
    );`,
    `const [insertResult] = await connection.execute(
      \`INSERT INTO bugs (type, title, summary, status, metadata, created_at, updated_at)
       VALUES ('bug', ?, ?, 'open', ?, NOW(), NOW())\`,
      [title, summary, metadata]
    );
    const bugId = formatBugId(insertResult.insertId);`
  );

  // Update getBugs to format id
  content = content.replace(
    `return rows;`,
    `// Format numeric id to BTS- format
    return rows.map(row => ({ ...row, id: formatBugId(row.id) }));`
  );

  fs.writeFileSync(filePath, content, 'utf-8');
  console.log('notification-worker.cjs updated successfully');
} else {
  console.log('getNextBugId function not found or already updated');
}
