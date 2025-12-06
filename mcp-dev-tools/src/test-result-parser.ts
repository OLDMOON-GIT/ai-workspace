// mcp-dev-tools/src/test-result-parser.ts

export class TestResultParser {
  /**
   * Parses the output of an npm test command to extract test statistics.
   * @param testOutput The full string output from the npm test command.
   * @returns An object containing test statistics (total, passed, failed, skipped)
   *          and an overall success boolean.
   */
  parse(testOutput: string): { total: number; passed: number; failed: number; skipped: number; success: boolean } {
    const results = {
      total: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
      success: false,
    };

    const lines = testOutput.split('\n');

    for (const line of lines) {
      // Example: Test Suites: 46 failed, 69 passed, 115 total
      const suiteMatch = line.match(/Test Suites: (\d+) failed, (\d+) passed, (\d+) total/);
      if (suiteMatch) {
        // We are more interested in the overall test count from the 'Tests' line
        // but can extract suite info if needed.
      }

      // Example: Tests: 247 failed, 24 skipped, 1523 passed, 1794 total
      const testMatch = line.match(/Tests:\s+(\d+) failed, (\d+) skipped, (\d+) passed, (\d+) total/);
      if (testMatch) {
        results.failed = parseInt(testMatch[1], 10);
        results.skipped = parseInt(testMatch[2], 10);
        results.passed = parseInt(testMatch[3], 10);
        results.total = parseInt(testMatch[4], 10);
        break; // Assume this is the final summary line we care about
      }
    }

    results.success = results.failed === 0 && results.total > 0;
    return results;
  }
}
