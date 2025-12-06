import {
  evaluateTitleLocal,
  generateTitleLocal,
  generateTitlesLocal,
  battleTitlesLocal,
  generateOptimalTitleLocal,
  ScoreResult,
} from '@/lib/title-engine-local';

describe('title-engine-local', () => {
  describe('evaluateTitleLocal', () => {
    test('시니어사연 카테고리의 높은 점수 제목을 평가해야 함', () => {
      const title = '며느리를 무시했던 시어머니, 10년 후 그녀가 CEO인 걸 알고 충격적인 이유';
      const result = evaluateTitleLocal(title, '시니어사연');

      expect(result.score).toBeGreaterThan(70);
      expect(result.reasons).toContain('✅ 길이');
      expect(result.reasons.some(r => r.includes('카테고리'))).toBeTruthy();
    });

    test('복수극 카테고리의 제목을 평가해야 함', () => {
      const title = '"넌 평생 이렇게 살아" 비웃던 팀장, 5년 후 CEO인 그녀 앞에서 무릎 꿇은 이유';
      const result = evaluateTitleLocal(title, '복수극');

      expect(result.score).toBeGreaterThan(60);
      expect(result.reasons.length).toBeGreaterThan(0);
    });

    test('탈북자사연 카테고리를 평가해야 함', () => {
      const title = '탈북 3년 만에 대한민국에서 성공한 그녀의 충격적인 진실';
      const result = evaluateTitleLocal(title, '탈북자사연');

      expect(result.score).toBeGreaterThan(50);
    });

    test('짧은 제목은 낮은 점수를 받아야 함', () => {
      const title = '짧은 제목';
      const result = evaluateTitleLocal(title, '복수극');

      expect(result.score).toBeLessThan(50);
      expect(result.reasons.some(r => r.includes('길이'))).toBeTruthy();
    });

    test('카테고리 키워드가 없으면 감점되어야 함', () => {
      const title = '이것은 아무 키워드도 없는 일반적인 제목입니다 길이는 충분히 길게';
      const result = evaluateTitleLocal(title, '시니어사연');

      expect(result.reasons.some(r => r.includes('❌ 카테고리'))).toBeTruthy();
    });

    test('시간 표현이 있으면 가산점을 받아야 함', () => {
      const title1 = '10년 후 후회한 이유';
      const title2 = '후회한 이유';

      const result1 = evaluateTitleLocal(title1, '복수극');
      const result2 = evaluateTitleLocal(title2, '복수극');

      expect(result1.score).toBeGreaterThan(result2.score);
    });

    test('감정 키워드가 많으면 높은 점수를 받아야 함', () => {
      const title = '후회와 충격, 복수와 반전의 결말';
      const result = evaluateTitleLocal(title, '복수극');

      expect(result.reasons.some(r => r.includes('✅ 감정'))).toBeTruthy();
    });

    test('훅 엔딩이 있으면 가산점을 받아야 함', () => {
      const title1 = '무시했던 그녀가 성공한 이유';
      const title2 = '무시했던 그녀가 성공함';

      const result1 = evaluateTitleLocal(title1, '복수극');
      const result2 = evaluateTitleLocal(title2, '복수극');

      expect(result1.score).toBeGreaterThan(result2.score);
    });

    test('알 수 없는 카테고리도 처리해야 함', () => {
      const title = '일반적인 제목';
      const result = evaluateTitleLocal(title, '알수없는카테고리');

      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
    });
  });

  describe('generateTitleLocal', () => {
    test('시니어사연 카테고리의 제목을 생성해야 함', () => {
      const title = generateTitleLocal('시니어사연');

      expect(title).not.toBeNull();
      expect(typeof title).toBe('string');
      expect(title!.length).toBeGreaterThan(10);
    });

    test('복수극 카테고리의 제목을 생성해야 함', () => {
      const title = generateTitleLocal('복수극');

      expect(title).not.toBeNull();
      expect(typeof title).toBe('string');
    });

    test('탈북자사연 카테고리의 제목을 생성해야 함', () => {
      const title = generateTitleLocal('탈북자사연');

      expect(title).not.toBeNull();
    });

    test('북한탈북자사연 카테고리의 제목을 생성해야 함', () => {
      const title = generateTitleLocal('북한탈북자사연');

      expect(title).not.toBeNull();
    });

    test('막장드라마 카테고리의 제목을 생성해야 함', () => {
      const title = generateTitleLocal('막장드라마');

      expect(title).not.toBeNull();
    });

    test('존재하지 않는 카테고리는 null을 반환해야 함', () => {
      const title = generateTitleLocal('존재하지않는카테고리');

      expect(title).toBeNull();
    });

    test('생성된 제목은 템플릿에서 플레이스홀더가 모두 치환되어야 함', () => {
      const title = generateTitleLocal('복수극');

      expect(title).not.toContain('{');
      expect(title).not.toContain('}');
    });
  });

  describe('generateTitlesLocal', () => {
    test('지정된 개수만큼 제목을 생성해야 함', () => {
      const titles = generateTitlesLocal('시니어사연', 5);

      expect(titles).toHaveLength(5);
      titles.forEach(title => {
        expect(typeof title).toBe('string');
        expect(title.length).toBeGreaterThan(0);
      });
    });

    test('중복된 제목은 제거되어야 함', () => {
      const titles = generateTitlesLocal('복수극', 10);
      const uniqueTitles = new Set(titles);

      expect(uniqueTitles.size).toBe(titles.length);
    });

    test('기본값 5개를 생성해야 함', () => {
      const titles = generateTitlesLocal('복수극');

      expect(titles.length).toBeGreaterThanOrEqual(1);
      expect(titles.length).toBeLessThanOrEqual(5);
    });

    test('존재하지 않는 카테고리는 빈 배열을 반환해야 함', () => {
      const titles = generateTitlesLocal('존재하지않는카테고리', 5);

      expect(titles).toEqual([]);
    });
  });

  describe('battleTitlesLocal', () => {
    test('두 제목을 비교하여 승자를 선택해야 함', () => {
      const title1 = '며느리를 무시했던 시어머니, 10년 후 그녀가 CEO인 걸 알고 충격적인 이유';
      const title2 = '짧은 제목';

      const result = battleTitlesLocal(title1, title2, '시니어사연');

      expect(result.winner).toBe(title1);
      expect(result.loser).toBe(title2);
      expect(result.score1).toBeGreaterThan(result.score2);
    });

    test('점수가 같으면 첫 번째 제목이 승자가 되어야 함', () => {
      const title1 = '동일한 제목';
      const title2 = '동일한 제목';

      const result = battleTitlesLocal(title1, title2, '복수극');

      expect(result.winner).toBe(title1);
      expect(result.score1).toBe(result.score2);
    });
  });

  describe('generateOptimalTitleLocal', () => {
    test('최적의 제목과 대안을 생성해야 함', () => {
      const result = generateOptimalTitleLocal('시니어사연', 5);

      expect(result.title).toBeTruthy();
      expect(typeof result.title).toBe('string');
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
      expect(Array.isArray(result.alternatives)).toBeTruthy();
    });

    test('대안은 최대 3개까지 제공되어야 함', () => {
      const result = generateOptimalTitleLocal('복수극', 5);

      expect(result.alternatives.length).toBeLessThanOrEqual(3);
    });

    test('최적 제목이 가장 높은 점수를 받아야 함', () => {
      const result = generateOptimalTitleLocal('시니어사연', 5);

      result.alternatives.forEach(alt => {
        expect(result.score).toBeGreaterThanOrEqual(alt.score);
      });
    });

    test('기본값 5개로 생성해야 함', () => {
      const result = generateOptimalTitleLocal('복수극');

      expect(result.title).toBeTruthy();
    });

    test('존재하지 않는 카테고리는 빈 제목과 0점을 반환해야 함', () => {
      const result = generateOptimalTitleLocal('존재하지않는카테고리', 5);

      expect(result.title).toBe('');
      expect(result.score).toBe(0);
    });
  });
});
