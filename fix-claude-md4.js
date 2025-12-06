const fs = require('fs');
let c = fs.readFileSync('C:/Users/oldmoon/workspace/CLAUDE.md', 'utf8');

// Use \r\n for Windows
const pattern = /(\*\*핵심: 사용자가 아무 말 안해도 자동으로 버그 수정 작업 시작!\*\*)\r?\n\r?\n---\r?\n\r?\n(## 🚨🚨🚨 가장 중요 - 자동 버그\/SPEC 처리 🚨🚨🚨)/;

const replacement = `$1\r\n\r\n### ⚠️⚠️⚠️ BTS 작업 시 진행 중 마킹 필수! ⚠️⚠️⚠️\r\n\r\n**버그/SPEC 작업 시작 전 반드시 status를 'in_progress'로 변경!**\r\n\r\n\`\`\`sql\r\n-- 작업 시작 전 (필수!)\r\nUPDATE bugs SET status = 'in_progress', updated_at = NOW() WHERE id = <bug_id>;\r\n\r\n-- 작업 완료 후\r\nUPDATE bugs SET status = 'resolved', updated_at = NOW() WHERE id = <bug_id>;\r\n\`\`\`\r\n\r\n**이유:**\r\n- 다른 AI 에이전트와 중복 작업 방지\r\n- 현재 작업 상태 추적 가능\r\n- 작업 순서 관리 용이\r\n\r\n---\r\n\r\n$2`;

if (pattern.test(c)) {
  c = c.replace(pattern, replacement);
  fs.writeFileSync('C:/Users/oldmoon/workspace/CLAUDE.md', c);
  console.log('SUCCESS');
} else {
  console.log('FAILED');
}
