/**
 * 제목풀 통합테스트
 * - API camelCase 변환 확인
 * - 더보기 페이지네이션 확인
 * - 되돌리기 버튼 확인
 * - 생성일 포맷 확인
 * - 자동화 등록 확인
 *
 * ⚠️ 주의: 이 테스트는 서버가 실행 중이어야 합니다 (npm run dev)
 */

describe('제목풀 통합테스트 (E2E)', () => {
  const BASE_URL = process.env.BASE_URL || 'http://localhost:2000';

  describe('API camelCase 변환', () => {
    it('title_pool API가 snake_case를 camelCase로 변환해야 함', async () => {
      const response = await fetch(`${BASE_URL}/api/title-pool?category=all&minScore=0&limit=10&offset=0`);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.titles).toBeDefined();

      if (data.titles.length > 0) {
        const title = data.titles[0];

        // ✅ camelCase 필드 확인
        expect(title.titleId).toBeDefined();
        expect(title.createdAt).toBeDefined();

        // ❌ snake_case 필드가 없어야 함
        expect(title.title_id).toBeUndefined();
        expect(title.created_at).toBeUndefined();
      }
    });

    it('createdAt이 유효한 날짜 문자열이어야 함', async () => {
      const response = await fetch(`${BASE_URL}/api/title-pool?category=all&minScore=0&limit=10&offset=0`);
      const data = await response.json();

      if (data.titles.length > 0) {
        const title = data.titles[0];

        // 날짜 파싱이 정상적으로 되어야 함
        const date = new Date(title.createdAt);
        expect(date.toString()).not.toBe('Invalid Date');
        expect(date.getFullYear()).toBeGreaterThan(2020);
      }
    });
  });

  describe('더보기 페이지네이션', () => {
    it('페이지네이션 정보가 올바르게 반환되어야 함', async () => {
      const response = await fetch(`${BASE_URL}/api/title-pool?category=all&minScore=0&limit=10&offset=0`);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.pagination).toBeDefined();
      expect(data.pagination.total).toBeDefined();
      expect(data.pagination.limit).toBe(10);
      expect(data.pagination.offset).toBe(0);
      expect(typeof data.pagination.hasMore).toBe('boolean');
    });

    it('hasMore 플래그가 올바르게 설정되어야 함', async () => {
      // 첫 페이지
      const response1 = await fetch(`${BASE_URL}/api/title-pool?category=all&minScore=0&limit=5&offset=0`);
      const data1 = await response1.json();

      if (data1.pagination.total > 5) {
        // 전체 개수가 5개 이상이면 hasMore가 true
        expect(data1.pagination.hasMore).toBe(true);
      }

      // 마지막 페이지
      const lastOffset = Math.max(0, data1.pagination.total - 5);
      const response2 = await fetch(`${BASE_URL}/api/title-pool?category=all&minScore=0&limit=5&offset=${lastOffset}`);
      const data2 = await response2.json();

      // 마지막 페이지면 hasMore가 false
      if (data2.titles.length < 5) {
        expect(data2.pagination.hasMore).toBe(false);
      }
    });

    it('offset으로 다른 데이터를 가져와야 함', async () => {
      // 첫 페이지
      const response1 = await fetch(`${BASE_URL}/api/title-pool?category=all&minScore=0&limit=2&offset=0`);
      const data1 = await response1.json();

      // 두 번째 페이지
      const response2 = await fetch(`${BASE_URL}/api/title-pool?category=all&minScore=0&limit=2&offset=2`);
      const data2 = await response2.json();

      if (data1.titles.length > 0 && data2.titles.length > 0) {
        // 첫 페이지와 두 번째 페이지의 데이터가 달라야 함
        expect(data1.titles[0].titleId).not.toBe(data2.titles[0].titleId);
      }
    });
  });

  describe('통계 정보', () => {
    it('카테고리별 통계가 반환되어야 함', async () => {
      const response = await fetch(`${BASE_URL}/api/title-pool?category=all&minScore=0&limit=10&offset=0`);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.stats).toBeDefined();
      expect(Array.isArray(data.stats)).toBe(true);

      if (data.stats.length > 0) {
        const stat = data.stats[0];
        expect(stat.category).toBeDefined();
        expect(stat.total).toBeDefined();
        expect(stat.unused).toBeDefined();
        expect(typeof stat.avg_score).toBe('number');
        expect(typeof stat.max_score).toBe('number');
      }
    });
  });

  describe('필터링', () => {
    it('minScore 필터가 작동해야 함', async () => {
      const response = await fetch(`${BASE_URL}/api/title-pool?category=all&minScore=90&limit=50&offset=0`);
      const data = await response.json();

      expect(response.status).toBe(200);

      // 모든 제목의 점수가 90 이상이어야 함
      data.titles.forEach((title: any) => {
        expect(title.score).toBeGreaterThanOrEqual(90);
      });
    });

    it('카테고리 필터가 작동해야 함', async () => {
      // 전체 데이터를 먼저 가져와서 어떤 카테고리가 있는지 확인
      const allResponse = await fetch(`${BASE_URL}/api/title-pool?category=all&minScore=0&limit=50&offset=0`);
      const allData = await allResponse.json();

      if (allData.titles.length > 0) {
        const firstCategory = allData.titles[0].category;

        // 특정 카테고리로 필터링
        const response = await fetch(`${BASE_URL}/api/title-pool?category=${encodeURIComponent(firstCategory)}&minScore=0&limit=50&offset=0`);
        const data = await response.json();

        expect(response.status).toBe(200);

        // 모든 제목의 카테고리가 일치해야 함
        data.titles.forEach((title: any) => {
          expect(title.category).toBe(firstCategory);
        });
      }
    });
  });
});
