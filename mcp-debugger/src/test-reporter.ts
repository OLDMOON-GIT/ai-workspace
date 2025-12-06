// mcp-debugger/src/test-reporter.ts
import { execSync } from 'child_process';

interface TestResults {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  success: boolean;
}

export class TestReporter {
  /**
   * Reports test results and creates bugs for failures.
   * @param projectName The name of the project whose tests are being reported.
   * @param results The parsed test results.
   */
  report(projectName: string, results: TestResults): void {
    console.log(`--- Test Report for ${projectName} ---`);
    console.log(`Total: ${results.total}, Passed: ${results.passed}, Failed: ${results.failed}, Skipped: ${results.skipped}`);
    console.log(`Success: ${results.success}`);

    if (!results.success) {
      const bugTitle = `[Test Failure] ${projectName} - ${results.failed} tests failed`;
      const bugSummary = `Automated test run for ${projectName} detected ${results.failed} failing tests. Total: ${results.total}, Passed: ${results.passed}, Failed: ${results.failed}, Skipped: ${results.skipped}.`;
      try {
        execSync(`node bug.js add "${bugTitle}" "${bugSummary}" P1`, { stdio: 'inherit' });
        console.log(`Bug reported for test failures: "${bugTitle}"`);
      } catch (error) {
        console.error("Failed to report bug for test failures:", error);
      }
    } else {
      console.log(`All tests passed for ${projectName}.`);
    }
  }
}