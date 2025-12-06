#!/usr/bin/env node
/**
 * Test Pipeline (BTS-3189)
 * 통합 테스트 파이프라인 - Jest, Playwright, E2E 통합 관리
 *
 * 기능:
 * 1. Unit Tests (Jest)
 * 2. Integration Tests
 * 3. UI Tests (Playwright)
 * 4. E2E Tests (automation/)
 */

import { spawn, ChildProcess, execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { bugCreate } from '../bug-bridge.js';

interface TestResult {
  name: string;
  passed: boolean;
  duration: number;
  error?: string;
  stack?: string;
  file?: string;
  line?: number;
}

interface TestSuiteResult {
  type: 'unit' | 'integration' | 'ui' | 'e2e';
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  duration: number;
  results: TestResult[];
  coverage?: {
    lines: number;
    branches: number;
    functions: number;
    statements: number;
  };
}

interface PipelineResult {
  success: boolean;
  startTime: Date;
  endTime: Date;
  suites: TestSuiteResult[];
  registeredBugs: number[];
}

interface PipelineConfig {
  projectPath: string;
  runUnit: boolean;
  runIntegration: boolean;
  runUi: boolean;
  runE2e: boolean;
  coverage: boolean;
  autoRegisterBugs: boolean;
  timeout: number;
}

export class TestPipeline {
  private config: PipelineConfig;
  private abortController: AbortController;

  constructor(config: Partial<PipelineConfig> = {}) {
    this.config = {
      projectPath: config.projectPath || process.cwd(),
      runUnit: config.runUnit ?? true,
      runIntegration: config.runIntegration ?? true,
      runUi: config.runUi ?? false,
      runE2e: config.runE2e ?? false,
      coverage: config.coverage ?? true,
      autoRegisterBugs: config.autoRegisterBugs ?? true,
      timeout: config.timeout ?? 300000, // 5분
    };
    this.abortController = new AbortController();
  }

  /**
   * 파이프라인 실행
   */
  async run(): Promise<PipelineResult> {
    const result: PipelineResult = {
      success: true,
      startTime: new Date(),
      endTime: new Date(),
      suites: [],
      registeredBugs: [],
    };

    console.log('');
    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║              🧪 Test Pipeline (BTS-3189)                     ║');
    console.log('╚══════════════════════════════════════════════════════════════╝');
    console.log('');

    try {
      // 1. Unit Tests
      if (this.config.runUnit) {
        console.log('📋 [1/4] Unit Tests 실행 중...');
        const unitResult = await this.runJestTests('unit');
        result.suites.push(unitResult);
        if (unitResult.failed > 0) result.success = false;
      }

      // 2. Integration Tests
      if (this.config.runIntegration) {
        console.log('📋 [2/4] Integration Tests 실행 중...');
        const integrationResult = await this.runJestTests('integration');
        result.suites.push(integrationResult);
        if (integrationResult.failed > 0) result.success = false;
      }

      // 3. UI Tests (Playwright)
      if (this.config.runUi) {
        console.log('📋 [3/4] UI Tests (Playwright) 실행 중...');
        const uiResult = await this.runPlaywrightTests();
        result.suites.push(uiResult);
        if (uiResult.failed > 0) result.success = false;
      }

      // 4. E2E Tests (automation/)
      if (this.config.runE2e) {
        console.log('📋 [4/4] E2E Tests 실행 중...');
        const e2eResult = await this.runE2ETests();
        result.suites.push(e2eResult);
        if (e2eResult.failed > 0) result.success = false;
      }

      // 실패한 테스트 버그 등록
      if (this.config.autoRegisterBugs) {
        result.registeredBugs = await this.registerFailedTests(result.suites);
      }

    } catch (error) {
      console.error('파이프라인 오류:', error);
      result.success = false;
    }

    result.endTime = new Date();
    this.printSummary(result);

    return result;
  }

  /**
   * Jest 테스트 실행
   */
  private async runJestTests(type: 'unit' | 'integration'): Promise<TestSuiteResult> {
    const testDir = type === 'unit'
      ? '__tests__/unit'
      : '__tests__/integration';

    const args = [
      'jest',
      '--testPathPattern', testDir,
      '--json',
      '--outputFile', `test-results-${type}.json`,
    ];

    if (this.config.coverage && type === 'unit') {
      args.push('--coverage', '--coverageReporters', 'json-summary');
    }

    const startTime = Date.now();

    try {
      execSync(`npx ${args.join(' ')}`, {
        cwd: this.config.projectPath,
        stdio: 'pipe',
        timeout: this.config.timeout,
      });
    } catch {
      // Jest는 테스트 실패 시 에러 코드 반환
    }

    const duration = Date.now() - startTime;

    // 결과 파싱
    const resultPath = path.join(this.config.projectPath, `test-results-${type}.json`);
    if (!fs.existsSync(resultPath)) {
      return {
        type,
        total: 0,
        passed: 0,
        failed: 0,
        skipped: 0,
        duration,
        results: [],
      };
    }

    const jestResult = JSON.parse(fs.readFileSync(resultPath, 'utf-8'));
    const results: TestResult[] = [];

    for (const testFile of jestResult.testResults || []) {
      for (const test of testFile.assertionResults || []) {
        results.push({
          name: test.fullName || test.title,
          passed: test.status === 'passed',
          duration: test.duration || 0,
          error: test.failureMessages?.[0],
          file: testFile.name,
        });
      }
    }

    // 커버리지 파싱
    let coverage;
    if (this.config.coverage && type === 'unit') {
      const coveragePath = path.join(this.config.projectPath, 'coverage/coverage-summary.json');
      if (fs.existsSync(coveragePath)) {
        const coverageData = JSON.parse(fs.readFileSync(coveragePath, 'utf-8'));
        coverage = {
          lines: coverageData.total?.lines?.pct || 0,
          branches: coverageData.total?.branches?.pct || 0,
          functions: coverageData.total?.functions?.pct || 0,
          statements: coverageData.total?.statements?.pct || 0,
        };
      }
    }

    // 정리
    try {
      fs.unlinkSync(resultPath);
    } catch {}

    return {
      type,
      total: jestResult.numTotalTests || 0,
      passed: jestResult.numPassedTests || 0,
      failed: jestResult.numFailedTests || 0,
      skipped: jestResult.numPendingTests || 0,
      duration,
      results,
      coverage,
    };
  }

  /**
   * Playwright 테스트 실행
   */
  private async runPlaywrightTests(): Promise<TestSuiteResult> {
    const startTime = Date.now();

    try {
      execSync('npx playwright test --reporter=json', {
        cwd: this.config.projectPath,
        stdio: 'pipe',
        timeout: this.config.timeout,
        env: { ...process.env, PLAYWRIGHT_JSON_OUTPUT_NAME: 'playwright-results.json' },
      });
    } catch {
      // Playwright도 실패 시 에러 코드 반환
    }

    const duration = Date.now() - startTime;

    const resultPath = path.join(this.config.projectPath, 'playwright-results.json');
    if (!fs.existsSync(resultPath)) {
      return {
        type: 'ui',
        total: 0,
        passed: 0,
        failed: 0,
        skipped: 0,
        duration,
        results: [],
      };
    }

    const playwrightResult = JSON.parse(fs.readFileSync(resultPath, 'utf-8'));
    const results: TestResult[] = [];

    let passed = 0, failed = 0, skipped = 0;

    for (const suite of playwrightResult.suites || []) {
      this.parsePlaywrightSuite(suite, results);
    }

    for (const result of results) {
      if (result.passed) passed++;
      else failed++;
    }

    // 정리
    try {
      fs.unlinkSync(resultPath);
    } catch {}

    return {
      type: 'ui',
      total: results.length,
      passed,
      failed,
      skipped,
      duration,
      results,
    };
  }

  /**
   * Playwright 스위트 재귀 파싱
   */
  private parsePlaywrightSuite(suite: Record<string, unknown>, results: TestResult[]) {
    const specs = suite.specs as Array<Record<string, unknown>> || [];
    for (const spec of specs) {
      const tests = spec.tests as Array<Record<string, unknown>> || [];
      for (const test of tests) {
        const testResults = test.results as Array<Record<string, unknown>> || [];
        const lastResult = testResults[testResults.length - 1];
        results.push({
          name: `${suite.title} > ${spec.title}`,
          passed: lastResult?.status === 'passed',
          duration: Number(lastResult?.duration || 0),
          error: lastResult?.error ? String((lastResult.error as Record<string, unknown>)?.message || '') : undefined,
          file: spec.file as string,
          line: spec.line as number,
        });
      }
    }

    // 중첩 스위트
    const suites = suite.suites as Array<Record<string, unknown>> || [];
    for (const nestedSuite of suites) {
      this.parsePlaywrightSuite(nestedSuite, results);
    }
  }

  /**
   * E2E 테스트 실행 (automation/)
   */
  private async runE2ETests(): Promise<TestSuiteResult> {
    const automationPath = path.join(this.config.projectPath, 'automation');
    const startTime = Date.now();

    if (!fs.existsSync(automationPath)) {
      return {
        type: 'e2e',
        total: 0,
        passed: 0,
        failed: 0,
        skipped: 0,
        duration: 0,
        results: [],
      };
    }

    const results: TestResult[] = [];

    // auto-suite.js 실행
    const suitePath = path.join(automationPath, 'auto-suite.js');
    if (fs.existsSync(suitePath)) {
      try {
        const output = execSync(`node ${suitePath}`, {
          cwd: automationPath,
          timeout: this.config.timeout,
          encoding: 'utf-8',
        });

        // 출력 파싱 (간단한 형식)
        const lines = output.split('\n');
        for (const line of lines) {
          const passMatch = line.match(/✓\s*(.+)/);
          const failMatch = line.match(/✗\s*(.+)/);

          if (passMatch) {
            results.push({ name: passMatch[1], passed: true, duration: 0 });
          } else if (failMatch) {
            results.push({ name: failMatch[1], passed: false, duration: 0, error: 'E2E 테스트 실패' });
          }
        }
      } catch (error) {
        const err = error as { stderr?: string };
        results.push({
          name: 'E2E Suite',
          passed: false,
          duration: 0,
          error: err.stderr || String(error),
        });
      }
    }

    const duration = Date.now() - startTime;
    const passed = results.filter(r => r.passed).length;
    const failed = results.filter(r => !r.passed).length;

    return {
      type: 'e2e',
      total: results.length,
      passed,
      failed,
      skipped: 0,
      duration,
      results,
    };
  }

  /**
   * 실패한 테스트 버그 등록
   */
  private async registerFailedTests(suites: TestSuiteResult[]): Promise<number[]> {
    const registeredIds: number[] = [];

    for (const suite of suites) {
      const failedTests = suite.results.filter(r => !r.passed);

      for (const test of failedTests) {
        try {
          const result = await bugCreate({
            type: 'bug',
            title: `[TEST] ${test.name.substring(0, 100)}`,
            summary: [
              `테스트 타입: ${suite.type}`,
              `파일: ${test.file || '알 수 없음'}`,
              test.line ? `라인: ${test.line}` : '',
              '',
              '에러:',
              test.error || '알 수 없는 에러',
              '',
              test.stack ? `스택:\n${test.stack.substring(0, 500)}` : '',
            ].filter(Boolean).join('\n'),
            priority: suite.type === 'e2e' ? 'P1' : 'P2',
            metadata: {
              source: 'test-pipeline',
              testType: suite.type,
              testName: test.name,
              file: test.file,
              line: test.line,
            },
          });

          if (result?.id) {
            registeredIds.push(result.id);
            console.log(`  📝 버그 등록: BTS-${result.id}`);
          }
        } catch (error) {
          console.error(`  ❌ 버그 등록 실패: ${test.name}`, error);
        }
      }
    }

    return registeredIds;
  }

  /**
   * 결과 요약 출력
   */
  private printSummary(result: PipelineResult) {
    const duration = result.endTime.getTime() - result.startTime.getTime();

    console.log('');
    console.log('────────────────────────────────────────────────────────────────');
    console.log('  📊 파이프라인 결과');
    console.log('────────────────────────────────────────────────────────────────');

    for (const suite of result.suites) {
      const status = suite.failed === 0 ? '✅' : '❌';
      console.log(`  ${status} ${suite.type.toUpperCase()}: ${suite.passed}/${suite.total} 통과 (${Math.round(suite.duration / 1000)}s)`);

      if (suite.coverage) {
        console.log(`     커버리지: 라인 ${suite.coverage.lines}% | 브랜치 ${suite.coverage.branches}%`);
      }
    }

    console.log('');
    const totalTests = result.suites.reduce((sum, s) => sum + s.total, 0);
    const totalPassed = result.suites.reduce((sum, s) => sum + s.passed, 0);
    const totalFailed = result.suites.reduce((sum, s) => sum + s.failed, 0);

    console.log(`  총합: ${totalPassed}/${totalTests} 통과, ${totalFailed} 실패`);
    console.log(`  소요 시간: ${Math.round(duration / 1000)}초`);

    if (result.registeredBugs.length > 0) {
      console.log(`  등록된 버그: ${result.registeredBugs.length}개`);
    }

    console.log('');
    console.log(result.success ? '  🎉 파이프라인 성공!' : '  ⚠️  파이프라인 실패');
    console.log('────────────────────────────────────────────────────────────────');
  }

  /**
   * 파이프라인 중단
   */
  abort() {
    this.abortController.abort();
  }
}

// CLI 실행
async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help')) {
    console.log('사용법: npx ts-node test-pipeline.ts [options]');
    console.log('');
    console.log('옵션:');
    console.log('  --project <path>     프로젝트 경로');
    console.log('  --unit               Unit 테스트만 실행');
    console.log('  --integration        Integration 테스트만 실행');
    console.log('  --ui                 UI 테스트 (Playwright) 실행');
    console.log('  --e2e                E2E 테스트 실행');
    console.log('  --all                모든 테스트 실행');
    console.log('  --no-coverage        커버리지 수집 안함');
    console.log('  --no-register        실패 테스트 버그 등록 안함');
    process.exit(0);
  }

  const projectIndex = args.indexOf('--project');
  const projectPath = projectIndex >= 0 ? args[projectIndex + 1] : process.cwd();

  const runAll = args.includes('--all');
  const config: Partial<PipelineConfig> = {
    projectPath,
    runUnit: runAll || args.includes('--unit') || (!args.includes('--integration') && !args.includes('--ui') && !args.includes('--e2e')),
    runIntegration: runAll || args.includes('--integration'),
    runUi: runAll || args.includes('--ui'),
    runE2e: runAll || args.includes('--e2e'),
    coverage: !args.includes('--no-coverage'),
    autoRegisterBugs: !args.includes('--no-register'),
  };

  const pipeline = new TestPipeline(config);

  process.on('SIGINT', () => {
    console.log('\n중단 요청...');
    pipeline.abort();
    process.exit(1);
  });

  const result = await pipeline.run();
  process.exit(result.success ? 0 : 1);
}

if (require.main === module) {
  main().catch(console.error);
}

export default TestPipeline;
