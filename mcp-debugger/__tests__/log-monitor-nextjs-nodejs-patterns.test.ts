/**
 * BTS-3456: Log Monitor Next.js/Node.js 에러 감지 테스트
 *
 * 테스트 항목:
 * 1) Next.js 서버 에러 (SSR, API Route 에러) 감지
 * 2) Next.js 클라이언트 에러 (hydration, runtime 에러) 감지
 * 3) Node.js uncaughtException, unhandledRejection 감지
 * 4) Next.js 에러 패턴 (Error:, TypeError:, ReferenceError: 등) ERROR_PATTERNS 포함 여부
 */

describe('BTS-3456: Next.js/Node.js 에러 감지', () => {
  // log-monitor.ts의 ERROR_PATTERNS에서 가져온 패턴들
  const ERROR_PATTERNS = [
    // Next.js Hydration 에러
    { pattern: /Hydration failed because/i, type: 'nextjs_hydration_error', severity: 'critical' },
    { pattern: /Text content does not match server-rendered HTML/i, type: 'nextjs_hydration_error', severity: 'critical' },
    { pattern: /There was an error while hydrating/i, type: 'nextjs_hydration_error', severity: 'critical' },
    { pattern: /Hydration completed but contains mismatches/i, type: 'nextjs_hydration_error', severity: 'error' },

    // Next.js 서버 에러
    { pattern: /Server Component error[:\s]*(.+)/i, type: 'nextjs_server_error', severity: 'critical' },
    { pattern: /Server Actions?.*(?:error|failed)[:\s]*(.+)/i, type: 'nextjs_server_action_error', severity: 'critical' },
    { pattern: /Error:\s*An error occurred in the Server Components render/i, type: 'nextjs_server_error', severity: 'critical' },
    { pattern: /(?:API route|Route Handler).*(?:error|failed)[:\s]*(.+)/i, type: 'nextjs_api_error', severity: 'error' },
    { pattern: /getServerSideProps.*(?:error|failed)[:\s]*(.+)/i, type: 'nextjs_ssr_error', severity: 'error' },
    { pattern: /getStaticProps.*(?:error|failed)[:\s]*(.+)/i, type: 'nextjs_ssg_error', severity: 'error' },

    // Node.js uncaughtException, unhandledRejection
    { pattern: /uncaughtException[:\s]*(.+)/i, type: 'nodejs_uncaught_exception', severity: 'critical' },
    { pattern: /unhandledRejection[:\s]*(.+)/i, type: 'nodejs_unhandled_rejection', severity: 'critical' },
    { pattern: /UnhandledPromiseRejectionWarning[:\s]*(.+)/i, type: 'nodejs_unhandled_rejection', severity: 'error' },
    { pattern: /\[UnhandledPromiseRejection\][:\s]*(.+)/i, type: 'nodejs_unhandled_rejection', severity: 'critical' },

    // 일반 에러 패턴
    { pattern: /(?:Error|TypeError|ReferenceError|SyntaxError):\s*(.+)/, type: 'runtime_error', severity: 'error' },
    { pattern: /Unhandled Runtime Error/, type: 'runtime_error', severity: 'critical' },
  ];

  function detectError(line) {
    for (const { pattern, type, severity } of ERROR_PATTERNS) {
      const match = line.match(pattern);
      if (match) {
        return { type, severity, match };
      }
    }
    return null;
  }

  describe('1) Next.js 서버 에러 (SSR, API Route 에러) 감지', () => {
    describe('Server Component 에러', () => {
      const serverComponentCases = [
        'Server Component error: Cannot read properties of undefined',
        'server component error: Failed to fetch data',
        'Error: An error occurred in the Server Components render',
      ];

      serverComponentCases.forEach(testCase => {
        it(`"${testCase.substring(0, 50)}..."를 감지해야 함`, () => {
          const result = detectError(testCase);
          expect(result).not.toBeNull();
          expect(result?.type).toMatch(/nextjs_server/);
        });
      });
    });

    describe('Server Action 에러', () => {
      const serverActionCases = [
        'Server Action error: Database connection failed',
        'Server Actions failed: Invalid form data',
        // 'ServerAction error: ...' 형식은 Next.js에서 실제로 사용하지 않음 (공백 포함 형식만 사용)
      ];

      serverActionCases.forEach(testCase => {
        it(`"${testCase}"를 감지해야 함`, () => {
          const result = detectError(testCase);
          expect(result).not.toBeNull();
          expect(result?.type).toBe('nextjs_server_action_error');
        });
      });
    });

    describe('API Route/Route Handler 에러', () => {
      const apiRouteCases = [
        'API route error: Internal server error',
        'Route Handler failed: Invalid request body',
        'api route failed: Unauthorized',
      ];

      apiRouteCases.forEach(testCase => {
        it(`"${testCase}"를 감지해야 함`, () => {
          const result = detectError(testCase);
          expect(result).not.toBeNull();
          expect(result?.type).toBe('nextjs_api_error');
        });
      });
    });

    describe('getServerSideProps/getStaticProps 에러', () => {
      const ssrSsgCases = [
        { line: 'getServerSideProps error: Failed to fetch user data', type: 'nextjs_ssr_error' },
        { line: 'getServerSideProps failed: Database timeout', type: 'nextjs_ssr_error' },
        { line: 'getStaticProps error: Cannot read file', type: 'nextjs_ssg_error' },
        { line: 'getStaticProps failed: Invalid JSON', type: 'nextjs_ssg_error' },
      ];

      ssrSsgCases.forEach(({ line, type }) => {
        it(`"${line}"를 ${type}으로 감지해야 함`, () => {
          const result = detectError(line);
          expect(result).not.toBeNull();
          expect(result?.type).toBe(type);
        });
      });
    });
  });

  describe('2) Next.js 클라이언트 에러 (hydration, runtime 에러) 감지', () => {
    describe('Hydration 에러', () => {
      const hydrationErrorCases = [
        { line: 'Hydration failed because the initial UI does not match', severity: 'critical' },
        { line: 'Text content does not match server-rendered HTML', severity: 'critical' },
        { line: 'There was an error while hydrating this Suspense boundary', severity: 'critical' },
        { line: 'Hydration completed but contains mismatches which may cause UI bugs', severity: 'error' },
      ];

      hydrationErrorCases.forEach(({ line, severity }) => {
        it(`"${line.substring(0, 50)}..."를 ${severity} severity로 감지해야 함`, () => {
          const result = detectError(line);
          expect(result).not.toBeNull();
          expect(result?.type).toBe('nextjs_hydration_error');
          expect(result?.severity).toBe(severity);
        });
      });
    });

    describe('Runtime 에러', () => {
      const runtimeErrorCases = [
        'Unhandled Runtime Error',
        'TypeError: Cannot read properties of null',
        'ReferenceError: document is not defined',
        'SyntaxError: Unexpected token',
      ];

      runtimeErrorCases.forEach(testCase => {
        it(`"${testCase}"를 감지해야 함`, () => {
          const result = detectError(testCase);
          expect(result).not.toBeNull();
          expect(result?.type).toBe('runtime_error');
        });
      });
    });
  });

  describe('3) Node.js uncaughtException, unhandledRejection 감지', () => {
    describe('uncaughtException', () => {
      const uncaughtCases = [
        'uncaughtException: Cannot read property of undefined',
        'UNCAUGHTEXCEPTION: Process crashed',
        'uncaughtException TypeError: null is not a function',
      ];

      uncaughtCases.forEach(testCase => {
        it(`"${testCase}"를 감지해야 함`, () => {
          const result = detectError(testCase);
          expect(result).not.toBeNull();
          expect(result?.type).toBe('nodejs_uncaught_exception');
          expect(result?.severity).toBe('critical');
        });
      });
    });

    describe('unhandledRejection', () => {
      const unhandledCases = [
        { line: 'unhandledRejection: Promise rejected without catch', severity: 'critical' },
        { line: 'UnhandledPromiseRejectionWarning: Error: Connection refused', severity: 'error' },
        { line: '[UnhandledPromiseRejection]: This error originated from rejection', severity: 'critical' },
      ];

      unhandledCases.forEach(({ line, severity }) => {
        it(`"${line.substring(0, 50)}..."를 ${severity} severity로 감지해야 함`, () => {
          const result = detectError(line);
          expect(result).not.toBeNull();
          expect(result?.type).toBe('nodejs_unhandled_rejection');
          expect(result?.severity).toBe(severity);
        });
      });
    });
  });

  describe('4) 일반 에러 패턴 (Error:, TypeError: 등)', () => {
    const errorPatternCases = [
      { line: 'Error: Something went wrong', type: 'runtime_error' },
      { line: 'TypeError: undefined is not a function', type: 'runtime_error' },
      { line: 'ReferenceError: x is not defined', type: 'runtime_error' },
      { line: 'SyntaxError: Unexpected identifier', type: 'runtime_error' },
    ];

    errorPatternCases.forEach(({ line, type }) => {
      it(`"${line}"를 ${type}으로 감지해야 함`, () => {
        const result = detectError(line);
        expect(result).not.toBeNull();
        expect(result?.type).toBe(type);
      });
    });
  });

  describe('5) 실제 에러 메시지 테스트 (Next.js/Node.js 실제 출력)', () => {
    it('Next.js Hydration 에러 (실제 출력)', () => {
      const realError = 'Warning: Text content did not match. Server: "0" Client: "1"\nError: Hydration failed because the initial UI does not match what was rendered on the server.';
      const result = detectError(realError);
      expect(result).not.toBeNull();
      expect(result?.type).toBe('nextjs_hydration_error');
    });

    it('Next.js Server Component 에러 (실제 출력)', () => {
      const realError = 'Error: An error occurred in the Server Components render. The specific message is omitted in production builds.';
      const result = detectError(realError);
      expect(result).not.toBeNull();
      expect(result?.type).toBe('nextjs_server_error');
    });

    it('Node.js UnhandledPromiseRejection (실제 출력)', () => {
      const realError = '(node:12345) UnhandledPromiseRejectionWarning: Error: ECONNREFUSED';
      const result = detectError(realError);
      expect(result).not.toBeNull();
      expect(result?.type).toBe('nodejs_unhandled_rejection');
    });

    it('Node.js uncaughtException (실제 출력)', () => {
      const realError = "[2024-01-01 12:00:00] uncaughtException: TypeError: Cannot read property 'id' of undefined";
      const result = detectError(realError);
      expect(result).not.toBeNull();
      expect(result?.type).toBe('nodejs_uncaught_exception');
    });
  });

  describe('6) 일반 로그는 감지하지 않아야 함', () => {
    const normalLogs = [
      'Server started on port 3000',
      'GET /api/status 200 in 45ms',
      'Compiled successfully',
      'Connected to database',
      'User logged in: user@example.com',
      'Cache hit for key: abc123',
    ];

    normalLogs.forEach(testCase => {
      it(`"${testCase}"는 감지하지 않아야 함`, () => {
        const result = detectError(testCase);
        expect(result).toBeNull();
      });
    });
  });
});
