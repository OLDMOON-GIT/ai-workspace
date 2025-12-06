#!/usr/bin/env node
/**
 * BTS-14671: 빌드 에러 체크 스크립트
 *
 * Next.js 빌드를 주기적으로 실행하고 에러가 있으면 버그 등록
 * 로그 모니터는 파일 기반이라 콘솔 출력 빌드 에러를 감지 못함
 *
 * 사용법:
 *   node build-check.js              # 1회 실행
 *   node build-check.js --watch      # 5분마다 반복 실행
 */

const { execSync, spawn } = require('child_process');
const mysql = require('mysql2/promise');
const path = require('path');
const fs = require('fs');

const FRONTEND_PATH = path.join(__dirname, '..', 'trend-video-frontend');
const CHECK_INTERVAL = 5 * 60 * 1000; // 5분

const dbConfig = {
  host: 'localhost',
  user: 'root',
  password: 'trend2024',
  database: 'trend_video'
};

// 최근 등록된 빌드 에러 해시 (중복 방지)
let lastBuildErrorHash = '';

async function checkBuild() {
  console.log(`[${new Date().toLocaleTimeString('ko-KR')}] 빌드 체크 시작...`);

  return new Promise((resolve) => {
    const buildProcess = spawn('npm', ['run', 'build'], {
      cwd: FRONTEND_PATH,
      shell: true,
      env: { ...process.env, FORCE_COLOR: '0' }
    });

    let stdout = '';
    let stderr = '';

    buildProcess.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    buildProcess.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    buildProcess.on('close', async (code) => {
      const output = stdout + stderr;

      if (code !== 0) {
        console.log(`[빌드 실패] exit code: ${code}`);

        // 에러 파싱
        const errorInfo = parseBuildError(output);

        if (errorInfo) {
          // 중복 체크
          const errorHash = hashString(errorInfo.title + errorInfo.file);
          if (errorHash !== lastBuildErrorHash) {
            lastBuildErrorHash = errorHash;
            await registerBuildBug(errorInfo);
          } else {
            console.log('  (중복 에러 - 건너뜀)');
          }
        }
      } else {
        console.log(`[빌드 성공]`);
        lastBuildErrorHash = ''; // 성공 시 해시 초기화
      }

      resolve(code === 0);
    });

    // 3분 타임아웃
    setTimeout(() => {
      buildProcess.kill();
      console.log('[타임아웃] 빌드 프로세스 종료');
      resolve(false);
    }, 3 * 60 * 1000);
  });
}

function parseBuildError(output) {
  // 파싱 에러 패턴
  const parseErrorMatch = output.match(/Parsing\s+(?:ecmascript\s+)?source\s+code\s+failed[\s\S]*?(\.\/[^\s]+):(\d+):(\d+)[\s\S]*?(Expected\s+[^\n]+|Unexpected\s+[^\n]+)/i);
  if (parseErrorMatch) {
    return {
      type: 'syntax_error',
      file: parseErrorMatch[1],
      line: parseErrorMatch[2],
      column: parseErrorMatch[3],
      message: parseErrorMatch[4],
      title: `빌드 에러: ${parseErrorMatch[1]}:${parseErrorMatch[2]} - ${parseErrorMatch[4]}`
    };
  }

  // Module not found 패턴
  const moduleNotFoundMatch = output.match(/Module not found:\s*Can't resolve\s*'([^']+)'[\s\S]*?(\.\/[^\s]+):(\d+):(\d+)/i);
  if (moduleNotFoundMatch) {
    return {
      type: 'module_not_found',
      module: moduleNotFoundMatch[1],
      file: moduleNotFoundMatch[2],
      line: moduleNotFoundMatch[3],
      column: moduleNotFoundMatch[4],
      message: `모듈을 찾을 수 없음: '${moduleNotFoundMatch[1]}'`,
      title: `빌드 에러: ${moduleNotFoundMatch[2]} - 모듈 '${moduleNotFoundMatch[1]}' 없음`
    };
  }

  // Export not found 패턴
  const exportNotFoundMatch = output.match(/Export\s+(\w+)\s+doesn't exist in target module[\s\S]*?(\.\/[^\s]+):(\d+):(\d+)/i);
  if (exportNotFoundMatch) {
    return {
      type: 'export_not_found',
      exportName: exportNotFoundMatch[1],
      file: exportNotFoundMatch[2],
      line: exportNotFoundMatch[3],
      column: exportNotFoundMatch[4],
      message: `export '${exportNotFoundMatch[1]}'가 존재하지 않음`,
      title: `빌드 에러: ${exportNotFoundMatch[2]} - export '${exportNotFoundMatch[1]}' 없음`
    };
  }

  // 일반 빌드 에러 패턴
  const buildErrorMatch = output.match(/Build error occurred[\s\S]*?Error:\s*([^\n]+)/i);
  if (buildErrorMatch) {
    return {
      type: 'build_error',
      message: buildErrorMatch[1],
      title: `빌드 에러: ${buildErrorMatch[1].substring(0, 80)}`
    };
  }

  // Turbopack 에러 패턴
  const turbopackMatch = output.match(/Turbopack build failed with (\d+) errors?/i);
  if (turbopackMatch) {
    const errorCount = turbopackMatch[1];
    // 첫 번째 에러 파일 찾기
    const fileMatch = output.match(/(\.\/[^\s]+):(\d+):(\d+)/);
    return {
      type: 'turbopack_error',
      errorCount,
      file: fileMatch ? fileMatch[1] : 'unknown',
      message: `Turbopack 빌드 실패: ${errorCount}개 에러`,
      title: `빌드 에러: Turbopack ${errorCount}개 에러 ${fileMatch ? '- ' + fileMatch[1] : ''}`
    };
  }

  // 알 수 없는 에러
  if (output.includes('error') || output.includes('Error') || output.includes('failed')) {
    const firstErrorLine = output.split('\n').find(line =>
      /error|Error|failed|Failed/i.test(line)
    );
    if (firstErrorLine) {
      return {
        type: 'unknown_error',
        message: firstErrorLine.trim().substring(0, 200),
        title: `빌드 에러: ${firstErrorLine.trim().substring(0, 80)}`
      };
    }
  }

  return null;
}

async function registerBuildBug(errorInfo) {
  const conn = await mysql.createConnection(dbConfig);

  try {
    // 중복 체크 (같은 파일+라인의 open 버그)
    if (errorInfo.file && errorInfo.line) {
      const [existing] = await conn.execute(
        `SELECT id FROM bugs WHERE status = 'open' AND title LIKE ? LIMIT 1`,
        [`%${errorInfo.file}:${errorInfo.line}%`]
      );
      if (existing.length > 0) {
        console.log(`  (이미 등록됨: BTS-${existing[0].id})`);
        return;
      }
    }

    const summary = JSON.stringify(errorInfo, null, 2);
    await conn.execute(
      `INSERT INTO bugs (title, summary, status, priority, type, created_at, updated_at)
       VALUES (?, ?, 'open', 'P0', 'bug', NOW(), NOW())`,
      [errorInfo.title.substring(0, 200), summary]
    );

    const [result] = await conn.execute('SELECT LAST_INSERT_ID() as id');
    console.log(`  ✅ BTS-${result[0].id} 등록됨: ${errorInfo.title}`);

  } finally {
    await conn.end();
  }
}

function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString(16);
}

async function main() {
  const args = process.argv.slice(2);
  const watchMode = args.includes('--watch') || args.includes('-w');

  console.log('=== 빌드 에러 체크 스크립트 (BTS-14671) ===');
  console.log(`모드: ${watchMode ? '반복 실행 (5분 간격)' : '1회 실행'}`);
  console.log(`대상: ${FRONTEND_PATH}`);
  console.log('');

  await checkBuild();

  if (watchMode) {
    setInterval(checkBuild, CHECK_INTERVAL);
  }
}

main().catch(console.error);
