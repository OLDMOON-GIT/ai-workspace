#!/usr/bin/env node
/**
 * Test Generator Worker
 * Claude CLI를 사용해서 통합테스트를 천천히 생성
 */

import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

const TARGET_DIR = 'C:\\Users\\oldmoon\\workspace\\trend-video-frontend';
const TEST_DIR = path.join(TARGET_DIR, 'src', '__tests__');
const INTERVAL = 10 * 60 * 1000; // 10분마다 테스트 생성

// 테스트가 필요한 파일 패턴
const SOURCE_PATTERNS = [
  'src/app/api/**/*.ts',
  'src/lib/**/*.ts',
  'src/services/**/*.ts',
  'src/utils/**/*.ts',
  'src/hooks/**/*.ts'
];

// 이미 테스트가 있는지 확인
function hasTest(filePath: string): boolean {
  const baseName = path.basename(filePath, path.extname(filePath));
  const testPatterns = [
    `${baseName}.test.ts`,
    `${baseName}.test.tsx`,
    `${baseName}.spec.ts`,
    `${baseName}.spec.tsx`
  ];

  // __tests__ 폴더에서 찾기
  for (const pattern of testPatterns) {
    const testPath = path.join(TEST_DIR, pattern);
    if (fs.existsSync(testPath)) return true;
  }

  // 같은 폴더에서 찾기
  const dir = path.dirname(filePath);
  for (const pattern of testPatterns) {
    const testPath = path.join(dir, pattern);
    if (fs.existsSync(testPath)) return true;
  }

  return false;
}

// 소스 파일 목록 가져오기
function getSourceFiles(): string[] {
  const files: string[] = [];

  function scanDir(dir: string, patterns: string[]) {
    if (!fs.existsSync(dir)) return;

    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        if (!['node_modules', '.next', 'dist', '__tests__'].includes(entry.name)) {
          scanDir(fullPath, patterns);
        }
      } else if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) {
        // 테스트 파일 제외
        if (!entry.name.includes('.test.') && !entry.name.includes('.spec.')) {
          files.push(fullPath);
        }
      }
    }
  }

  // 주요 디렉토리 스캔
  const dirs = ['src/app/api', 'src/lib', 'src/services', 'src/utils', 'src/hooks'];
  for (const dir of dirs) {
    scanDir(path.join(TARGET_DIR, dir), []);
  }

  return files;
}

// 테스트가 없는 파일 찾기
function getFilesWithoutTests(): string[] {
  const sourceFiles = getSourceFiles();
  return sourceFiles.filter(f => !hasTest(f));
}

// Claude CLI로 테스트 생성
async function generateTest(filePath: string): Promise<boolean> {
  return new Promise((resolve) => {
    const relativePath = path.relative(TARGET_DIR, filePath);
    const baseName = path.basename(filePath, path.extname(filePath));

    const prompt = `
다음 파일에 대한 통합테스트를 작성해주세요:

파일: ${relativePath}

요구사항:
1. Jest + React Testing Library 사용
2. 실제 API 호출은 모킹
3. 주요 함수/컴포넌트의 정상 동작 테스트
4. 에러 케이스 테스트
5. 테스트 파일은 src/__tests__/${baseName}.test.ts 에 생성

코드를 읽고 적절한 테스트를 작성해주세요.
`.trim();

    console.log(`  [생성 중] ${relativePath}`);

    const claude = spawn('claude', ['-p', prompt], {
      cwd: TARGET_DIR,
      shell: true,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let output = '';

    claude.stdout?.on('data', (data) => {
      output += data.toString();
    });

    claude.on('close', (code) => {
      if (code === 0) {
        console.log(`  [완료] ${baseName}.test.ts 생성됨`);
        resolve(true);
      } else {
        console.log(`  [실패] ${relativePath} 테스트 생성 실패`);
        resolve(false);
      }
    });

    claude.on('error', (err) => {
      console.log(`  [에러] Claude 실행 실패: ${err.message}`);
      resolve(false);
    });

    // 10분 타임아웃
    setTimeout(() => {
      claude.kill();
      console.log(`  [타임아웃] ${relativePath}`);
      resolve(false);
    }, 10 * 60 * 1000);
  });
}

// 진행 상태 저장
const PROGRESS_FILE = path.join(TARGET_DIR, '.test-generator-progress.json');

function loadProgress(): { generated: string[], lastIndex: number } {
  try {
    if (fs.existsSync(PROGRESS_FILE)) {
      return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf-8'));
    }
  } catch {}
  return { generated: [], lastIndex: 0 };
}

function saveProgress(progress: { generated: string[], lastIndex: number }) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

let isGenerating = false;
let totalGenerated = 0;

async function generateNextTest() {
  if (isGenerating) return;
  isGenerating = true;

  try {
    const filesWithoutTests = getFilesWithoutTests();
    const progress = loadProgress();

    // 이미 생성한 파일 제외
    const remaining = filesWithoutTests.filter(f => !progress.generated.includes(f));

    if (remaining.length === 0) {
      console.log('  [완료] 모든 파일에 테스트가 있습니다!');
      isGenerating = false;
      return;
    }

    const nextFile = remaining[0];
    console.log(`  [대기] 테스트 없는 파일: ${remaining.length}개`);

    const success = await generateTest(nextFile);

    if (success) {
      progress.generated.push(nextFile);
      progress.lastIndex++;
      saveProgress(progress);
      totalGenerated++;
    }
  } finally {
    isGenerating = false;
  }
}

async function main() {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║           🧪 Test Generator (Claude CLI)                     ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log(`  대상: ${TARGET_DIR}`);
  console.log(`  주기: ${INTERVAL / 60000}분마다 1개씩 생성`);
  console.log('  테스트가 없는 파일을 찾아서 자동 생성');
  console.log('');

  const filesWithoutTests = getFilesWithoutTests();
  console.log(`  📋 테스트 없는 파일: ${filesWithoutTests.length}개`);
  console.log('');
  console.log('────────────────────────────────────────────────────────────────');

  // 시작 시 한번 실행
  await generateNextTest();

  // 10분마다 실행
  setInterval(async () => {
    const now = new Date().toLocaleTimeString('ko-KR');
    console.log(`  [${now}] 다음 테스트 생성 시작... (누적: ${totalGenerated}개)`);
    await generateNextTest();
  }, INTERVAL);

  console.log('  [대기 중] 테스트 생성 대기...');
}

main().catch(console.error);
