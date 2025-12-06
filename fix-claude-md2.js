const fs = require('fs');
let c = fs.readFileSync('C:/Users/oldmoon/workspace/CLAUDE.md', 'utf8');

const oldText = `**핵심: 사용자가 아무 말 안해도 자동으로 버그 수정 작업 시작!**

---

## 🚨🚨🚨 가장 중요 - 자동 버그/SPEC 처리 🚨🚨🚨

**Claude 시작 시 할 일이 없으면 자동으로 버그 수정과 SPEC 구현을 진행한다!**`;

const newText = `**핵심: 사용자가 아무 말 안해도 자동으로 버그 수정 작업 시작!**

### ⚠️⚠️⚠️ BTS 작업 시 진행 중 마킹 필수! ⚠️⚠️⚠️

**버그/SPEC 작업 시작 전 반드시 status를 'in_progress'로 변경!**

\`\`\`sql
-- 작업 시작 전 (필수!)
UPDATE bugs SET status = 'in_progress', updated_at = NOW() WHERE id = <bug_id>;

-- 작업 완료 후
UPDATE bugs SET status = 'resolved', updated_at = NOW() WHERE id = <bug_id>;
\`\`\`

**이유:**
- 다른 AI 에이전트와 중복 작업 방지
- 현재 작업 상태 추적 가능
- 작업 순서 관리 용이

---

## 🚨🚨🚨 가장 중요 - 자동 버그/SPEC 처리 🚨🚨🚨

**Claude 시작 시 할 일이 없으면 자동으로 버그 수정과 SPEC 구현을 진행한다!**`;

if (c.includes(oldText)) {
  c = c.replace(oldText, newText);
  fs.writeFileSync('C:/Users/oldmoon/workspace/CLAUDE.md', c);
  console.log('SUCCESS');
} else {
  console.log('FAILED - searching for pattern...');
  // Find the exact pattern
  const idx = c.indexOf('**핵심: 사용자가 아무 말 안해도');
  console.log('Index found:', idx);
  if (idx !== -1) {
    console.log('Context:', c.substring(idx, idx + 200));
  }
}
