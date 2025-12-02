/**
 * Test Runner
 * 테스트 실행 및 결과 파싱
 */

import { execSync } from 'child_process';
import {
  Project,
  TestRun,
  startTestRun,
  completeTestRun,
  addTestCase,
  getProjectById
} from './db.js';

// mcp-debugger 연동을 위한 함수
async function reportToDebugger(error: {
  error_type: string;
  error_message: string;
  file_path?: string;
  stack_trace?: string;
}) {
  try {
    const mcpDebuggerPath = 'C:\\Users\\oldmoon\\workspace\\mcp-debugger';
    const message = error.error_message.replace(/"/g, '\\"').replace(/\$/g, '\\$');

    // mcp-debugger CLI 호출
    execSync(
      `cd "${mcpDebuggerPath}" && npm run worker -- 추가 "${error.error_type}" "${message}"`,
      { stdio: 'pipe', shell: 'cmd.exe' }
    );
  } catch (err) {
    // mcp-debugger가 없거나 에러 발생 시 무시
  }
}

// 테스트 출력 파싱 (간단한 파서)
interface TestResult {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  duration_ms: number;
  cases: Array<{
    suite?: string;
    name: string;
    status: 'passed' | 'failed' | 'skipped';
    duration_ms?: number;
    error?: string;
    stack?: string;
  }>;
}

function parseTestOutput(output: string, stderr: string): TestResult {
  const result: TestResult = {
    total: 0,
    passed: 0,
    failed: 0,
    skipped: 0,
    duration_ms: 0,
    cases: []
  };

  // Jest 형식 파싱
  const testMatch = output.match(/Tests:\s+(\d+)\s+failed,\s+(\d+)\s+passed,\s+(\d+)\s+total/);
  if (testMatch) {
    result.failed = parseInt(testMatch[1]);
    result.passed = parseInt(testMatch[2]);
    result.total = parseInt(testMatch[3]);
  } else {
    // 간단한 파싱 (passed/failed 카운트)
    const passedMatch = output.match(/(\d+)\s+passing/);
    const failedMatch = output.match(/(\d+)\s+failing/);

    if (passedMatch) result.passed = parseInt(passedMatch[1]);
    if (failedMatch) result.failed = parseInt(failedMatch[1]);
    result.total = result.passed + result.failed;
  }

  // 시간 파싱
  const timeMatch = output.match(/Time:\s+([\d.]+)\s*s/);
  if (timeMatch) {
    result.duration_ms = Math.round(parseFloat(timeMatch[1]) * 1000);
  }

  // 개별 테스트 케이스 파싱 (간단한 버전)
  const lines = output.split('\n');
  for (const line of lines) {
    if (line.includes('✓') || line.includes('✔')) {
      const name = line.replace(/[✓✔]/g, '').trim();
      if (name) {
        result.cases.push({ name, status: 'passed' });
      }
    } else if (line.includes('✗') || line.includes('×')) {
      const name = line.replace(/[✗×]/g, '').trim();
      if (name) {
        result.cases.push({ name, status: 'failed' });
      }
    }
  }

  return result;
}

// 테스트 실행
export async function runTests(
  projectId: number,
  trigger: 'auto' | 'manual' | 'file-change',
  triggeredBy?: string
): Promise<TestRun> {
  const project = getProjectById(projectId);
  if (!project) {
    throw new Error(`Project ${projectId} not found`);
  }

  console.log(`\n🧪 테스트 실행 시작: ${project.name}`);
  console.log(`   명령어: ${project.test_command}`);
  if (triggeredBy) {
    console.log(`   트리거: ${triggeredBy}`);
  }

  // 테스트 실행 시작 기록
  const testRun = startTestRun(projectId, trigger, triggeredBy);
  const startTime = Date.now();

  try {
    // 테스트 명령 실행
    const output = execSync(project.test_command, {
      cwd: project.path,
      encoding: 'utf8',
      stdio: 'pipe',
      timeout: 5 * 60 * 1000 // 5분 타임아웃
    });

    const duration = Date.now() - startTime;
    const result = parseTestOutput(output, '');

    // 결과 저장
    completeTestRun(testRun.id, result.failed > 0 ? 'failed' : 'passed', {
      total: result.total,
      passed: result.passed,
      failed: result.failed,
      skipped: result.skipped,
      duration_ms: duration,
      output: output.substring(0, 10000) // 첫 10KB만 저장
    });

    // 개별 테스트 케이스 저장
    for (const testCase of result.cases) {
      addTestCase(testRun.id, testCase.name, testCase.status, {
        suite_name: testCase.suite,
        duration_ms: testCase.duration_ms,
        error_message: testCase.error,
        stack_trace: testCase.stack
      });

      // 실패한 테스트는 mcp-debugger에 보고
      if (testCase.status === 'failed') {
        await reportToDebugger({
          error_type: 'TestFailure',
          error_message: `Test failed: ${testCase.name}`,
          file_path: triggeredBy,
          stack_trace: testCase.stack
        });
      }
    }

    if (result.failed > 0) {
      console.log(`❌ 테스트 실패: ${result.failed}/${result.total} 실패`);
    } else {
      console.log(`✅ 테스트 성공: ${result.passed}/${result.total} 통과`);
    }
    console.log(`   시간: ${(duration / 1000).toFixed(2)}초\n`);

    return testRun;

  } catch (error: any) {
    const duration = Date.now() - startTime;
    const errorMessage = error.message || String(error);
    const output = error.stdout || '';
    const stderr = error.stderr || '';

    // 에러 결과 파싱 시도
    const result = parseTestOutput(output + '\n' + stderr, stderr);

    completeTestRun(testRun.id, 'error', {
      total: result.total,
      passed: result.passed,
      failed: result.failed,
      duration_ms: duration,
      output: (output + '\n' + stderr).substring(0, 10000),
      error_message: errorMessage.substring(0, 1000)
    });

    // 에러를 mcp-debugger에 보고
    await reportToDebugger({
      error_type: 'TestError',
      error_message: errorMessage,
      file_path: triggeredBy,
      stack_trace: stderr
    });

    console.log(`❌ 테스트 실행 에러: ${errorMessage.substring(0, 100)}\n`);

    return testRun;
  }
}

// 프로젝트의 모든 테스트 실행
export async function runAllProjectTests(projectName?: string): Promise<void> {
  const { getProjects, getProjectByName } = await import('./db.js');

  let projects: Project[];

  if (projectName) {
    const project = getProjectByName(projectName);
    if (!project) {
      console.error(`❌ 프로젝트를 찾을 수 없습니다: ${projectName}`);
      return;
    }
    projects = [project];
  } else {
    projects = getProjects(true);
  }

  if (projects.length === 0) {
    console.log('📋 등록된 프로젝트가 없습니다.');
    return;
  }

  console.log(`\n🚀 ${projects.length}개 프로젝트 테스트 시작\n`);

  for (const project of projects) {
    await runTests(project.id, 'manual');
  }

  console.log('✅ 모든 프로젝트 테스트 완료\n');
}
