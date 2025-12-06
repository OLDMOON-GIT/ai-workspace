/**
 * BTS-3167: "Browser closed by user" 에러 무시 패턴 테스트
 *
 * 사용자가 브라우저를 닫았을 때 발생하는 에러는
 * 버그로 등록되지 않아야 함
 */

describe('BTS-3167: Browser closed 패턴 무시', () => {
  // log-monitor.ts의 IGNORE_PATTERNS에서 가져온 패턴
  const browserClosedPattern = /Browser.*(?:closed|has been closed)/i;

  describe('무시해야 하는 패턴', () => {
    const ignoreCases = [
      'Browser closed by user',
      'Browser has been closed',
      'browser closed',
      'BROWSER CLOSED BY USER',
      'The Browser was closed unexpectedly',
      'Browser or page has been closed',
    ];

    ignoreCases.forEach(testCase => {
      it(`"${testCase}"는 무시해야 함`, () => {
        expect(browserClosedPattern.test(testCase)).toBe(true);
      });
    });
  });

  describe('감지해야 하는 패턴 (무시하면 안됨)', () => {
    const detectCases = [
      'Connection refused',
      'Navigation timeout',
      'Error: Failed to connect',
      'TypeError: undefined',
    ];

    detectCases.forEach(testCase => {
      it(`"${testCase}"는 감지해야 함 (무시 패턴에 매칭 안됨)`, () => {
        expect(browserClosedPattern.test(testCase)).toBe(false);
      });
    });
  });

  describe('전체 IGNORE_PATTERNS 테스트', () => {
    // log-monitor.ts의 전체 무시 패턴
    const IGNORE_PATTERNS = [
      /GET\s+\/admin\/bts\s+500/i,
      /\(?딥링크 오류\)?.*이번 실행 스킵/i,
      /이번 실행 스킵/i,
      /상품 제목 생성 실패.*딥링크/i,
      /stopped by user/i,
      /Browser.*(?:closed|has been closed)/i,
      /User canceled/i,
      /file_missing.*\/story/i,
      /ENOENT/i,
      /no such file or directory/i,
      /이메일 전송 완료/i,
      /story\.json$/i,
      /tasks[\\\/][a-f0-9-]+[\\\/]story\.json/i,
    ];

    function shouldIgnore(line: string): boolean {
      return IGNORE_PATTERNS.some(pattern => pattern.test(line));
    }

    it('"Browser closed by user"는 무시해야 함', () => {
      expect(shouldIgnore('Browser closed by user')).toBe(true);
    });

    it('"stopped by user"는 무시해야 함', () => {
      expect(shouldIgnore('stopped by user')).toBe(true);
    });

    it('"User canceled"는 무시해야 함', () => {
      expect(shouldIgnore('User canceled')).toBe(true);
    });

    it('실제 에러는 감지해야 함', () => {
      expect(shouldIgnore('TypeError: Cannot read property')).toBe(false);
      expect(shouldIgnore('Error: Connection failed')).toBe(false);
    });
  });
});
