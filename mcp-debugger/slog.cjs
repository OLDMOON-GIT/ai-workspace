#!/usr/bin/env node
/**
 * slog - Spawning Pool Worker Log Viewer
 * BTS-3069: 워커별 로그 파일 확인 도구
 * BTS-3104: --follow 모드 추가 (모든 로그 실시간 감시)
 * BTS-3106: 인자 없이 실행 시 전체 로그 출력 (Python 버전과 동일)
 *
 * 사용법:
 *   node slog.cjs               # 전체 로그 내용 출력
 *   node slog.cjs BTS-3060      # 특정 버그 로그 확인
 *   node slog.cjs 3060          # BTS- 접두사 생략 가능
 *   node slog.cjs --list        # 모든 로그 파일 목록
 *   node slog.cjs --recent      # 최근 수정된 로그 10개
 *   node slog.cjs --tail 3060   # 특정 버그 로그 실시간 확인 (tail -f)
 *   node slog.cjs -f, --follow  # 모든 로그 실시간 감시 (tail -f 전역)
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const LOGS_DIR = path.join(__dirname, 'logs');

function printUsage() {
  console.log(`
slog - Spawning Pool Worker Log Viewer

사용법:
  node slog.cjs               전체 로그 내용 출력
  node slog.cjs <bug_id>      특정 버그의 로그 확인
  node slog.cjs --list        모든 로그 파일 목록
  node slog.cjs --recent [n]  최근 수정된 로그 n개 (기본: 10)
  node slog.cjs --tail <id>   로그 실시간 확인 (tail -f)
  node slog.cjs --follow      모든 로그 실시간 append 모드 (전역 감시)
  node slog.cjs -f            --follow 단축키
  node slog.cjs --clean [days] n일 이상 된 로그 삭제 (기본: 7일)

예시:
  node slog.cjs               전체 로그 출력
  node slog.cjs BTS-3060      BTS-3060 로그 확인
  node slog.cjs 3060          같은 결과
  node slog.cjs --recent 5    최근 5개 로그 확인
  node slog.cjs --tail 3060   BTS-3060 로그 실시간 감시
  node slog.cjs --follow      모든 워커 로그 실시간 감시
`);
}

function parseBugId(input) {
  if (!input) return null;
  // BTS-3060 또는 3060 형식 모두 지원
  const match = input.match(/(?:BTS-)?(\d+)/i);
  return match ? match[1] : null;
}

function getLogPath(bugId) {
  return path.join(LOGS_DIR, `worker-${bugId}.log`);
}

function listAllLogs() {
  if (!fs.existsSync(LOGS_DIR)) {
    console.log('로그 디렉토리가 없습니다:', LOGS_DIR);
    return;
  }

  const files = fs.readdirSync(LOGS_DIR)
    .filter(f => f.startsWith('worker-') && f.endsWith('.log'))
    .map(f => {
      const filePath = path.join(LOGS_DIR, f);
      const stats = fs.statSync(filePath);
      const bugId = f.replace('worker-', '').replace('.log', '');
      return {
        name: f,
        bugId,
        size: stats.size,
        mtime: stats.mtime
      };
    })
    .sort((a, b) => b.mtime - a.mtime);

  if (files.length === 0) {
    console.log('로그 파일이 없습니다.');
    return;
  }

  console.log(`\n총 ${files.length}개의 로그 파일:\n`);
  console.log('BTS ID\t\t크기\t\t최종 수정');
  console.log('-'.repeat(60));

  for (const file of files) {
    const sizeKB = (file.size / 1024).toFixed(1) + ' KB';
    const timeStr = file.mtime.toLocaleString('ko-KR');
    console.log(`BTS-${file.bugId}\t\t${sizeKB}\t\t${timeStr}`);
  }
}

/**
 * BTS-3106: 전체 로그 파일 내용 출력 (Python 버전의 show_all_logs와 동일)
 */
function showAllLogs() {
  if (!fs.existsSync(LOGS_DIR)) {
    console.log('로그 디렉토리가 없습니다:', LOGS_DIR);
    return;
  }

  const files = fs.readdirSync(LOGS_DIR)
    .filter(f => f.startsWith('worker-') && f.endsWith('.log'))
    .map(f => {
      const filePath = path.join(LOGS_DIR, f);
      const stats = fs.statSync(filePath);
      const bugId = f.replace('worker-', '').replace('.log', '');
      return {
        name: f,
        bugId,
        size: stats.size,
        mtime: stats.mtime,
        path: filePath
      };
    })
    .sort((a, b) => b.mtime - a.mtime);

  if (files.length === 0) {
    console.log('로그 파일이 없습니다.');
    console.log(`로그 디렉토리: ${LOGS_DIR}`);
    return;
  }

  console.log(`\n=== Spawning Pool 전체 로그 (${files.length}개 파일) ===\n`);

  for (const file of files) {
    const timeStr = file.mtime.toLocaleString('ko-KR');

    console.log('\n' + '='.repeat(60));
    console.log(`BTS-${file.bugId} (${timeStr}, ${file.size} bytes)`);
    console.log('='.repeat(60) + '\n');

    try {
      const content = fs.readFileSync(file.path, 'utf-8');
      console.log(content);
    } catch (e) {
      console.log('(읽기 실패)');
    }
  }

  console.log(`\n=== 전체 로그 끝 (${files.length}개 파일) ===`);
}

function listRecentLogs(count = 10) {
  if (!fs.existsSync(LOGS_DIR)) {
    console.log('로그 디렉토리가 없습니다.');
    return;
  }

  const files = fs.readdirSync(LOGS_DIR)
    .filter(f => f.startsWith('worker-') && f.endsWith('.log'))
    .map(f => {
      const filePath = path.join(LOGS_DIR, f);
      const stats = fs.statSync(filePath);
      const bugId = f.replace('worker-', '').replace('.log', '');
      return {
        name: f,
        bugId,
        size: stats.size,
        mtime: stats.mtime,
        path: filePath
      };
    })
    .sort((a, b) => b.mtime - a.mtime)
    .slice(0, count);

  if (files.length === 0) {
    console.log('로그 파일이 없습니다.');
    return;
  }

  console.log(`\n최근 수정된 ${files.length}개의 로그:\n`);

  for (const file of files) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`BTS-${file.bugId} (${file.mtime.toLocaleString('ko-KR')})`);
    console.log('='.repeat(60));

    // 마지막 20줄만 출력
    try {
      const content = fs.readFileSync(file.path, 'utf-8');
      const lines = content.split('\n').filter(l => l.trim());
      const lastLines = lines.slice(-20);
      console.log(lastLines.join('\n'));
    } catch (e) {
      console.log('(읽기 실패)');
    }
  }
}

function viewLog(bugId) {
  const logPath = getLogPath(bugId);

  if (!fs.existsSync(logPath)) {
    console.log(`로그 파일이 없습니다: ${logPath}`);
    console.log(`BTS-${bugId}의 작업 로그가 아직 생성되지 않았습니다.`);
    return;
  }

  const stats = fs.statSync(logPath);
  console.log(`\n${'='.repeat(60)}`);
  console.log(`BTS-${bugId} 로그`);
  console.log(`파일: ${logPath}`);
  console.log(`크기: ${(stats.size / 1024).toFixed(1)} KB`);
  console.log(`수정: ${stats.mtime.toLocaleString('ko-KR')}`);
  console.log('='.repeat(60) + '\n');

  const content = fs.readFileSync(logPath, 'utf-8');
  console.log(content);
}

function tailLog(bugId) {
  const logPath = getLogPath(bugId);

  if (!fs.existsSync(logPath)) {
    console.log(`로그 파일이 없습니다: ${logPath}`);
    console.log('파일이 생성되면 자동으로 감시를 시작합니다...');
  }

  console.log(`BTS-${bugId} 로그 실시간 감시 중... (Ctrl+C로 종료)\n`);

  // Windows에서는 PowerShell의 Get-Content -Wait 사용
  const isWindows = process.platform === 'win32';

  if (isWindows) {
    const ps = spawn('powershell', [
      '-Command',
      `Get-Content -Path "${logPath}" -Wait -Tail 50`
    ], { stdio: 'inherit' });

    ps.on('error', (err) => {
      console.error('tail 실행 실패:', err.message);
    });
  } else {
    const tail = spawn('tail', ['-f', '-n', '50', logPath], { stdio: 'inherit' });
    tail.on('error', (err) => {
      console.error('tail 실행 실패:', err.message);
    });
  }
}

/**
 * BTS-3104: 모든 로그 파일을 실시간으로 감시 (tail -f 전역)
 * 새 로그 파일 생성 시 자동으로 감시 추가
 */
function followAllLogs() {
  if (!fs.existsSync(LOGS_DIR)) {
    console.log('로그 디렉토리가 없습니다:', LOGS_DIR);
    console.log('디렉토리 생성 후 대기 중...');
    fs.mkdirSync(LOGS_DIR, { recursive: true });
  }

  console.log('='.repeat(60));
  console.log('slog --follow: 모든 워커 로그 실시간 감시');
  console.log('로그 디렉토리:', LOGS_DIR);
  console.log('Ctrl+C로 종료');
  console.log('='.repeat(60) + '\n');

  // 각 파일별 읽은 위치 추적
  const filePositions = new Map();
  const watchers = new Map();

  // 로그 출력 함수 (BTS ID 포함)
  function outputLog(bugId, content) {
    const timestamp = new Date().toLocaleTimeString('ko-KR');
    const lines = content.split('\n').filter(l => l.trim());
    for (const line of lines) {
      console.log(`[${timestamp}] [BTS-${bugId}] ${line}`);
    }
  }

  // 파일 변경 감시 시작
  function watchFile(filePath, bugId) {
    if (watchers.has(filePath)) return;

    // 초기 위치 설정 (파일 끝에서 시작)
    try {
      const stats = fs.statSync(filePath);
      filePositions.set(filePath, stats.size);
    } catch (e) {
      filePositions.set(filePath, 0);
    }

    const watcher = fs.watch(filePath, (eventType) => {
      if (eventType === 'change') {
        readNewContent(filePath, bugId);
      }
    });

    watcher.on('error', (err) => {
      console.error(`[ERROR] 파일 감시 실패 (${bugId}):`, err.message);
      watchers.delete(filePath);
    });

    watchers.set(filePath, watcher);
    console.log(`[INFO] 감시 시작: BTS-${bugId}`);
  }

  // 새로 추가된 내용만 읽기
  function readNewContent(filePath, bugId) {
    try {
      const stats = fs.statSync(filePath);
      const currentPos = filePositions.get(filePath) || 0;

      if (stats.size > currentPos) {
        const fd = fs.openSync(filePath, 'r');
        const buffer = Buffer.alloc(stats.size - currentPos);
        fs.readSync(fd, buffer, 0, buffer.length, currentPos);
        fs.closeSync(fd);

        const content = buffer.toString('utf-8');
        if (content.trim()) {
          outputLog(bugId, content);
        }

        filePositions.set(filePath, stats.size);
      }
    } catch (e) {
      // 파일이 삭제되었거나 접근 불가
    }
  }

  // 기존 로그 파일 감시 시작
  function scanAndWatch() {
    try {
      const files = fs.readdirSync(LOGS_DIR)
        .filter(f => f.startsWith('worker-') && f.endsWith('.log'));

      for (const file of files) {
        const filePath = path.join(LOGS_DIR, file);
        const bugId = file.replace('worker-', '').replace('.log', '');
        watchFile(filePath, bugId);
      }
    } catch (e) {
      // 디렉토리 읽기 실패
    }
  }

  // 디렉토리 감시 (새 파일 감지)
  const dirWatcher = fs.watch(LOGS_DIR, (eventType, filename) => {
    if (filename && filename.startsWith('worker-') && filename.endsWith('.log')) {
      const filePath = path.join(LOGS_DIR, filename);
      const bugId = filename.replace('worker-', '').replace('.log', '');

      if (fs.existsSync(filePath) && !watchers.has(filePath)) {
        watchFile(filePath, bugId);
      }
    }
  });

  // 초기 스캔
  scanAndWatch();

  // 주기적으로 새 파일 체크 (1초마다)
  const scanInterval = setInterval(scanAndWatch, 1000);

  // 종료 처리
  process.on('SIGINT', () => {
    console.log('\n[INFO] 감시 종료...');
    clearInterval(scanInterval);
    dirWatcher.close();
    for (const watcher of watchers.values()) {
      watcher.close();
    }
    process.exit(0);
  });
}

function cleanOldLogs(days = 7) {
  if (!fs.existsSync(LOGS_DIR)) {
    console.log('로그 디렉토리가 없습니다.');
    return;
  }

  const cutoff = Date.now() - (days * 24 * 60 * 60 * 1000);
  let deleted = 0;

  const files = fs.readdirSync(LOGS_DIR)
    .filter(f => f.startsWith('worker-') && f.endsWith('.log'));

  for (const file of files) {
    const filePath = path.join(LOGS_DIR, file);
    const stats = fs.statSync(filePath);

    if (stats.mtime.getTime() < cutoff) {
      fs.unlinkSync(filePath);
      console.log(`삭제: ${file}`);
      deleted++;
    }
  }

  console.log(`\n${deleted}개의 오래된 로그 파일 삭제 완료 (${days}일 이상)`);
}

// 메인 실행
const args = process.argv.slice(2);

// BTS-3106: 인자 없으면 전체 로그 출력 (Python 버전과 동일)
if (args.length === 0) {
  showAllLogs();
  process.exit(0);
}

const cmd = args[0];

switch (cmd) {
  case '--help':
  case '-h':
    printUsage();
    break;

  case '--list':
  case '--all':
  case '-a':
    listAllLogs();
    break;

  case '--recent':
  case '-r':
    const count = parseInt(args[1]) || 10;
    listRecentLogs(count);
    break;

  case '--tail':
  case '-t':
    const tailId = parseBugId(args[1]);
    if (!tailId) {
      console.log('버그 ID를 지정하세요: node slog.cjs --tail 3060');
      process.exit(1);
    }
    tailLog(tailId);
    break;

  case '--follow':
  case '-f':
    followAllLogs();
    break;

  case '--clean':
  case '-c':
    const days = parseInt(args[1]) || 7;
    cleanOldLogs(days);
    break;

  default:
    const bugId = parseBugId(cmd);
    if (bugId) {
      viewLog(bugId);
    } else {
      console.log(`알 수 없는 명령: ${cmd}`);
      printUsage();
      process.exit(1);
    }
}
