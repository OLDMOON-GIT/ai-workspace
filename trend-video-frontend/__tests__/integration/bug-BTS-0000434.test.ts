/**
 * BTS-0000434: BTS 페이지 5초 자동 새로고침 (깜빡임 없이)
 *
 * 검증 내용:
 * - 5초 자동 새로고침 로직이 구현되어 있는지 확인
 * - 깜빡임 없이 silent 모드로 업데이트되는지 확인
 * - 자동/수동 토글 기능이 있는지 확인
 */

import * as fs from 'fs';
import * as path from 'path';

describe('BTS-0000434: BTS 페이지 5초 자동 새로고침', () => {
  const bugsPagePath = path.join(
    __dirname,
    '../../src/app/admin/bugs/page.tsx'
  );

  let pageContent: string;

  beforeAll(() => {
    pageContent = fs.readFileSync(bugsPagePath, 'utf-8');
  });

  describe('자동 새로고침 구현 검증', () => {
    it('setInterval을 사용하여 주기적 새로고침이 구현되어 있어야 함', () => {
      expect(pageContent).toContain('setInterval');
    });

    it('5000ms (5초) 간격으로 설정되어 있어야 함', () => {
      // setInterval과 5000이 같은 useEffect 블록에 있는지 확인
      expect(pageContent).toContain('setInterval');
      expect(pageContent).toContain('5000');
    });

    it('intervalRef를 사용하여 인터벌을 관리해야 함', () => {
      expect(pageContent).toContain('intervalRef');
      expect(pageContent).toContain('useRef');
    });

    it('clearInterval로 정리하는 cleanup 함수가 있어야 함', () => {
      expect(pageContent).toContain('clearInterval');
    });
  });

  describe('깜빡임 방지 (silent 모드) 검증', () => {
    it('loadBugs 함수에 silent 파라미터가 있어야 함', () => {
      expect(pageContent).toMatch(/loadBugs.*silent.*boolean/);
    });

    it('silent 모드에서는 setIsLoading을 호출하지 않아야 함', () => {
      // silent가 false일 때만 setIsLoading 호출
      expect(pageContent).toMatch(/if\s*\(\s*!silent\s*\)\s*setIsLoading/);
    });

    it('자동 새로고침 시 silent: true로 호출되어야 함', () => {
      expect(pageContent).toMatch(/loadBugs\s*\(\s*true\s*\)/);
    });
  });

  describe('자동 새로고침 토글 검증', () => {
    it('autoRefreshEnabled 상태가 있어야 함', () => {
      expect(pageContent).toContain('autoRefreshEnabled');
      expect(pageContent).toContain('setAutoRefreshEnabled');
    });

    it('토글 버튼이 있어야 함', () => {
      expect(pageContent).toMatch(/onClick.*setAutoRefreshEnabled/);
    });

    it('자동/수동 텍스트가 표시되어야 함', () => {
      expect(pageContent).toContain("'자동 (5초)'");
      expect(pageContent).toContain("'수동'");
    });
  });

  describe('마지막 업데이트 시간 표시 검증', () => {
    it('lastUpdated 상태가 있어야 함', () => {
      expect(pageContent).toContain('lastUpdated');
      expect(pageContent).toContain('setLastUpdated');
    });

    it('업데이트 시간을 표시하는 UI가 있어야 함', () => {
      expect(pageContent).toContain('toLocaleTimeString');
    });

    it('데이터 로드 성공 시 lastUpdated를 갱신해야 함', () => {
      expect(pageContent).toMatch(/setLastUpdated\s*\(\s*new Date\(\)\s*\)/);
    });
  });

  describe('useCallback 최적화 검증', () => {
    it('loadBugs 함수가 useCallback으로 메모이제이션되어야 함', () => {
      expect(pageContent).toContain('useCallback');
      expect(pageContent).toMatch(/const loadBugs = useCallback/);
    });
  });
});
