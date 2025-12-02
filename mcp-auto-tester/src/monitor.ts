#!/usr/bin/env node
/**
 * File Change Monitor
 * 파일 변경 감지 및 자동 테스트 실행
 */

import chokidar from 'chokidar';
import path from 'path';
import { getProjects, recordFileChange } from './db.js';
import { runTests } from './runner.js';

// 디바운스를 위한 타이머 맵
const debounceTimers = new Map<number, NodeJS.Timeout>();

// 파일 변경 처리 (디바운스 포함)
async function handleFileChange(
  projectId: number,
  filePath: string,
  changeType: 'add' | 'change' | 'unlink'
) {
  // 기존 타이머 취소
  if (debounceTimers.has(projectId)) {
    clearTimeout(debounceTimers.get(projectId)!);
  }

  // 새 타이머 설정 (2초 디바운스)
  const timer = setTimeout(async () => {
    const now = new Date().toLocaleTimeString('ko-KR');
    console.log('');
    console.log(`  [${now}] 📝 파일 변경: ${filePath}`);
    console.log(`  [${now}] 🧪 테스트 실행 중...`);

    // 파일 변경 기록
    recordFileChange(projectId, filePath, changeType);

    // 테스트 실행
    try {
      const testRun = await runTests(projectId, 'file-change', filePath);
      testCount++;

      if (testRun.status === 'passed') {
        passCount++;
        console.log(`  [${now}] ✅ 테스트 성공!`);
      } else {
        failCount++;
        console.log(`  [${now}] ❌ 테스트 실패!`);
      }
      console.log(`  [${now}] 📊 누적: ${testCount}회 실행 | ${passCount} 성공 | ${failCount} 실패`);
      console.log('');
    } catch (error) {
      failCount++;
      testCount++;
      console.error(`  [${now}] 💥 테스트 에러:`, error);
    }

    debounceTimers.delete(projectId);
  }, 2000);

  debounceTimers.set(projectId, timer);
}

// 테스트 실행 카운터
let testCount = 0;
let passCount = 0;
let failCount = 0;

// 모니터링 시작
async function startMonitoring() {
  const projects = getProjects(true);

  if (projects.length === 0) {
    console.log('📋 등록된 프로젝트가 없습니다.');
    console.log('   npm run cli -- 등록 <프로젝트명> <경로> 명령으로 프로젝트를 등록하세요.\n');
    process.exit(0);
  }

  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║              🧪 MCP Auto Tester - File Watcher               ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('');

  for (const project of projects) {
    console.log(`📂 ${project.name}`);
    console.log(`   경로: ${project.path}`);
    console.log(`   패턴: ${project.watch_patterns}`);
    console.log(`   테스트: ${project.test_command}`);
    console.log('');

    // 감시할 패턴 파싱
    const patterns = project.watch_patterns.split(',').map(p => p.trim());
    const fullPatterns = patterns.map(p => path.join(project.path, p));

    // chokidar 워처 설정
    const watcher = chokidar.watch(fullPatterns, {
      persistent: true,
      ignoreInitial: true,
      ignored: [
        '**/node_modules/**',
        '**/.git/**',
        '**/dist/**',
        '**/build/**',
        '**/.next/**',
        '**/coverage/**'
      ],
      awaitWriteFinish: {
        stabilityThreshold: 300,
        pollInterval: 100
      }
    });

    watcher
      .on('add', (filePath) => {
        handleFileChange(project.id, filePath, 'add');
      })
      .on('change', (filePath) => {
        handleFileChange(project.id, filePath, 'change');
      })
      .on('unlink', (filePath) => {
        // 파일 삭제는 테스트 실행하지 않고 기록만
        recordFileChange(project.id, filePath, 'unlink');
      })
      .on('error', (error) => {
        console.error(`❌ 감시 에러 (${project.name}):`, error);
      });
  }

  console.log('────────────────────────────────────────────────────────────────');
  console.log('  파일 변경 시 + 5분마다 자동 테스트 실행');
  console.log('  Ctrl+C로 종료');
  console.log('────────────────────────────────────────────────────────────────');
  console.log('');

  // 시작 시 즉시 테스트 실행
  console.log('  [시작] 초기 테스트 실행 중...');
  for (const project of projects) {
    try {
      const testRun = await runTests(project.id, 'auto');
      testCount++;
      if (testRun.status === 'passed') {
        passCount++;
        console.log(`  [${project.name}] ✅ 테스트 성공`);
      } else {
        failCount++;
        console.log(`  [${project.name}] ❌ 테스트 실패`);
      }
    } catch (e) {
      failCount++;
      testCount++;
      console.log(`  [${project.name}] 💥 테스트 에러`);
    }
  }
  console.log('');

  // 5분마다 자동 테스트 실행
  setInterval(async () => {
    const now = new Date().toLocaleTimeString('ko-KR');
    console.log(`  [${now}] ⏰ 주기적 테스트 실행...`);

    for (const project of projects) {
      try {
        const testRun = await runTests(project.id, 'auto');
        testCount++;
        if (testRun.status === 'passed') {
          passCount++;
          console.log(`  [${now}] [${project.name}] ✅ 성공`);
        } else {
          failCount++;
          console.log(`  [${now}] [${project.name}] ❌ 실패`);
        }
      } catch (e) {
        failCount++;
        testCount++;
      }
    }
    console.log(`  [${now}] 📊 누적: ${testCount}회 | ${passCount} 성공 | ${failCount} 실패`);
  }, 5 * 60 * 1000); // 5분

  // 30초마다 상태 출력
  setInterval(() => {
    const now = new Date().toLocaleTimeString('ko-KR');
    console.log(`  [${now}] 감시 중 | 테스트: ${testCount}회 | 성공: ${passCount} | 실패: ${failCount}`);
  }, 30000);
}

// 메인 실행
startMonitoring().catch(console.error);
