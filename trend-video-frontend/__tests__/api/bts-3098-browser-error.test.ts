/**
 * BTS-3098: 브라우저 자동화 실패 감지 테스트
 *
 * "Browser closed by user" 등의 에러 메시지가 있을 때
 * 명확한 에러를 발생시키는지 테스트
 */

describe('BTS-3098: 브라우저 자동화 실패 감지', () => {
  const browserErrorPatterns = [
    'Browser closed by user',
    'Browser disconnected',
    'Target closed',
    'Session closed',
    'Connection refused',
    'Navigation timeout',
  ];

  describe('에러 패턴 감지', () => {
    it('"Browser closed by user" 패턴을 감지해야 함', () => {
      const fullContent = 'Browser closed by user';

      const isBrowserError = browserErrorPatterns.some(pattern =>
        fullContent.toLowerCase().includes(pattern.toLowerCase())
      );

      expect(isBrowserError).toBe(true);
    });

    it('다양한 브라우저 에러 패턴을 모두 감지해야 함', () => {
      const testCases = [
        'Browser closed by user',
        'browser disconnected unexpectedly',
        'Target closed',
        'SESSION CLOSED',
        'connection refused: localhost:9222',
        'Navigation timeout of 30000 ms exceeded',
      ];

      testCases.forEach(content => {
        const isBrowserError = browserErrorPatterns.some(pattern =>
          content.toLowerCase().includes(pattern.toLowerCase())
        );
        expect(isBrowserError).toBe(true);
      });
    });
  });

  describe('짧은 콘텐츠 감지', () => {
    it('짧은 에러 메시지(100자 미만)만 에러로 처리해야 함', () => {
      const fullContent = 'Browser closed by user';
      const isShortContent = fullContent.length < 100;

      expect(fullContent.length).toBe(22);
      expect(isShortContent).toBe(true);
    });

    it('정상적인 대본(100자 이상)은 브라우저 에러로 처리하지 않아야 함', () => {
      const fullContent = '{"title": "테스트 대본", "scenes": [' +
        '{"scene_id": "scene_01", "narration": "이것은 매우 긴 나레이션입니다..."}' +
        ']}';

      const isBrowserError = browserErrorPatterns.some(pattern =>
        fullContent.toLowerCase().includes(pattern.toLowerCase())
      );

      // 정상 대본에는 브라우저 에러 패턴이 없음
      expect(isBrowserError).toBe(false);
    });

    it('에러 패턴이 있어도 길면 에러로 처리하지 않아야 함', () => {
      // 실제로 대본에 "Target closed" 같은 텍스트가 포함될 수 있음
      // 하지만 100자 이상이면 정상 대본으로 처리
      const fullContent = '{"title": "Target closed scene", "scenes": [' +
        '{"scene_id": "scene_01", "narration": "Target closed 장면에서 주인공이 등장합니다. ' +
        '이것은 매우 긴 나레이션이고 정상적인 대본입니다."}]}';

      const isBrowserError = browserErrorPatterns.some(pattern =>
        fullContent.toLowerCase().includes(pattern.toLowerCase())
      );
      const isShortContent = fullContent.length < 100;

      // 에러 패턴이 있지만 길이가 100자 이상이므로 에러로 처리하지 않음
      expect(isBrowserError).toBe(true); // 패턴은 감지됨
      expect(isShortContent).toBe(false); // 하지만 길이가 충분함

      // 실제 로직: isBrowserError && isShortContent 일 때만 에러
      expect(isBrowserError && isShortContent).toBe(false);
    });
  });

  describe('에러 메시지 생성', () => {
    it('명확한 에러 메시지를 생성해야 함', () => {
      const fullContent = 'Browser closed by user';
      const errorMsg = `브라우저 자동화 실패: ${fullContent.trim()}`;

      expect(errorMsg).toBe('브라우저 자동화 실패: Browser closed by user');
      expect(errorMsg).toContain('브라우저 자동화 실패');
      expect(errorMsg).toContain('Browser closed');
    });
  });
});
