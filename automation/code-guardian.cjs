#!/usr/bin/env node
/**
 * Code Guardian - 소스 코드 회귀 자동 감지 시스템
 * BTS-3464: 주요 파일의 회귀(롤백) 감지 및 보호
 *
 * 기능:
 * 1. 주요 파일 해시 저장/비교
 * 2. 변경 시 알림 (이메일/BTS 등록)
 * 3. 롤백 감지 시 경고
 * 4. git hooks로 특정 파일 보호
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

// 설정
const CONFIG = {
  workspaceDir: 'C:\\Users\\oldmoon\\workspace',
  hashFile: 'C:\\Users\\oldmoon\\workspace\\automation\\.code-guardian-hashes.json',
  historyFile: 'C:\\Users\\oldmoon\\workspace\\automation\\.code-guardian-history.json',
  maxHistoryEntries: 100,
};

// 보호할 주요 파일 목록
const PROTECTED_FILES = [
  'mcp-debugger/spawning-pool.py',
  'trend-video-frontend/src/lib/mysql.ts',
  'trend-video-frontend/src/app/api/automation/spawn-task/route.ts',
  'trend-video-frontend/src/app/api/automation/settings/route.ts',
  'trend-video-frontend/src/app/api/automation/scheduler/route.ts',
  'automation/log-monitor.js',
  'CLAUDE.md',
  'CODEX.md',
  'GEMINI.md',
];

// 파일 해시 계산
function calculateHash(filePath) {
  try {
    const fullPath = path.join(CONFIG.workspaceDir, filePath);
    if (!fs.existsSync(fullPath)) {
      return null;
    }
    const content = fs.readFileSync(fullPath, 'utf8');
    return crypto.createHash('sha256').update(content).digest('hex');
  } catch (err) {
    console.error(`해시 계산 실패: ${filePath}`, err.message);
    return null;
  }
}

// 파일 버전 정보 추출 (주석에서 버전 찾기)
function extractVersion(filePath) {
  try {
    const fullPath = path.join(CONFIG.workspaceDir, filePath);
    if (!fs.existsSync(fullPath)) return null;

    const content = fs.readFileSync(fullPath, 'utf8');

    // Python: 버전: X.X 또는 v X.X
    const pyMatch = content.match(/버전[:\s]*v?(\d+\.\d+(?:-\d+)?)/i);
    if (pyMatch) return pyMatch[1];

    // JS/TS: @version X.X 또는 Version: X.X
    const jsMatch = content.match(/@?version[:\s]*v?(\d+\.\d+(?:\.\d+)?)/i);
    if (jsMatch) return jsMatch[1];

    return null;
  } catch {
    return null;
  }
}

// 저장된 해시 불러오기
function loadHashes() {
  try {
    if (fs.existsSync(CONFIG.hashFile)) {
      return JSON.parse(fs.readFileSync(CONFIG.hashFile, 'utf8'));
    }
  } catch (err) {
    console.error('해시 파일 로드 실패:', err.message);
  }
  return {};
}

// 해시 저장
function saveHashes(hashes) {
  try {
    fs.writeFileSync(CONFIG.hashFile, JSON.stringify(hashes, null, 2), 'utf8');
  } catch (err) {
    console.error('해시 파일 저장 실패:', err.message);
  }
}

// 히스토리 불러오기/저장
function loadHistory() {
  try {
    if (fs.existsSync(CONFIG.historyFile)) {
      return JSON.parse(fs.readFileSync(CONFIG.historyFile, 'utf8'));
    }
  } catch {
    // ignore
  }
  return [];
}

function saveHistory(history) {
  try {
    // 최대 엔트리 수 유지
    while (history.length > CONFIG.maxHistoryEntries) {
      history.shift();
    }
    fs.writeFileSync(CONFIG.historyFile, JSON.stringify(history, null, 2), 'utf8');
  } catch (err) {
    console.error('히스토리 저장 실패:', err.message);
  }
}

// 변경 내역을 히스토리에 기록
function recordChange(filePath, oldHash, newHash, changeType) {
  const history = loadHistory();
  history.push({
    timestamp: new Date().toISOString(),
    file: filePath,
    oldHash: oldHash?.substring(0, 16),
    newHash: newHash?.substring(0, 16),
    changeType, // 'modified', 'rollback', 'new', 'deleted'
    version: extractVersion(filePath),
  });
  saveHistory(history);
}

// 롤백 여부 감지 (히스토리에서 이전 해시와 일치하는지)
function detectRollback(filePath, currentHash, savedHashes) {
  const history = loadHistory();

  // 최근 히스토리에서 이 파일의 이전 해시들 검색
  const fileHistory = history
    .filter(h => h.file === filePath && h.oldHash)
    .map(h => h.oldHash);

  // 현재 해시가 이전 해시 중 하나와 일치하면 롤백으로 판단
  const shortHash = currentHash?.substring(0, 16);
  if (fileHistory.includes(shortHash)) {
    return true;
  }

  return false;
}

// BTS 버그 등록 (알림용)
async function registerBTSAlert(title, summary, priority = 'P1') {
  try {
    execSync(
      `node "${path.join(CONFIG.workspaceDir, 'bug.js')}" add "${title.replace(/"/g, '\\"')}" "${summary.replace(/"/g, '\\"')}" ${priority}`,
      { encoding: 'utf8', cwd: CONFIG.workspaceDir }
    );
    console.log(`[BTS] 알림 등록: ${title}`);
  } catch (err) {
    console.error('[BTS] 알림 등록 실패:', err.message);
  }
}

// 메인: 파일 변경 검사
async function checkFiles(options = {}) {
  const { quiet = false, autoFix = false } = options;

  const savedHashes = loadHashes();
  const changes = [];
  const rollbacks = [];

  for (const filePath of PROTECTED_FILES) {
    const currentHash = calculateHash(filePath);
    const savedHash = savedHashes[filePath]?.hash;
    const version = extractVersion(filePath);

    if (!currentHash) {
      // 파일이 없어짐
      if (savedHash) {
        changes.push({ file: filePath, type: 'deleted' });
        recordChange(filePath, savedHash, null, 'deleted');
        if (!quiet) console.log(`❌ [삭제됨] ${filePath}`);
      }
      continue;
    }

    if (!savedHash) {
      // 새 파일 (처음 감지)
      savedHashes[filePath] = {
        hash: currentHash,
        version,
        lastChecked: new Date().toISOString(),
      };
      recordChange(filePath, null, currentHash, 'new');
      if (!quiet) console.log(`✅ [등록] ${filePath} (v${version || '?'})`);
      continue;
    }

    if (currentHash !== savedHash) {
      // 변경 감지
      const isRollback = detectRollback(filePath, currentHash, savedHashes);

      if (isRollback) {
        rollbacks.push({ file: filePath, hash: currentHash });
        recordChange(filePath, savedHash, currentHash, 'rollback');
        if (!quiet) console.log(`🔄 [롤백 감지!] ${filePath}`);
      } else {
        changes.push({ file: filePath, type: 'modified', hash: currentHash });
        recordChange(filePath, savedHash, currentHash, 'modified');
        if (!quiet) console.log(`📝 [변경됨] ${filePath} (v${version || '?'})`);
      }

      // 해시 업데이트
      savedHashes[filePath] = {
        hash: currentHash,
        version,
        lastChecked: new Date().toISOString(),
      };
    } else {
      // 변경 없음
      savedHashes[filePath].lastChecked = new Date().toISOString();
      if (!quiet) console.log(`✓ [정상] ${filePath}`);
    }
  }

  saveHashes(savedHashes);

  // 롤백 감지 시 경고
  if (rollbacks.length > 0) {
    const rollbackFiles = rollbacks.map(r => r.file).join(', ');
    console.log('\n⚠️⚠️⚠️ 롤백 감지! ⚠️⚠️⚠️');
    console.log(`파일: ${rollbackFiles}`);

    // BTS 알림 등록
    await registerBTSAlert(
      '소스 코드 롤백 감지',
      `다음 파일에서 롤백이 감지됨: ${rollbackFiles}. git log 및 히스토리 확인 필요.`,
      'P0'
    );
  }

  return { changes, rollbacks };
}

// git pre-commit hook 설치
function installGitHook() {
  const hookPath = path.join(CONFIG.workspaceDir, '.git', 'hooks', 'pre-commit');

  const hookContent = `#!/bin/sh
# Code Guardian pre-commit hook
# BTS-3464: 주요 파일 회귀 방지

# Node.js로 검사 실행
node "${path.join(CONFIG.workspaceDir, 'automation', 'code-guardian.cjs')}" --check-staged

# 검사 결과에 따라 커밋 진행 (현재는 경고만, 차단하려면 exit 1)
exit 0
`;

  try {
    fs.writeFileSync(hookPath, hookContent, { mode: 0o755, encoding: 'utf8' });
    console.log('✅ Git pre-commit hook 설치 완료');
    console.log(`   경로: ${hookPath}`);
  } catch (err) {
    console.error('Git hook 설치 실패:', err.message);
  }
}

// staged 파일 검사 (pre-commit hook용)
function checkStagedFiles() {
  try {
    const staged = execSync('git diff --cached --name-only', {
      encoding: 'utf8',
      cwd: CONFIG.workspaceDir
    }).trim().split('\n').filter(Boolean);

    const protectedStaged = staged.filter(f => PROTECTED_FILES.includes(f));

    if (protectedStaged.length > 0) {
      console.log('\n📋 보호 대상 파일 변경 감지:');
      protectedStaged.forEach(f => console.log(`   - ${f}`));
      console.log('\n⚠️ 이 파일들은 Code Guardian으로 보호됩니다.');
      console.log('   변경 히스토리가 기록됩니다.\n');
    }
  } catch (err) {
    // git 명령 실패 시 무시
  }
}

// 히스토리 보기
function showHistory(limit = 20) {
  const history = loadHistory();
  const recent = history.slice(-limit);

  console.log(`\n📜 Code Guardian 히스토리 (최근 ${recent.length}개)\n`);
  console.log('시간                    | 유형     | 파일');
  console.log('-'.repeat(80));

  recent.forEach(entry => {
    const time = new Date(entry.timestamp).toLocaleString('ko-KR');
    const type = {
      'modified': '📝 변경',
      'rollback': '🔄 롤백',
      'new': '✨ 신규',
      'deleted': '❌ 삭제',
    }[entry.changeType] || entry.changeType;

    console.log(`${time.padEnd(22)} | ${type.padEnd(8)} | ${entry.file}`);
  });
}

// 현재 상태 표시
function showStatus() {
  const hashes = loadHashes();

  console.log('\n🛡️ Code Guardian 상태\n');
  console.log('파일                                           | 버전    | 마지막 확인');
  console.log('-'.repeat(80));

  for (const filePath of PROTECTED_FILES) {
    const info = hashes[filePath];
    const exists = fs.existsSync(path.join(CONFIG.workspaceDir, filePath));

    if (!info) {
      console.log(`${filePath.padEnd(45)} | (미등록)`);
    } else {
      const version = (info.version || '?').padEnd(7);
      const lastChecked = info.lastChecked
        ? new Date(info.lastChecked).toLocaleString('ko-KR')
        : '-';
      const status = exists ? '' : ' [삭제됨]';
      console.log(`${filePath.padEnd(45)} | ${version} | ${lastChecked}${status}`);
    }
  }
}

// CLI
async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'check';

  console.log('🛡️ Code Guardian - 소스 코드 회귀 감지 시스템\n');

  switch (command) {
    case 'check':
      await checkFiles({ quiet: false });
      break;

    case 'check-quiet':
      const result = await checkFiles({ quiet: true });
      if (result.rollbacks.length > 0) {
        console.log(`⚠️ 롤백 감지: ${result.rollbacks.length}개 파일`);
        process.exit(1);
      }
      break;

    case 'check-staged':
    case '--check-staged':
      checkStagedFiles();
      break;

    case 'install-hook':
      installGitHook();
      break;

    case 'history':
      showHistory(parseInt(args[1]) || 20);
      break;

    case 'status':
      showStatus();
      break;

    case 'help':
    default:
      console.log(`
사용법: node code-guardian.cjs <명령>

명령:
  check         모든 보호 파일 검사 (기본)
  check-quiet   조용히 검사 (롤백 시에만 출력)
  check-staged  staged 파일 검사 (pre-commit hook용)
  install-hook  git pre-commit hook 설치
  history [n]   변경 히스토리 보기 (최근 n개, 기본 20)
  status        현재 보호 파일 상태
  help          도움말
`);
  }
}

main().catch(console.error);
