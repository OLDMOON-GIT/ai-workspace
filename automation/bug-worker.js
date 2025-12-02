const { claimBug, updateBugStatus, listBugs, getBug, closePool } = require('./bug-db');

function parseArgs() {
  const args = process.argv.slice(2);
  const parsed = { _: [] };

  for (let i = 0; i < args.length; i++) {
    const current = args[i];
    if (current.startsWith('--')) {
      const key = current.replace(/^--/, '');
      const value = args[i + 1] && !args[i + 1].startsWith('--') ? args[++i] : true;
      parsed[key] = value;
    } else {
      parsed._.push(current);
    }
  }
  return parsed;
}

function printBug(bug) {
  console.log(
    [
      `- ${bug.id}`,
      `  status: ${bug.status}`,
      `  title: ${bug.title}`,
      `  assigned: ${bug.assigned_to || '(unassigned)'}`,
      `  created: ${bug.created_at}`,
      `  updated: ${bug.updated_at}`,
      `  log: ${bug.log_path || 'n/a'}`,
      `  screenshot: ${bug.screenshot_path || 'n/a'}`,
      `  video: ${bug.video_path || 'n/a'}`,
      `  trace: ${bug.trace_path || 'n/a'}`,
      `  summary: ${bug.summary || ''}`
    ].join('\n')
  );
}

function usage() {
  console.log(`
Usage:
  node automation/bug-worker.js list [--status open|in_progress|resolved|closed|all] [--limit 10]
  node automation/bug-worker.js claim --worker worker-1
  node automation/bug-worker.js resolve <bugId> --worker worker-1 [--note "fixed in ..."]
  node automation/bug-worker.js close <bugId> --worker worker-1 [--note "won't fix"]
  node automation/bug-worker.js show <bugId>
  `.trim());
}

async function main() {
  const args = parseArgs();
  const cmd = args._[0];
  const worker = args.worker || process.env.BUG_WORKER || 'cli-worker';
  let exitCode = 0;

  if (!cmd) {
    usage();
    return 1;
  }

  if (cmd === 'list') {
    const status = args.status || 'open';
    const limit = Number(args.limit || 10);
    const rows = await listBugs(status, limit);
    if (rows.length === 0) {
      console.log(`No bugs found (status=${status})`);
      return 0;
    }
    rows.forEach((bug) => printBug(bug));
    return 0;
  }

  if (cmd === 'claim') {
    const bug = await claimBug(worker);
    if (!bug) {
      console.log('No open bugs to claim');
      return 1;
    }
    console.log(`Claimed ${bug.id} for ${worker}`);
    printBug(bug);
    return 0;
  }

  if (cmd === 'resolve' || cmd === 'close') {
    const bugId = args._[1];
    if (!bugId) {
      console.error('Bug ID is required');
      return 1;
    }
    const status = cmd === 'resolve' ? 'resolved' : 'closed';
    const result = await updateBugStatus(bugId, worker, status, args.note);
    if (!result.ok) {
      console.error(`Failed to update ${bugId}: ${result.reason}`);
      return 1;
    }
    console.log(`Updated ${bugId} -> ${status} (worker=${worker})`);
    printBug(result.bug);
    return 0;
  }

  if (cmd === 'show') {
    const bugId = args._[1];
    if (!bugId) {
      console.error('Bug ID is required');
      return 1;
    }
    const bug = await getBug(bugId);
    if (!bug) {
      console.error(`Bug not found: ${bugId}`);
      return 1;
    }
    printBug(bug);
    return 0;
  }

  usage();
  exitCode = 1;
  return exitCode;
}

main()
  .then(async (code = 0) => {
    await closePool();
    process.exit(code);
  })
  .catch(async (error) => {
    console.error(error);
    await closePool();
    process.exit(1);
  });
