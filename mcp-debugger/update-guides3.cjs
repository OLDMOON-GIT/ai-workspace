#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const basePath = 'C:/Users/oldmoon/workspace';

// 새로 삽입할 PID 형식 규칙 섹션 (LF만 사용)
const pidRuleSection = `
### 🔑 assigned_to 형식 규칙 (PID 사용)

**형식: \`{에이전트}-{PID}\` 또는 \`worker-{해시}\` (예: Claude-12345, worker-a1b2c3d4)**

- **PID 사용 이유**: 동일 에이전트가 여러 인스턴스로 실행될 수 있음
- **고유 식별**: PID로 정확히 어떤 프로세스가 작업 중인지 식별
- **충돌 방지**: 같은 에이전트라도 다른 PID면 다른 작업자로 인식

\`\`\`javascript
// Node.js에서 워커 ID 생성 (PID 기반 해시)
const crypto = require('crypto');
const os = require('os');
function getWorkerId() {
  const hostname = os.hostname();
  const username = os.userInfo().username;
  const pid = process.pid;
  const shortId = crypto.createHash('md5')
    .update(\`\${hostname}-\${username}-\${pid}\`)
    .digest('hex').substring(0, 8);
  return \`worker-\${shortId}\`;  // 예: worker-a1b2c3d4
}

// 또는 단순하게
const workerId = \`Claude-\${process.pid}\`;  // 예: Claude-12345
\`\`\`
`;

// 각 파일 업데이트
['CLAUDE.md', 'CODEX.md', 'GEMINI.md'].forEach(filename => {
  const filePath = path.join(basePath, filename);
  let content = fs.readFileSync(filePath, 'utf8');

  // CRLF를 LF로 정규화
  content = content.replace(/\r\n/g, '\n');

  // 이미 PID 규칙이 있는지 확인
  if (content.includes('assigned_to 형식 규칙 (PID 사용)')) {
    console.log(`${filename}: 이미 PID 규칙이 포함되어 있음 - 건너뛰기`);
    return;
  }

  // 삽입 지점: "- **작업 시작 전 반드시 마킹하고" 다음 줄
  const insertAfter = '- **작업 시작 전 반드시 마킹하고, 이미 마킹된 버그는 건너뛰기**';
  const insertBefore = '```sql\n-- 1. 버그 가져올 때';

  if (content.includes(insertAfter) && content.includes(insertBefore)) {
    // 기존 SQL 블록을 새 버전으로 교체
    const oldSql = `\`\`\`sql
-- 1. 버그 가져올 때 assigned_to가 NULL인 것만 선택
SELECT id, title, status FROM bugs
WHERE status = 'open' AND assigned_to IS NULL
ORDER BY priority ASC, created_at ASC;

-- 2. 작업 시작 전 즉시 마킹 (Claude-{세션ID} 또는 Claude-1, Claude-2 등)
UPDATE bugs SET assigned_to = 'Claude-1', updated_at = NOW() WHERE id = 2985;

-- 3. 작업 완료 시 resolved 처리
UPDATE bugs SET status = 'resolved', assigned_to = NULL, updated_at = NOW() WHERE id = 2985;
\`\`\``;

    const newSql = `\`\`\`sql
-- 1. 버그 가져올 때 assigned_to가 NULL인 것만 선택
SELECT id, title, status FROM bugs
WHERE status = 'open' AND assigned_to IS NULL
ORDER BY priority ASC, created_at ASC;

-- 2. 작업 시작 전 즉시 마킹 (에이전트-PID 또는 worker-해시 형식)
UPDATE bugs SET assigned_to = 'worker-a1b2c3d4', status = 'in_progress', updated_at = NOW() WHERE id = 2985;

-- 3. 작업 완료 시 resolved 처리
UPDATE bugs SET status = 'resolved', assigned_to = NULL, updated_at = NOW() WHERE id = 2985;
\`\`\``;

    content = content.replace(insertAfter + '\n\n' + oldSql, insertAfter + pidRuleSection + newSql);
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`${filename}: PID 규칙 섹션 추가 완료`);
  } else {
    console.log(`${filename}: 삽입 지점을 찾을 수 없음 - 수동 확인 필요`);
    // 디버깅용
    console.log('  insertAfter 존재:', content.includes(insertAfter));
    console.log('  insertBefore 존재:', content.includes(insertBefore));
  }
});
