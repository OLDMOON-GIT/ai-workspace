/**
 * One-command runner:
 * 1) run UI health check (Playwright)
 * 2) list open/in_progress bugs (MySQL)
 * 3) (옵션) @디버깅 / --claim 으로 버그 하나 자동 할당
 * Usage:
 *   node automation/auto-suite.js --url http://localhost:3000 --name smoke --worker cli
 *   node automation/auto-suite.js @디버깅 --worker cli   # UI 체크 + bug.claim
 */
const { spawnSync } = require('child_process');
const path = require('path');

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

function run(cmd, args, options = {}) {
  const result = spawnSync(cmd, args, { stdio: 'inherit', ...options });
  return result.status === 0;
}

function main() {
  const args = parseArgs();
  const url = args.url || process.env.UI_TEST_URL || 'http://localhost:3000';
  const name = args.name || 'smoke';
  const worker = args.worker || process.env.BUG_WORKER || 'auto';
  const shouldClaim = args.claim || args.debug || (args._ || []).includes('@디버깅');

  console.log('=== UI 체크 시작 ===');
  const uiOk = run('node', [
    path.join(__dirname, 'run-ui-check.js'),
    '--url',
    url,
    '--name',
    name,
    '--worker',
    worker
  ]);

  console.log('\n=== 버그 현황 ===');
  run('node', [path.join(__dirname, 'bug-worker.js'), 'list', '--status', 'all', '--limit', '20']);

  if (shouldClaim) {
    console.log('\n=== @디버깅: bug.claim ===');
    const claimed = run('node', [
      path.join(__dirname, 'bug-worker.js'),
      'claim',
      '--worker',
      worker
    ]);

    if (!claimed) {
      console.log('⚠️ 열려 있는 버그가 없거나 할당에 실패했습니다.');
    }
  }

  if (!uiOk) {
    console.log('\n⚠️ UI 체크 실패. 위 목록의 최신 BUG ID 확인 후 처리하세요.');
  } else {
    console.log('\n✅ UI 체크 성공. 열려 있는 버그만 정리하면 됩니다.');
  }
}

main();
