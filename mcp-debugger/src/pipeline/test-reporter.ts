/**
 * Test Reporter
 * 테스트 실패 시 자동으로 버그 등록
 */

import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import { bugCreate } from '../bug-bridge.js';

export interface TestResult {
  testName: string;
  testPath: string;
  status: 'passed' | 'failed' | 'skipped' | 'pending';
  duration: number;
  errorMessage?: string;
  stackTrace?: string;
  failureDetails?: {
    expected?: string;
    received?: string;
    diff?: string;
  };
}

export interface TestSuiteResult {
  suiteName: string;
  suitePath: string;
  tests: TestResult[];
  passed: number;
  failed: number;
  skipped: number;
  duration: number;
}

export interface TestRunResult {
  startTime: Date;
  endTime: Date;
  duration: number;
  suites: TestSuiteResult[];
  totalPassed: number;
  totalFailed: number;
  totalSkipped: number;
  exitCode: number;
}

/**
 * Jest 출력 파싱
 */
export function parseJestOutput(output: string): TestRunResult {
  const result: TestRunResult = {
    startTime: new Date(),
    endTime: new Date(),
    duration: 0,
    suites: [],
    totalPassed: 0,
    totalFailed: 0,
    totalSkipped: 0,
    exitCode: 0
  };

  const lines = output.split('\n');
  let currentSuite: TestSuiteResult | null = null;
  let isInFailBlock = false;
  let failureBuffer: string[] = [];
  let currentTestName = '';

  for (const line of lines) {
    // Test Suite 시작 (PASS/FAIL path/to/test.ts)
    const suiteMatch = line.match(/^\s*(PASS|FAIL)\s+(.+)$/);
    if (suiteMatch) {
      if (currentSuite) {
        result.suites.push(currentSuite);
      }
      currentSuite = {
        suiteName: path.basename(suiteMatch[2]),
        suitePath: suiteMatch[2],
        tests: [],
        passed: 0,
        failed: 0,
        skipped: 0,
        duration: 0
      };
      continue;
    }

    // 테스트 결과 (✓ test name (123 ms))
    const passMatch = line.match(/^\s*(✓|√)\s+(.+?)\s*\((\d+)\s*ms\)$/);
    if (passMatch && currentSuite) {
      currentSuite.tests.push({
        testName: passMatch[2].trim(),
        testPath: currentSuite.suitePath,
        status: 'passed',
        duration: parseInt(passMatch[3])
      });
      currentSuite.passed++;
      result.totalPassed++;
      continue;
    }

    // 실패한 테스트 (✕ test name (123 ms))
    const failMatch = line.match(/^\s*(✕|×)\s+(.+?)(?:\s*\((\d+)\s*ms\))?$/);
    if (failMatch && currentSuite) {
      currentTestName = failMatch[2].trim();
      currentSuite.tests.push({
        testName: currentTestName,
        testPath: currentSuite.suitePath,
        status: 'failed',
        duration: failMatch[3] ? parseInt(failMatch[3]) : 0
      });
      currentSuite.failed++;
      result.totalFailed++;
      continue;
    }

    // 스킵된 테스트 (○ test name)
    const skipMatch = line.match(/^\s*(○)\s+(.+)$/);
    if (skipMatch && currentSuite) {
      currentSuite.tests.push({
        testName: skipMatch[2].trim(),
        testPath: currentSuite.suitePath,
        status: 'skipped',
        duration: 0
      });
      currentSuite.skipped++;
      result.totalSkipped++;
      continue;
    }

    // 에러 블록 시작
    if (line.includes('● ') && currentSuite) {
      isInFailBlock = true;
      failureBuffer = [line];
      continue;
    }

    // 에러 블록 내용 수집
    if (isInFailBlock) {
      if (line.trim() === '' && failureBuffer.length > 2) {
        // 에러 블록 종료
        const failedTest = currentSuite?.tests.find(
          t => t.status === 'failed' && !t.errorMessage
        );
        if (failedTest) {
          failedTest.errorMessage = failureBuffer.slice(1, 3).join('\n');
          failedTest.stackTrace = failureBuffer.slice(3).join('\n');

          // Expected/Received 추출
          const expectedMatch = failureBuffer.join('\n').match(/Expected:?\s*(.+)/);
          const receivedMatch = failureBuffer.join('\n').match(/Received:?\s*(.+)/);
          if (expectedMatch || receivedMatch) {
            failedTest.failureDetails = {
              expected: expectedMatch?.[1],
              received: receivedMatch?.[1]
            };
          }
        }
        isInFailBlock = false;
        failureBuffer = [];
      } else {
        failureBuffer.push(line);
      }
    }

    // 요약 라인 (Tests: X failed, Y passed, Z total)
    const summaryMatch = line.match(/Tests:\s+(\d+)\s+failed.*(\d+)\s+passed.*(\d+)\s+total/);
    if (summaryMatch) {
      result.totalFailed = parseInt(summaryMatch[1]);
      result.totalPassed = parseInt(summaryMatch[2]);
    }

    // 전체 시간 (Time: 12.34 s)
    const timeMatch = line.match(/Time:\s+([\d.]+)\s*s/);
    if (timeMatch) {
      result.duration = parseFloat(timeMatch[1]) * 1000;
    }
  }

  if (currentSuite) {
    result.suites.push(currentSuite);
  }

  result.endTime = new Date();
  return result;
}

/**
 * Jest 실행 및 결과 수집
 */
export function runJestTests(
  projectPath: string,
  options: {
    testPattern?: string;
    coverage?: boolean;
    watch?: boolean;
    verbose?: boolean;
  } = {}
): Promise<TestRunResult> {
  return new Promise((resolve, reject) => {
    const args = ['test', '--json', '--outputFile=jest-results.json'];

    if (options.testPattern) {
      args.push('--testPathPattern', options.testPattern);
    }
    if (options.coverage) {
      args.push('--coverage');
    }
    if (options.verbose) {
      args.push('--verbose');
    }

    let stdout = '';
    let stderr = '';

    const proc = spawn('npm', args, {
      cwd: projectPath,
      shell: true,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    proc.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      const result = parseJestOutput(stdout + stderr);
      result.exitCode = code || 0;
      resolve(result);
    });

    proc.on('error', (err) => {
      reject(err);
    });
  });
}

/**
 * 테스트 실패 시 버그 자동 등록
 */
export async function reportFailedTests(result: TestRunResult): Promise<{
  registered: number;
  failed: number;
}> {
  let registered = 0;
  let failed = 0;

  for (const suite of result.suites) {
    for (const test of suite.tests) {
      if (test.status !== 'failed') continue;

      try {
        await bugCreate({
          title: `[test_failure] ${test.testName}`,
          summary: `테스트 실패: ${test.testPath}\n\n${test.errorMessage || ''}`,
          priority: 'P1',
          type: 'bug',
          logPath: test.testPath,
          metadata: {
            test_name: test.testName,
            test_path: test.testPath,
            duration: test.duration,
            error_message: test.errorMessage,
            stack_trace: test.stackTrace,
            failure_details: test.failureDetails,
            source: 'test-reporter'
          }
        });
        registered++;
        console.log(`🐛 Bug registered for failed test: ${test.testName}`);
      } catch (error) {
        console.error(`Failed to register bug for test: ${test.testName}`, error);
        failed++;
      }
    }
  }

  return { registered, failed };
}

/**
 * 테스트 리포트 생성 (마크다운)
 */
export function generateTestReport(result: TestRunResult): string {
  const statusEmoji = result.totalFailed > 0 ? '❌' : '✅';
  const passRate = ((result.totalPassed / (result.totalPassed + result.totalFailed)) * 100).toFixed(1);

  let report = `# Test Report ${statusEmoji}

**Date**: ${result.startTime.toISOString()}
**Duration**: ${(result.duration / 1000).toFixed(2)}s
**Pass Rate**: ${passRate}%

## Summary

| Status | Count |
|--------|-------|
| ✅ Passed | ${result.totalPassed} |
| ❌ Failed | ${result.totalFailed} |
| ⏭️ Skipped | ${result.totalSkipped} |
| **Total** | ${result.totalPassed + result.totalFailed + result.totalSkipped} |

`;

  if (result.totalFailed > 0) {
    report += `## Failed Tests\n\n`;

    for (const suite of result.suites) {
      const failedTests = suite.tests.filter(t => t.status === 'failed');
      if (failedTests.length === 0) continue;

      report += `### ${suite.suiteName}\n\n`;
      for (const test of failedTests) {
        report += `#### ❌ ${test.testName}\n\n`;
        if (test.errorMessage) {
          report += `\`\`\`\n${test.errorMessage}\n\`\`\`\n\n`;
        }
        if (test.failureDetails?.expected && test.failureDetails?.received) {
          report += `- **Expected**: ${test.failureDetails.expected}\n`;
          report += `- **Received**: ${test.failureDetails.received}\n\n`;
        }
      }
    }
  }

  report += `## All Suites\n\n`;
  for (const suite of result.suites) {
    const status = suite.failed > 0 ? '❌' : '✅';
    report += `- ${status} **${suite.suiteName}**: ${suite.passed}/${suite.tests.length} passed\n`;
  }

  return report;
}

/**
 * 테스트 감시 모드 (실패 시 자동 버그 등록)
 */
export function watchTests(
  projectPath: string,
  options: { pattern?: string; autoRegisterBugs?: boolean } = {}
): ChildProcess {
  const args = ['test', '--watch'];
  if (options.pattern) {
    args.push('--testPathPattern', options.pattern);
  }

  const proc = spawn('npm', args, {
    cwd: projectPath,
    shell: true,
    stdio: 'pipe'
  });

  let buffer = '';

  proc.stdout?.on('data', (data) => {
    buffer += data.toString();

    // 테스트 완료 감지
    if (buffer.includes('Ran all test suites') || buffer.includes('No tests found')) {
      const result = parseJestOutput(buffer);

      if (options.autoRegisterBugs && result.totalFailed > 0) {
        reportFailedTests(result).then(({ registered }) => {
          console.log(`📝 Registered ${registered} bugs for failed tests`);
        });
      }

      buffer = '';
    }
  });

  console.log(`👀 Watching tests in: ${projectPath}`);
  return proc;
}

export default {
  parseJestOutput,
  runJestTests,
  reportFailedTests,
  generateTestReport,
  watchTests
};
