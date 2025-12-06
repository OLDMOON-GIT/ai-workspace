/**
 * Test Reporter Tests
 */

import {
  parseJestOutput,
  generateTestReport,
  TestRunResult
} from '../../src/pipeline/test-reporter';

describe('Test Reporter', () => {
  describe('parseJestOutput', () => {
    it('should parse passing test output', () => {
      const output = `
PASS  src/__tests__/example.test.ts
  Example Suite
    ✓ should pass (5 ms)
    ✓ another test (3 ms)

Test Suites: 1 passed, 1 total
Tests:       2 passed, 2 total
Time:        1.23 s
`;

      const result = parseJestOutput(output);

      expect(result.totalPassed).toBe(2);
      expect(result.totalFailed).toBe(0);
      expect(result.suites.length).toBe(1);
      expect(result.suites[0].passed).toBe(2);
    });

    it('should parse failing test output', () => {
      const output = `
FAIL  src/__tests__/failing.test.ts
  Failing Suite
    ✕ should fail (10 ms)
    ✓ should pass (2 ms)

  ● Failing Suite › should fail

    expect(received).toBe(expected)

    Expected: 1
    Received: 2

Test Suites: 1 failed, 1 total
Tests:       1 failed, 1 passed, 2 total
Time:        2.34 s
`;

      const result = parseJestOutput(output);

      expect(result.totalPassed).toBe(1);
      expect(result.totalFailed).toBe(1);
      expect(result.suites[0].failed).toBe(1);
    });

    it('should parse skipped tests', () => {
      const output = `
PASS  src/__tests__/skip.test.ts
  Skip Suite
    ✓ should run (1 ms)
    ○ skipped pending test
    ○ another skipped

Test Suites: 1 passed, 1 total
Tests:       2 skipped, 1 passed, 3 total
Time:        0.5 s
`;

      const result = parseJestOutput(output);

      expect(result.totalSkipped).toBe(2);
    });

    it('should extract test duration', () => {
      const output = `
PASS  test.ts
  Suite
    ✓ fast test (1 ms)
    ✓ slow test (500 ms)

Time:        5.67 s
`;

      const result = parseJestOutput(output);

      expect(result.duration).toBeCloseTo(5670, 0);
      expect(result.suites[0].tests[0].duration).toBe(1);
      expect(result.suites[0].tests[1].duration).toBe(500);
    });

    it('should handle multiple test suites', () => {
      const output = `
PASS  src/a.test.ts
  Suite A
    ✓ test 1 (1 ms)

PASS  src/b.test.ts
  Suite B
    ✓ test 2 (2 ms)

FAIL  src/c.test.ts
  Suite C
    ✕ test 3 (3 ms)

Test Suites: 1 failed, 2 passed, 3 total
Tests:       1 failed, 2 passed, 3 total
Time:        3 s
`;

      const result = parseJestOutput(output);

      expect(result.suites.length).toBe(3);
      expect(result.totalPassed).toBe(2);
      expect(result.totalFailed).toBe(1);
    });
  });

  describe('generateTestReport', () => {
    it('should generate markdown report for passing tests', () => {
      const result: TestRunResult = {
        startTime: new Date(),
        endTime: new Date(),
        duration: 5000,
        exitCode: 0,
        totalPassed: 10,
        totalFailed: 0,
        totalSkipped: 2,
        suites: [
          {
            suiteName: 'example.test.ts',
            suitePath: 'src/__tests__/example.test.ts',
            tests: [],
            passed: 10,
            failed: 0,
            skipped: 2,
            duration: 5000
          }
        ]
      };

      const report = generateTestReport(result);

      expect(report).toContain('# Test Report ✅');
      expect(report).toContain('**Pass Rate**: 100.0%');
      expect(report).toContain('✅ Passed | 10');
      expect(report).toContain('⏭️ Skipped | 2');
    });

    it('should generate markdown report with failed tests', () => {
      const result: TestRunResult = {
        startTime: new Date(),
        endTime: new Date(),
        duration: 3000,
        exitCode: 1,
        totalPassed: 5,
        totalFailed: 2,
        totalSkipped: 0,
        suites: [
          {
            suiteName: 'failing.test.ts',
            suitePath: 'src/__tests__/failing.test.ts',
            tests: [
              {
                testName: 'should fail',
                testPath: 'src/__tests__/failing.test.ts',
                status: 'failed',
                duration: 100,
                errorMessage: 'Expected 1 to be 2',
                failureDetails: {
                  expected: '1',
                  received: '2'
                }
              }
            ],
            passed: 5,
            failed: 2,
            skipped: 0,
            duration: 3000
          }
        ]
      };

      const report = generateTestReport(result);

      expect(report).toContain('# Test Report ❌');
      expect(report).toContain('## Failed Tests');
      expect(report).toContain('#### ❌ should fail');
      expect(report).toContain('**Expected**: 1');
      expect(report).toContain('**Received**: 2');
    });

    it('should calculate pass rate correctly', () => {
      const result: TestRunResult = {
        startTime: new Date(),
        endTime: new Date(),
        duration: 1000,
        exitCode: 1,
        totalPassed: 3,
        totalFailed: 1,
        totalSkipped: 0,
        suites: []
      };

      const report = generateTestReport(result);

      expect(report).toContain('**Pass Rate**: 75.0%');
    });
  });
});
