/**
 * MCP Debugger Server 실시간 대시보드
 *
 * BTS-0000437: 10초마다 자동 갱신되는 콘솔 대시보드
 * - 버그 현황 (Open/In-Progress/Resolved/Closed 건수)
 * - 최근 등록된 버그 5건 표시
 * - 에러 큐 현황 (대기/처리중/해결)
 * - MCP 도구 호출 통계
 * - 콘솔 clear 후 다시 그리기 방식
 */

import { bugList } from './bug-bridge.js';
import { getErrorStats, getPendingErrors } from './db.js';

// MCP 도구 호출 통계
interface ToolStats {
  totalCalls: number;
  byTool: Record<string, number>;
  lastCall: string | null;
}

const toolStats: ToolStats = {
  totalCalls: 0,
  byTool: {},
  lastCall: null
};

// 도구 호출 기록 함수 (외부에서 호출)
export function recordToolCall(toolName: string): void {
  toolStats.totalCalls++;
  toolStats.byTool[toolName] = (toolStats.byTool[toolName] || 0) + 1;
  toolStats.lastCall = new Date().toLocaleTimeString('ko-KR');
}

// 대시보드 인터벌 참조
let dashboardInterval: NodeJS.Timeout | null = null;

// 대시보드 렌더링
async function renderDashboard(): Promise<void> {
  try {
    // 버그 목록 조회
    const allBugs = await bugList('all', 1000);
    const openBugs = allBugs.filter(b => b.status === 'open');
    const inProgressBugs = allBugs.filter(b => b.status === 'in_progress');
    const resolvedBugs = allBugs.filter(b => b.status === 'resolved');
    const closedBugs = allBugs.filter(b => b.status === 'closed');

    // 최근 등록된 버그 5건
    const recentBugs = [...allBugs]
      .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
      .slice(0, 5);

    // 에러 큐 통계
    const errorStats = getErrorStats();

    // 현재 시간 및 상태
    const now = new Date().toLocaleString('ko-KR');
    const autoClickCount = getAutoClickPointsCount();
    const autoInputLine = autoClickCount > 0
      ? `AutoInput : ON  (${autoClickCount} points)`
      : 'AutoInput : OFF (AUTO_CLICK_POINTS 미설정)';
    const claudeLine = 'Claude Alert : ON (claude --dangerously-skip-permissions)';

    // 콘솔 clear (ANSI escape code)
    process.stderr.write('\x1b[2J\x1b[H');

    // 대시보드 출력
    const output = `
${'═'.repeat(70)}
  MCP DEBUGGER SERVER - REALTIME DASHBOARD
  Updated: ${now}
  ${autoInputLine}
  ${claudeLine}
${'═'.repeat(70)}

  BUG STATUS                          ERROR QUEUE
  ┌────────────────────────────┐      ┌────────────────────────────┐
  │ Open        : ${String(openBugs.length).padStart(6)}        │      │ Pending   : ${String(errorStats.pending).padStart(6)}        │
  │ In Progress : ${String(inProgressBugs.length).padStart(6)}        │      │ Processing: ${String(errorStats.processing).padStart(6)}        │
  │ Resolved    : ${String(resolvedBugs.length).padStart(6)}        │      │ Resolved  : ${String(errorStats.resolved).padStart(6)}        │
  │ Closed      : ${String(closedBugs.length).padStart(6)}        │      │ Ignored   : ${String(errorStats.ignored).padStart(6)}        │
  │ ─────────────────────────  │      │ ─────────────────────────  │
  │ Total       : ${String(allBugs.length).padStart(6)}        │      │ Total     : ${String(errorStats.total).padStart(6)}        │
  └────────────────────────────┘      └────────────────────────────┘

  RECENT BUGS (Last 5)
  ${'─'.repeat(68)}
${recentBugs.map((bug, i) => {
  const statusIcon = {
    'open': '🔴',
    'in_progress': '🟡',
    'resolved': '🟢',
    'closed': '⚪'
  }[bug.status] || '❓';
  const title = bug.title.length > 45 ? bug.title.substring(0, 42) + '...' : bug.title;
  return `  ${statusIcon} ${bug.id} ${title.padEnd(45)} [${bug.type || 'bug'}]`;
}).join('\n') || '  (No bugs registered)'}
  ${'─'.repeat(68)}

  MCP TOOL STATS
  ┌────────────────────────────────────────────────────────────────────┐
  │ Total Calls : ${String(toolStats.totalCalls).padStart(6)}                                               │
  │ Last Call   : ${(toolStats.lastCall || 'N/A').padEnd(52)} │
  │ Top Tools   : ${getTopTools().padEnd(52)} │
  └────────────────────────────────────────────────────────────────────┘

${'═'.repeat(70)}
  Auto-refresh: 10 sec | Press Ctrl+C to stop
${'═'.repeat(70)}
`;

    process.stderr.write(output);
  } catch (error: any) {
    process.stderr.write(`\nDashboard Error: ${error.message}\n`);
  }
}

// 상위 도구 3개 가져오기
function getTopTools(): string {
  const entries = Object.entries(toolStats.byTool)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  if (entries.length === 0) return 'N/A';

  return entries.map(([tool, count]) => `${tool}(${count})`).join(', ');
}

// 대시보드 시작
export function startDashboard(): void {
  if (dashboardInterval) {
    console.error('[Dashboard] Already running');
    return;
  }

  // 초기 렌더링
  renderDashboard();

  // 10초마다 갱신
  dashboardInterval = setInterval(() => {
    renderDashboard();
  }, 10000);

  console.error('[Dashboard] Started (refresh every 10s)');
}

// 대시보드 중지
export function stopDashboard(): void {
  if (dashboardInterval) {
    clearInterval(dashboardInterval);
    dashboardInterval = null;
    console.error('[Dashboard] Stopped');
  }
}

// 대시보드 상태 확인
export function isDashboardRunning(): boolean {
  return dashboardInterval !== null;
}

function getAutoClickPointsCount(): number {
  const raw = process.env.AUTO_CLICK_POINTS;
  if (!raw) return 0;
  return raw
    .split(';')
    .map(p => p.trim())
    .filter(Boolean)
    .length;
}
