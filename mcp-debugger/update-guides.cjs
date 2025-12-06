#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const basePath = 'C:/Users/oldmoon/workspace';
const content = fs.readFileSync(path.join(basePath, 'CODEX.md'), 'utf8');

const oldText = `### ⛔⛔⛔ 버그 작업 시작 시 진행 중 마킹 필수! ⛔⛔⛔

**버그 작업 시작 전 반드시 \`assigned_to\`에 본인 표시!**
- 여러 Claude CLI가 동시에 실행될 수 있음
- 같은 버그를 중복 수정하면 충돌 발생!
- **작업 시작 전 반드시 마킹하고, 이미 마킹된 버그는 건너뛰기**

\`\`\`sql
-- 1. 버그 가져올 때 assigned_to가 NULL인 것만 선택
SELECT id, title, status FROM bugs
WHERE status = 'open' AND assigned_to IS NULL
ORDER BY priority ASC, created_at ASC;

-- 2. 작업 시작 전 즉시 마킹 (Claude-{세션ID} 또는 Claude-1, Claude-2 등)
UPDATE bugs SET assigned_to = 'Claude-1', updated_at = NOW() WHERE id = 2985;

-- 3. 작업 완료 시 resolved 처리
UPDATE bugs SET status = 'resolved', assigned_to = NULL, updated_at = NOW() WHERE id = 2985;
\`\`\`

**핵심: assigned_to가 있는 버그는 다른 CLI가 작업 중이므로 절대 손대지 마!**`;

const newText = `### ⛔⛔⛔ 버그 작업 시작 시 진행 중 마킹 필수! ⛔⛔⛔

**버그 작업 시작 전 반드시 \`assigned_to\`에 본인 표시!**
- 여러 Claude CLI가 동시에 실행될 수 있음
- 같은 버그를 중복 수정하면 충돌 발생!
- **작업 시작 전 반드시 마킹하고, 이미 마킹된 버그는 건너뛰기**

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

\`\`\`sql
-- 1. 버그 가져올 때 assigned_to가 NULL인 것만 선택
SELECT id, title, status FROM bugs
WHERE status = 'open' AND assigned_to IS NULL
ORDER BY priority ASC, created_at ASC;

-- 2. 작업 시작 전 즉시 마킹 (에이전트-PID 또는 worker-해시 형식)
UPDATE bugs SET assigned_to = 'worker-a1b2c3d4', status = 'in_progress', updated_at = NOW() WHERE id = 2985;

-- 3. 작업 완료 시 resolved 처리
UPDATE bugs SET status = 'resolved', assigned_to = NULL, updated_at = NOW() WHERE id = 2985;
\`\`\`

**핵심: assigned_to가 있는 버그는 다른 CLI가 작업 중이므로 절대 손대지 마!**`;

const updated = content.replace(oldText, newText);

if (updated === content) {
  console.log('변경할 내용이 없습니다. 이미 업데이트되었거나 패턴이 맞지 않습니다.');
} else {
  fs.writeFileSync(path.join(basePath, 'CLAUDE.md'), updated, 'utf8');
  fs.writeFileSync(path.join(basePath, 'CODEX.md'), updated, 'utf8');
  fs.writeFileSync(path.join(basePath, 'GEMINI.md'), updated, 'utf8');
  console.log('CLAUDE.md, CODEX.md, GEMINI.md 업데이트 완료');
}
