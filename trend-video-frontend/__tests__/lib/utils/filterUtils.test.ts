/**
 * filterUtils.ts 유닛 테스트
 */

import {
  matchesDateFilterLocal,
  matchesViewRange,
  matchesSubRange,
  matchesDurationRange,
  matchesTitleQuery,
  matchesCategories,
} from '@/lib/utils/filterUtils';

describe('filterUtils', () => {
  describe('matchesDateFilterLocal', () => {
    const now = new Date();

    it('any 필터는 항상 true 반환', () => {
      expect(matchesDateFilterLocal('2020-01-01', 'any')).toBe(true);
      expect(matchesDateFilterLocal(now.toISOString(), 'any')).toBe(true);
    });

    it('today 필터는 24시간 이내 영상만 매칭', () => {
      const today = new Date();
      const yesterday = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);

      expect(matchesDateFilterLocal(today.toISOString(), 'today')).toBe(true);
      expect(matchesDateFilterLocal(yesterday.toISOString(), 'today')).toBe(false);
    });

    it('week 필터는 7일 이내 영상만 매칭', () => {
      const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
      const tenDaysAgo = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000);

      expect(matchesDateFilterLocal(threeDaysAgo.toISOString(), 'week')).toBe(true);
      expect(matchesDateFilterLocal(tenDaysAgo.toISOString(), 'week')).toBe(false);
    });

    it('month 필터는 30일 이내 영상만 매칭', () => {
      const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
      const twoMonthsAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

      expect(matchesDateFilterLocal(twoWeeksAgo.toISOString(), 'month')).toBe(true);
      expect(matchesDateFilterLocal(twoMonthsAgo.toISOString(), 'month')).toBe(false);
    });

    it('two_months 필터는 60일 이내 영상만 매칭', () => {
      const fortyDaysAgo = new Date(now.getTime() - 40 * 24 * 60 * 60 * 1000);
      const threeMonthsAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

      expect(matchesDateFilterLocal(fortyDaysAgo.toISOString(), 'two_months')).toBe(true);
      expect(matchesDateFilterLocal(threeMonthsAgo.toISOString(), 'two_months')).toBe(false);
    });

    it('알 수 없는 필터는 true 반환', () => {
      expect(matchesDateFilterLocal('2020-01-01', 'unknown' as any)).toBe(true);
    });
  });

  describe('matchesViewRange', () => {
    it('범위 내 조회수는 true 반환', () => {
      expect(matchesViewRange(500, { min: 0, max: 1000 })).toBe(true);
      expect(matchesViewRange(1000, { min: 0, max: 1000 })).toBe(true);
      expect(matchesViewRange(0, { min: 0, max: 1000 })).toBe(true);
    });

    it('범위 밖 조회수는 false 반환', () => {
      expect(matchesViewRange(1001, { min: 0, max: 1000 })).toBe(false);
      expect(matchesViewRange(-1, { min: 0, max: 1000 })).toBe(false);
    });

    it('정확히 경계값에서 매칭', () => {
      expect(matchesViewRange(100, { min: 100, max: 200 })).toBe(true);
      expect(matchesViewRange(200, { min: 100, max: 200 })).toBe(true);
    });
  });

  describe('matchesSubRange', () => {
    it('범위 내 구독자수는 true 반환', () => {
      expect(matchesSubRange(5000, { min: 0, max: 10000 })).toBe(true);
    });

    it('범위 밖 구독자수는 false 반환', () => {
      expect(matchesSubRange(15000, { min: 0, max: 10000 })).toBe(false);
    });

    it('undefined 구독자수는 true 반환', () => {
      expect(matchesSubRange(undefined, { min: 0, max: 10000 })).toBe(true);
    });

    it('경계값 테스트', () => {
      expect(matchesSubRange(0, { min: 0, max: 100 })).toBe(true);
      expect(matchesSubRange(100, { min: 0, max: 100 })).toBe(true);
    });
  });

  describe('matchesDurationRange', () => {
    it('범위 내 영상 길이는 true 반환', () => {
      expect(matchesDurationRange(60, { min: 0, max: 120 })).toBe(true);
    });

    it('범위 밖 영상 길이는 false 반환', () => {
      expect(matchesDurationRange(180, { min: 0, max: 120 })).toBe(false);
    });

    it('경계값 테스트', () => {
      expect(matchesDurationRange(0, { min: 0, max: 60 })).toBe(true);
      expect(matchesDurationRange(60, { min: 0, max: 60 })).toBe(true);
    });
  });

  describe('matchesTitleQuery', () => {
    it('제목에 검색어가 포함되면 true 반환', () => {
      expect(matchesTitleQuery('테스트 영상입니다', '테스트')).toBe(true);
      expect(matchesTitleQuery('Hello World', 'world')).toBe(true);
    });

    it('제목에 검색어가 없으면 false 반환', () => {
      expect(matchesTitleQuery('테스트 영상입니다', '없는단어')).toBe(false);
    });

    it('빈 검색어는 true 반환', () => {
      expect(matchesTitleQuery('아무 제목', '')).toBe(true);
      expect(matchesTitleQuery('아무 제목', '   ')).toBe(true);
    });

    it('대소문자 구분 없이 매칭', () => {
      expect(matchesTitleQuery('HELLO WORLD', 'hello')).toBe(true);
      expect(matchesTitleQuery('hello world', 'HELLO')).toBe(true);
    });

    it('부분 일치 매칭', () => {
      expect(matchesTitleQuery('테스트영상', '스트')).toBe(true);
    });
  });

  describe('matchesCategories', () => {
    it('선택된 카테고리가 없으면 true 반환', () => {
      expect(matchesCategories('10', [])).toBe(true);
      expect(matchesCategories(undefined, [])).toBe(true);
    });

    it('카테고리가 선택 목록에 있으면 true 반환', () => {
      expect(matchesCategories('10', ['10', '20', '30'])).toBe(true);
    });

    it('카테고리가 선택 목록에 없으면 false 반환', () => {
      expect(matchesCategories('10', ['20', '30'])).toBe(false);
    });

    it('categoryId가 undefined이고 선택 목록이 있으면 false 반환', () => {
      expect(matchesCategories(undefined, ['10', '20'])).toBe(false);
    });
  });
});
