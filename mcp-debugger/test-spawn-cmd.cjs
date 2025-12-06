const WORKER_COMMANDS = [
  { name: 'claude-1', cmd: 'claude', args: ['--dangerously-skip-permissions'], limit: 1 },
];

const bug = {
  id: 3016,
  title: 'spawning-pool 스폰 명령어에서 auto-worker 제거',
  summary: '현재 문제: 스폰 명령어에 auto-worker가 포함됨. 수정 필요: auto-worker 제거'
};

const workerCfg = WORKER_COMMANDS[0];
const btsId = `BTS-${bug.id}`;
const summaryText = (bug.summary || '').substring(0, 300);
const rawMsg = `${btsId} ${bug.title || ''}\n\n${summaryText}`;
const msg = rawMsg
  .replace(/\\n/g, ' ')
  .replace(/[\r\n]+/g, ' ')
  .replace(/["'`]/g, '')
  .replace(/\s+/g, ' ')
  .trim()
  .substring(0, 500);

const finalArgs = [...workerCfg.args, msg];
const quotedArgs = finalArgs.map(a => (/\s/.test(a) ? `"${a}"` : a)).join(' ');
const commandLine = `${workerCfg.cmd} ${quotedArgs}`.trim();

console.log('=== 생성된 명령어 ===');
console.log(commandLine);
console.log('');
console.log('=== 이전 (auto-worker 포함) ===');
console.log('claude --dangerously-skip-permissions auto-worker "BTS-3016 ..."');
console.log('');
console.log('=== 현재 (auto-worker 제거 + summary 포함) ===');
console.log(commandLine);
