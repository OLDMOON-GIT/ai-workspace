import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

type BugRecord = {
  id: string;
  title: string;
  summary?: string;
  status: string;
  type?: string;
  log_path?: string | null;
  screenshot_path?: string | null;
  video_path?: string | null;
  trace_path?: string | null;
  resolution_note?: string | null;
  created_at?: string;
  updated_at?: string;
  assigned_to?: string | null;
  metadata?: any;
};

function resolveBugDbPath() {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  // mcp-debugger/dist/... -> go up two levels to workspace root
  return path.resolve(__dirname, '..', '..', 'automation', 'bug-db.js');
}

async function loadBugDb() {
  const bugDbPath = process.env.BUG_DB_PATH || resolveBugDbPath();
  try {
    // BTS-2996: Windows 경로를 file:// URL로 변환하여 ESM 로더 호환
    const importPath = pathToFileURL(bugDbPath).href;
    const mod = await import(importPath);
    return mod;
  } catch (error: any) {
    throw new Error(`bug-db.js 로드 실패 (${bugDbPath}): ${error.message}`);
  }
}

export async function bugList(status: string = 'open', limit: number = 20): Promise<BugRecord[]> {
  const { listBugs } = await loadBugDb();
  return listBugs(status, limit);
}

export async function bugClaim(workerId: string): Promise<BugRecord | null> {
  const { claimBug } = await loadBugDb();
  return claimBug(workerId);
}

export async function bugUpdate(id: string, workerId: string, status: string, note?: string) {
  const { updateBugStatus } = await loadBugDb();
  return updateBugStatus(id, workerId, status, note);
}

export async function bugCreate(input: {
  title: string;
  summary?: string;
  logPath?: string;
  screenshotPath?: string;
  videoPath?: string;
  tracePath?: string;
  metadata?: any;
  worker?: string;
}) {
  const { createBug } = await loadBugDb();
  return createBug(input);
}

export function formatBug(bug: BugRecord) {
  return [
    `# ${bug.id} [${bug.status}]`,
    `- Title: ${bug.title}`,
    bug.summary ? `- Summary: ${bug.summary}` : '',
    bug.assigned_to ? `- Assigned: ${bug.assigned_to}` : '- Assigned: (none)',
    bug.created_at ? `- Created: ${bug.created_at}` : '',
    bug.log_path ? `- Log: ${bug.log_path}` : '',
    bug.screenshot_path ? `- Screenshot: ${bug.screenshot_path}` : '',
    bug.video_path ? `- Video: ${bug.video_path}` : '',
    bug.trace_path ? `- Trace: ${bug.trace_path}` : '',
    bug.resolution_note ? `- Resolution: ${bug.resolution_note}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}
