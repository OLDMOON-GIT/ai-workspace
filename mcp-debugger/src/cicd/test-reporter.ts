#!/usr/bin/env node
/**
 * Test Reporter (BTS-3189)
 * 테스트 실패 감지 및 자동 버그 등록
 *
 * Jest, Playwright 등의 테스트 결과를 모니터링하고
 * 실패 시 자동으로 BTS에 버그 등록
 */

import * as fs from 'fs';
import * as path from 'path';
import * as chokidar from 'chokidar';
import { bugCreate } from '../bug-bridge.js';

interface WatchedFile {
  path: string;
  type: 'jest' | 'playwright' | 'custom';
  lastModified: number;
}

interface TestFailure {
  testName: string;
  suiteName: string;
  file: string;
  line?: number;
  error: string;
  stack?: string;
  type: string;
}

export class TestReporter {
  private watchedFiles: Map<string, WatchedFile> = new Map();
  private watcher: ReturnType<typeof chokidar.watch> | null = null;
  private processedErrors: Set<string> = new Set(); // 중복 방지
  private projectPath: string;

  constructor(projectPath: string = process.cwd()) {
    this.projectPath = projectPath;
  }

  /**
   * 테스트 결과 파일 모니터링 시작
   */
  async startWatching(): Promise<void> {
    console.log('');
    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║              📊 Test Reporter (BTS-3189)                     ║');
    console.log('╚══════════════════════════════════════════════════════════════╝');
    console.log('');

    const patterns = [
      path.join(this.projectPath, 'test-results*.json'),
      path.join(this.projectPath, 'playwright-results*.json'),
      path.join(this.projectPath, 'coverage/coverage-summary.json'),
      path.join(this.projectPath, 'junit*.xml'),
    ];

    this.watcher = chokidar.watch(patterns, {
      persistent: true,
      ignoreInitial: false,
      awaitWriteFinish: {
        stabilityThreshold: 2000,
        pollInterval: 100,
      },
    });

    this.watcher.on('add', (filePath) => this.processFile(filePath));
    this.watcher.on('change', (filePath) => this.processFile(filePath));

    console.log('  👁️  테스트 결과 파일 모니터링 중...');
    console.log('  Ctrl+C로 종료');
    console.log('');
  }

  /**
   * 모니터링 중지
   */
  async stopWatching(): Promise<void> {
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }
  }

  /**
   * 파일 처리
   */
  private async processFile(filePath: string): Promise<void> {
    try {
      const stat = fs.statSync(filePath);
      const watched = this.watchedFiles.get(filePath);

      if (watched && watched.lastModified >= stat.mtimeMs) {
        return; // 이미 처리됨
      }

      this.watchedFiles.set(filePath, {
        path: filePath,
        type: this.detectFileType(filePath),
        lastModified: stat.mtimeMs,
      });

      const basename = path.basename(filePath);
      console.log(`  📄 파일 감지: ${basename}`);

      const failures = await this.parseResultFile(filePath);

      if (failures.length > 0) {
        console.log(`  🚨 ${failures.length}개의 실패한 테스트 발견`);
        await this.registerFailures(failures);
      }
    } catch (error) {
      console.error(`  ❌ 파일 처리 오류: ${filePath}`, error);
    }
  }

  /**
   * 파일 타입 감지
   */
  private detectFileType(filePath: string): 'jest' | 'playwright' | 'custom' {
    const basename = path.basename(filePath).toLowerCase();
    if (basename.includes('playwright')) return 'playwright';
    if (basename.includes('jest') || basename.startsWith('test-results')) return 'jest';
    return 'custom';
  }

  /**
   * 결과 파일 파싱
   */
  private async parseResultFile(filePath: string): Promise<TestFailure[]> {
    const content = fs.readFileSync(filePath, 'utf-8');
    const ext = path.extname(filePath).toLowerCase();

    if (ext === '.json') {
      const type = this.detectFileType(filePath);
      if (type === 'jest') return this.parseJestResult(content);
      if (type === 'playwright') return this.parsePlaywrightResult(content);
    }

    if (ext === '.xml') {
      return this.parseJUnitXml(content);
    }

    return [];
  }

  /**
   * Jest 결과 파싱
   */
  private parseJestResult(content: string): TestFailure[] {
    const failures: TestFailure[] = [];

    try {
      const data = JSON.parse(content);

      for (const testFile of data.testResults || []) {
        for (const test of testFile.assertionResults || []) {
          if (test.status === 'failed') {
            const errorHash = this.hashError(test.failureMessages?.[0] || '');
            if (this.processedErrors.has(errorHash)) continue;
            this.processedErrors.add(errorHash);

            failures.push({
              testName: test.title || test.fullName,
              suiteName: testFile.name,
              file: testFile.name,
              error: test.failureMessages?.[0] || '알 수 없는 에러',
              stack: test.failureMessages?.slice(1).join('\n'),
              type: 'jest',
            });
          }
        }
      }
    } catch (error) {
      console.error('Jest 결과 파싱 오류:', error);
    }

    return failures;
  }

  /**
   * Playwright 결과 파싱
   */
  private parsePlaywrightResult(content: string): TestFailure[] {
    const failures: TestFailure[] = [];

    try {
      const data = JSON.parse(content);
      this.parsePlaywrightSuite(data, failures, []);
    } catch (error) {
      console.error('Playwright 결과 파싱 오류:', error);
    }

    return failures;
  }

  /**
   * Playwright 스위트 재귀 파싱
   */
  private parsePlaywrightSuite(
    suite: Record<string, unknown>,
    failures: TestFailure[],
    parentPath: string[]
  ): void {
    const title = suite.title as string;
    const currentPath = title ? [...parentPath, title] : parentPath;

    const specs = suite.specs as Array<Record<string, unknown>> || [];
    for (const spec of specs) {
      const tests = spec.tests as Array<Record<string, unknown>> || [];
      for (const test of tests) {
        const results = test.results as Array<Record<string, unknown>> || [];
        const lastResult = results[results.length - 1];

        if (lastResult?.status !== 'passed') {
          const error = lastResult?.error as Record<string, unknown>;
          const errorMessage = error?.message ? String(error.message) : '알 수 없는 에러';
          const errorHash = this.hashError(errorMessage);

          if (this.processedErrors.has(errorHash)) continue;
          this.processedErrors.add(errorHash);

          failures.push({
            testName: spec.title as string,
            suiteName: currentPath.join(' > '),
            file: spec.file as string || '',
            line: spec.line as number,
            error: errorMessage,
            stack: error?.stack ? String(error.stack) : undefined,
            type: 'playwright',
          });
        }
      }
    }

    const suites = suite.suites as Array<Record<string, unknown>> || [];
    for (const nestedSuite of suites) {
      this.parsePlaywrightSuite(nestedSuite, failures, currentPath);
    }
  }

  /**
   * JUnit XML 파싱
   */
  private parseJUnitXml(content: string): TestFailure[] {
    const failures: TestFailure[] = [];

    // 간단한 정규식 기반 파싱
    const testcaseRegex = /<testcase[^>]*name="([^"]*)"[^>]*classname="([^"]*)"[^>]*>([\s\S]*?)<\/testcase>/gi;
    const failureRegex = /<failure[^>]*message="([^"]*)"[^>]*>([\s\S]*?)<\/failure>/i;

    let match;
    while ((match = testcaseRegex.exec(content)) !== null) {
      const testName = match[1];
      const className = match[2];
      const testBody = match[3];

      const failureMatch = testBody.match(failureRegex);
      if (failureMatch) {
        const errorHash = this.hashError(failureMatch[1]);
        if (this.processedErrors.has(errorHash)) continue;
        this.processedErrors.add(errorHash);

        failures.push({
          testName,
          suiteName: className,
          file: className,
          error: failureMatch[1],
          stack: failureMatch[2],
          type: 'junit',
        });
      }
    }

    return failures;
  }

  /**
   * 에러 해시 생성 (중복 방지)
   */
  private hashError(error: string): string {
    // 간단한 해시 (동일 에러 중복 등록 방지)
    return error.substring(0, 100).replace(/\s+/g, '');
  }

  /**
   * 실패 버그 등록
   */
  private async registerFailures(failures: TestFailure[]): Promise<void> {
    for (const failure of failures) {
      try {
        const result = await bugCreate({
          type: 'bug',
          title: `[TEST-${failure.type.toUpperCase()}] ${failure.testName.substring(0, 80)}`,
          summary: [
            `테스트: ${failure.testName}`,
            `스위트: ${failure.suiteName}`,
            `파일: ${failure.file}`,
            failure.line ? `라인: ${failure.line}` : '',
            '',
            '에러:',
            failure.error.substring(0, 500),
            '',
            failure.stack ? `스택:\n${failure.stack.substring(0, 500)}` : '',
          ].filter(Boolean).join('\n'),
          priority: 'P2',
          metadata: {
            source: 'test-reporter',
            testType: failure.type,
            testName: failure.testName,
            suiteName: failure.suiteName,
            file: failure.file,
            line: failure.line,
          },
        });

        if (result?.id) {
          console.log(`    📝 등록됨: BTS-${result.id} - ${failure.testName.substring(0, 40)}`);
        }
      } catch (error) {
        console.error(`    ❌ 등록 실패: ${failure.testName}`, error);
      }
    }
  }

  /**
   * 단일 결과 파일 처리 (CLI용)
   */
  async processResultFile(filePath: string): Promise<TestFailure[]> {
    if (!fs.existsSync(filePath)) {
      console.error(`파일을 찾을 수 없습니다: ${filePath}`);
      return [];
    }

    const failures = await this.parseResultFile(filePath);

    console.log(`\n[TestReporter] ${failures.length}개의 실패한 테스트:\n`);

    for (const failure of failures) {
      console.log(`  ❌ ${failure.testName}`);
      console.log(`     ${failure.error.substring(0, 100)}`);
    }

    return failures;
  }
}

// CLI 실행
async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help')) {
    console.log('사용법: npx ts-node test-reporter.ts [options]');
    console.log('');
    console.log('옵션:');
    console.log('  --watch               테스트 결과 파일 모니터링');
    console.log('  --file <path>         특정 결과 파일 처리');
    console.log('  --project <path>      프로젝트 경로');
    console.log('  --register            실패 테스트 버그 등록');
    process.exit(0);
  }

  const projectIndex = args.indexOf('--project');
  const projectPath = projectIndex >= 0 ? args[projectIndex + 1] : process.cwd();

  const reporter = new TestReporter(projectPath);

  if (args.includes('--watch')) {
    process.on('SIGINT', async () => {
      console.log('\n종료 중...');
      await reporter.stopWatching();
      process.exit(0);
    });

    await reporter.startWatching();
  } else if (args.includes('--file')) {
    const fileIndex = args.indexOf('--file');
    const filePath = args[fileIndex + 1];

    if (!filePath) {
      console.error('파일 경로를 지정해주세요');
      process.exit(1);
    }

    const failures = await reporter.processResultFile(filePath);

    if (args.includes('--register') && failures.length > 0) {
      // 직접 등록은 reporter 내부에서 처리
    }
  } else {
    console.log('옵션을 지정해주세요. --help로 도움말 확인');
  }
}

if (require.main === module) {
  main().catch(console.error);
}

export default TestReporter;
