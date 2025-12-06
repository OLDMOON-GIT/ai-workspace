/**
 * BTS-3784, BTS-14647: Next.js/Turbopack Build Error 패턴 감지 테스트
 *
 * Next.js Turbopack 빌드 에러 패턴을 Log Monitor가 감지해야 함:
 * - 'Build Error'
 * - 'Parsing.*failed'
 * - 'Expected a semicolon'
 * - BTS-14647 추가: Module not found, Failed to compile, TypeScript 에러
 */

describe('BTS-3784, BTS-14647: Next.js Build Error 패턴 감지', () => {
  // log-monitor.ts의 ERROR_PATTERNS에서 가져온 패턴들
  const BUILD_ERROR_PATTERNS = [
    { pattern: /Build Error[:\s]+(.+)/i, type: 'build_error' },
    { pattern: /Parsing\s+(?:ecmascript\s+)?source\s+code\s+failed[:\s]*(.+)/i, type: 'build_error' },
    { pattern: /Expected\s+(?:a\s+)?semicolon/i, type: 'syntax_error' },
    { pattern: /Unexpected\s+token/i, type: 'syntax_error' },
    { pattern: /(?:Turbopack|Webpack)\s+(?:error|failed)[:\s]*(.+)/i, type: 'build_error' },
    // BTS-14647: 추가 빌드 에러 패턴
    { pattern: /Module not found[:\s]*(.+)/i, type: 'build_error' },
    { pattern: /Cannot find module[:\s]*['"](.+)['"]/i, type: 'build_error' },
    { pattern: /Failed to compile/i, type: 'build_error' },
    { pattern: /Compilation failed/i, type: 'build_error' },
    { pattern: /error TS\d+:/i, type: 'typescript_error' },
    { pattern: /Type error:/i, type: 'typescript_error' },
  ];

  function detectError(line: string): { type: string; match: RegExpMatchArray } | null {
    for (const { pattern, type } of BUILD_ERROR_PATTERNS) {
      const match = line.match(pattern);
      if (match) {
        return { type, match };
      }
    }
    return null;
  }

  describe('Build Error 패턴', () => {
    const buildErrorCases = [
      'Build Error: Parsing ecmascript source code failed',
      'Build Error: Failed to compile',
      'build error: Module not found',
      'BUILD ERROR: Syntax error in file.ts',
    ];

    buildErrorCases.forEach(testCase => {
      it(`"${testCase}"를 감지해야 함`, () => {
        const result = detectError(testCase);
        expect(result).not.toBeNull();
        expect(result?.type).toBe('build_error');
      });
    });
  });

  describe('Parsing failed 패턴', () => {
    const parsingErrorCases = [
      'Parsing ecmascript source code failed - content.ts:616',
      'Parsing source code failed: Unexpected token',
      'parsing ecmascript source code failed',
      'Parsing source code failed at line 42',
    ];

    parsingErrorCases.forEach(testCase => {
      it(`"${testCase}"를 감지해야 함`, () => {
        const result = detectError(testCase);
        expect(result).not.toBeNull();
        expect(result?.type).toBe('build_error');
      });
    });
  });

  describe('Expected semicolon 패턴', () => {
    const semicolonErrorCases = [
      'Expected a semicolon',
      'Expected semicolon',
      'EXPECTED A SEMICOLON',
      'Error: Expected a semicolon at line 616',
    ];

    semicolonErrorCases.forEach(testCase => {
      it(`"${testCase}"를 감지해야 함`, () => {
        const result = detectError(testCase);
        expect(result).not.toBeNull();
        expect(result?.type).toBe('syntax_error');
      });
    });
  });

  describe('Unexpected token 패턴', () => {
    const unexpectedTokenCases = [
      'Unexpected token',
      'SyntaxError: Unexpected token }',
      'unexpected token at position 42',
    ];

    unexpectedTokenCases.forEach(testCase => {
      it(`"${testCase}"를 감지해야 함`, () => {
        const result = detectError(testCase);
        expect(result).not.toBeNull();
        expect(result?.type).toBe('syntax_error');
      });
    });
  });

  describe('Turbopack/Webpack 에러 패턴', () => {
    const bundlerErrorCases = [
      'Turbopack error: Module resolution failed',
      'Turbopack failed: Cannot find module',
      'Webpack error: Module build failed',
      'Webpack failed: Cannot resolve',
    ];

    bundlerErrorCases.forEach(testCase => {
      it(`"${testCase}"를 감지해야 함`, () => {
        const result = detectError(testCase);
        expect(result).not.toBeNull();
        expect(result?.type).toBe('build_error');
      });
    });
  });

  describe('실제 에러 메시지 테스트 (BTS-3784 원본)', () => {
    it('원본 에러 메시지를 감지해야 함', () => {
      const originalError = 'Build Error: Parsing ecmascript source code failed - content.ts:616 Expected a semicolon';

      // Build Error 패턴으로 먼저 감지됨
      const result = detectError(originalError);
      expect(result).not.toBeNull();
      expect(result?.type).toBe('build_error');
    });

    it('파싱 에러 부분만 있어도 감지해야 함', () => {
      const parsingError = 'Parsing ecmascript source code failed - content.ts:616';
      const result = detectError(parsingError);
      expect(result).not.toBeNull();
      expect(result?.type).toBe('build_error');
    });
  });

  describe('일반 로그는 감지하지 않아야 함', () => {
    const normalLogs = [
      'Server started on port 3000',
      'Compiling successfully...',
      'GET /api/status 200',
      'Connected to database',
    ];

    normalLogs.forEach(testCase => {
      it(`"${testCase}"는 감지하지 않아야 함`, () => {
        const result = detectError(testCase);
        expect(result).toBeNull();
      });
    });
  });

  // BTS-14647: 추가된 빌드 에러 패턴 테스트
  describe('BTS-14647: Module not found 패턴', () => {
    const moduleNotFoundCases = [
      "Module not found: Can't resolve 'some-module'",
      'Module not found: Error: Cannot find module',
      "module not found: Package 'lodash' not installed",
    ];

    moduleNotFoundCases.forEach(testCase => {
      it(`"${testCase}"를 감지해야 함`, () => {
        const result = detectError(testCase);
        expect(result).not.toBeNull();
        expect(result?.type).toBe('build_error');
      });
    });
  });

  describe('BTS-14647: Cannot find module 패턴', () => {
    const cannotFindModuleCases = [
      "Cannot find module 'react'",
      "Error: Cannot find module './components/Button'",
      "Cannot find module '@/lib/utils'",
    ];

    cannotFindModuleCases.forEach(testCase => {
      it(`"${testCase}"를 감지해야 함`, () => {
        const result = detectError(testCase);
        expect(result).not.toBeNull();
        expect(result?.type).toBe('build_error');
      });
    });
  });

  describe('BTS-14647: Failed to compile 패턴', () => {
    const failedToCompileCases = [
      'Failed to compile',
      'Failed to compile.',
      'FAILED TO COMPILE',
      'Error: Failed to compile the project',
    ];

    failedToCompileCases.forEach(testCase => {
      it(`"${testCase}"를 감지해야 함`, () => {
        const result = detectError(testCase);
        expect(result).not.toBeNull();
        expect(result?.type).toBe('build_error');
      });
    });
  });

  describe('BTS-14647: Compilation failed 패턴', () => {
    const compilationFailedCases = [
      'Compilation failed',
      'Compilation failed.',
      'COMPILATION FAILED',
      'TypeScript: Compilation failed with 3 errors',
    ];

    compilationFailedCases.forEach(testCase => {
      it(`"${testCase}"를 감지해야 함`, () => {
        const result = detectError(testCase);
        expect(result).not.toBeNull();
        expect(result?.type).toBe('build_error');
      });
    });
  });

  describe('BTS-14647: TypeScript 에러 패턴', () => {
    const typescriptErrorCases = [
      "error TS2304: Cannot find name 'foo'",
      "error TS2339: Property 'bar' does not exist",
      'error TS1005: Semicolon expected',
      'Type error: Property does not exist',
      "Type error: Argument of type 'string' is not assignable",
    ];

    typescriptErrorCases.forEach(testCase => {
      it(`"${testCase}"를 감지해야 함`, () => {
        const result = detectError(testCase);
        expect(result).not.toBeNull();
        expect(['typescript_error', 'build_error']).toContain(result?.type);
      });
    });
  });
});
