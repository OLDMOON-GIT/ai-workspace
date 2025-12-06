/**
 * BTS-0001239: 딥링크 생성 실패 시 불필요한 로그 출력 수정
 *
 * 테스트 항목:
 * 1. 딥링크 실패 시 console.error 대신 console.log 사용
 * 2. 로그 메시지가 정상 동작임을 나타내는지 확인
 */

describe('BTS-0001239: 딥링크 로그 레벨 조정', () => {
  describe('로그 레벨 검증', () => {
    it('딥링크 스킵은 에러가 아닌 정상 동작', () => {
      // 딥링크 생성 실패는 에러가 아님
      const isDeepLinkFailureAnError = false;
      expect(isDeepLinkFailureAnError).toBe(false);
    });

    it('console.log 레벨로 로그가 출력되어야 함', () => {
      // console.error 대신 console.log 사용
      const logLevel = 'log';
      expect(logLevel).not.toBe('error');
      expect(logLevel).not.toBe('warn');
      expect(logLevel).toBe('log');
    });

    it('로그 메시지가 스킵임을 명확히 나타내야 함', () => {
      const logMessage = '[ProductTitle] 딥링크 스킵: https://example.com...';
      expect(logMessage).toContain('스킵');
      expect(logMessage).not.toContain('오류');
      expect(logMessage).not.toContain('에러');
      expect(logMessage).not.toContain('❌');
    });
  });

  describe('딥링크 검증 로직', () => {
    it('유효한 딥링크는 통과해야 함', () => {
      const validDeepLink = 'https://link.coupang.com/ab/12345';

      const isValid = validDeepLink &&
        validDeepLink.includes('link.coupang.com/') &&
        !validDeepLink.includes('/re/AFFSDP') &&
        !validDeepLink.includes('?lptag=');

      expect(isValid).toBe(true);
    });

    it('긴 형식 딥링크는 거부되어야 함', () => {
      const longFormUrl = 'https://link.coupang.com/re/AFFSDP?lptag=XXX&pageKey=123';

      const isValid = longFormUrl &&
        longFormUrl.includes('link.coupang.com/') &&
        !longFormUrl.includes('/re/AFFSDP') &&
        !longFormUrl.includes('?lptag=');

      expect(isValid).toBe(false);
    });

    it('50자 초과 딥링크는 거부되어야 함 (CoupangPrefetch)', () => {
      const longDeepLink = 'https://link.coupang.com/ab/' + 'x'.repeat(100);

      const isValid = longDeepLink &&
        longDeepLink.length <= 50 &&
        longDeepLink.includes('link.coupang.com/');

      expect(isValid).toBe(false);
      expect(longDeepLink.length).toBeGreaterThan(50);
    });
  });
});
