const fs = require('fs');

const path = 'src/index.ts';
let content = fs.readFileSync(path, 'utf-8');

const newCode = `// 대시보드 상태
let dashboardInterval: NodeJS.Timeout | null = null;
let toolCallStats: Record<string, number> = {};
let lastToolCall: { name: string; time: Date } | null = null;

function recordToolCall(toolName: string) {
  toolCallStats[toolName] = (toolCallStats[toolName] || 0) + 1;
  lastToolCall = { name: toolName, time: new Date() };
}

async function renderDashboard() {
  try {
    const allBugs = await bugList('all', 1000);
    const stats = getErrorStats();

    const openBugs = allBugs.filter(b => b.status === 'open');
    const inProgressBugs = allBugs.filter(b => b.status === 'in_progress' || b.status === 'in-progress');
    const resolvedBugs = allBugs.filter(b => b.status === 'resolved');
    const closedBugs = allBugs.filter(b => b.status === 'closed');
    const bugCount = allBugs.filter(b => b.type === 'bug' || !b.type).length;
    const specCount = allBugs.filter(b => b.type === 'spec').length;

    const now = new Date();
    const timeStr = now.toLocaleTimeString('ko-KR', { hour12: false });
    const dateStr = now.toLocaleDateString('ko-KR');

    console.error('\\x1B[2J\\x1B[H');
    console.error(\`╔══════════════════════════════════════════════════════════════════╗\`);
    console.error(\`║         🔧 MCP Debugger Server v1.0.0 - Live Dashboard          ║\`);
    console.error(\`║                    \${dateStr} \${timeStr}                     ║\`);
    console.error(\`╠══════════════════════════════════════════════════════════════════╣\`);
    console.error(\`║  📊 버그 현황                                                    ║\`);
    console.error(\`║  ┌─────────────┬─────────────┬─────────────┬─────────────┐       ║\`);
    console.error(\`║  │ 🔴 Open    │ 🟡 Progress │ ✅ Resolved│ ⬜ Closed  │       ║\`);
    console.error(\`║  │    \${String(openBugs.length).padStart(3)}      │     \${String(inProgressBugs.length).padStart(3)}     │     \${String(resolvedBugs.length).padStart(3)}    │    \${String(closedBugs.length).padStart(3)}     │       ║\`);
    console.error(\`║  └─────────────┴─────────────┴─────────────┴─────────────┘       ║\`);
    console.error(\`║  📝 Bug: \${String(bugCount).padStart(3)}건 | 📋 Spec: \${String(specCount).padStart(3)}건                                  ║\`);
    console.error(\`╠══════════════════════════════════════════════════════════════════╣\`);
    console.error(\`║  ⚡ 에러 큐: 대기 \${String(stats.pending).padStart(3)} | 처리중 \${String(stats.processing).padStart(3)} | 해결 \${String(stats.resolved).padStart(3)} | 무시 \${String(stats.ignored).padStart(3)}    ║\`);
    console.error(\`╠══════════════════════════════════════════════════════════════════╣\`);
    console.error(\`║  🚨 미해결 버그 (최근 5건)                                       ║\`);
    if (openBugs.length === 0) {
      console.error(\`║     ✨ 모든 버그가 처리되었습니다!                               ║\`);
    } else {
      for (const bug of openBugs.slice(0, 5)) {
        const icon = bug.type === 'spec' ? '📋' : '🐛';
        const title = (bug.title || '').substring(0, 40).padEnd(40);
        console.error(\`║     \${icon} \${bug.id} \${title}   ║\`);
      }
      if (openBugs.length > 5) {
        console.error(\`║     ... 외 \${String(openBugs.length - 5).padStart(2)}건 더 있음                                       ║\`);
      }
    }
    console.error(\`╠══════════════════════════════════════════════════════════════════╣\`);
    console.error(\`║  🔨 MCP 도구 호출                                                ║\`);
    const totalCalls = Object.values(toolCallStats).reduce((a, b) => a + b, 0);
    if (totalCalls === 0) {
      console.error(\`║     (아직 호출 없음)                                             ║\`);
    } else {
      const topTools = Object.entries(toolCallStats).sort((a, b) => b[1] - a[1]).slice(0, 3);
      for (const [tool, count] of topTools) {
        console.error(\`║     \${tool.padEnd(20)}: \${String(count).padStart(4)}회                              ║\`);
      }
    }
    if (lastToolCall) {
      const elapsed = Math.floor((Date.now() - lastToolCall.time.getTime()) / 1000);
      const info = \`\${lastToolCall.name} (\${elapsed}초 전)\`.substring(0, 42).padEnd(42);
      console.error(\`║     마지막: \${info}       ║\`);
    }
    console.error(\`╠══════════════════════════════════════════════════════════════════╣\`);
    console.error(\`║  💡 http://localhost:2000/admin/bugs  🔄 10초마다 갱신           ║\`);
    console.error(\`╚══════════════════════════════════════════════════════════════════╝\`);
  } catch (error: any) {
    console.error(\`[Dashboard Error] \${error.message}\`);
  }
}

async function main() {
  const homeDir = process.env.HOME || process.env.USERPROFILE || '~';
  console.error(\`
╔════════════════════════════════════════════════════════════╗
║              MCP Debugger Server v1.0.0                   ║
╚════════════════════════════════════════════════════════════╝
\`);
  console.error(\`[1/3] SQLite DB: \${homeDir}\\.mcp-debugger\\error-queue.db\`);
  console.error(\`[2/3] MySQL 연결 테스트...\`);
  try {
    await bugList('all', 1);
    console.error(\`      ✅ MySQL 연결 성공\`);
  } catch (error: any) {
    console.error(\`      ❌ MySQL 연결 실패: \${error.message}\`);
  }
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(\`[3/3] MCP Tools 26개 등록 완료\`);
  console.error(\`\\n✅ 서버 준비 완료! 3초 후 대시보드 시작...\\n\`);
  setTimeout(() => {
    renderDashboard();
    dashboardInterval = setInterval(renderDashboard, 10000);
  }, 3000);
}

main().catch(console.error);`;

// 교체
const startMarker = '// 서버 시작';
const idx = content.indexOf(startMarker);
if (idx !== -1) {
  content = content.substring(0, idx) + newCode;
  fs.writeFileSync(path, content, 'utf-8');
  console.log('Updated successfully');
} else {
  console.log('Marker not found');
}
