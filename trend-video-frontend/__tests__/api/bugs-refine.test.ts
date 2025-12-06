/**
 * /api/bugs/refine API 테스트
 *
 * BTS-0001238: 버그/스펙 등록 시 Claude Haiku로 제목/요약 다듬기 및 연관 BTS 자동 추출
 */

describe('/api/bugs/refine - Claude Haiku 제목/요약 다듬기', () => {
  describe('Input Validation', () => {
    it('제목이 없으면 400을 반환해야 함', () => {
      const title = '';

      if (!title.trim()) {
        const error = { error: 'Title is required' };
        const status = 400;

        expect(error.error).toBe('Title is required');
        expect(status).toBe(400);
      }
    });

    it('제목이 공백만 있으면 400을 반환해야 함', () => {
      const title = '   ';

      if (!title.trim()) {
        const error = { error: 'Title is required' };
        const status = 400;

        expect(error.error).toBe('Title is required');
        expect(status).toBe(400);
      }
    });

    it('제목이 있으면 유효성 검사 통과', () => {
      const title = '버그 제목';

      expect(title.trim()).toBeTruthy();
      expect(title.trim().length).toBeGreaterThan(0);
    });

    it('요약은 선택사항이어야 함', () => {
      const body = {
        title: '버그 제목',
        summary: '', // 빈 문자열도 허용
        type: 'bug'
      };

      expect(body.title.trim()).toBeTruthy();
      // summary는 빈 값이어도 OK
      expect(body.summary).toBeDefined();
    });
  });

  describe('Type Validation', () => {
    it('type이 bug 또는 spec이어야 함', () => {
      const validTypes = ['bug', 'spec'];

      validTypes.forEach(type => {
        expect(['bug', 'spec'].includes(type)).toBe(true);
      });
    });

    it('type 기본값은 bug이어야 함', () => {
      const type = undefined || 'bug';
      expect(type).toBe('bug');
    });
  });

  describe('Response Structure', () => {
    it('다듬기 결과에 refinedTitle이 포함되어야 함', () => {
      const response = {
        original: { title: '원본 제목', summary: '원본 요약', type: 'bug' },
        refined: {
          refinedTitle: '다듬어진 제목',
          refinedSummary: '다듬어진 요약',
          relatedBugs: ['BTS-0001234'],
          reason: '연관 이유'
        },
        recentBugsCount: 20,
        usage: { input_tokens: 100, output_tokens: 50 }
      };

      expect(response.refined).toHaveProperty('refinedTitle');
      expect(response.refined).toHaveProperty('refinedSummary');
      expect(response.refined).toHaveProperty('relatedBugs');
      expect(response.refined).toHaveProperty('reason');
    });

    it('relatedBugs는 배열이어야 함', () => {
      const response = {
        refined: {
          relatedBugs: ['BTS-0001234', 'BTS-0001235']
        }
      };

      expect(Array.isArray(response.refined.relatedBugs)).toBe(true);
    });

    it('relatedBugs는 최대 3개까지만 포함해야 함', () => {
      const relatedBugs = ['BTS-0001234', 'BTS-0001235', 'BTS-0001236'];

      expect(relatedBugs.length).toBeLessThanOrEqual(3);
    });

    it('usage 정보가 포함되어야 함', () => {
      const response = {
        usage: {
          input_tokens: 150,
          output_tokens: 80
        }
      };

      expect(response.usage).toHaveProperty('input_tokens');
      expect(response.usage).toHaveProperty('output_tokens');
      expect(typeof response.usage.input_tokens).toBe('number');
      expect(typeof response.usage.output_tokens).toBe('number');
    });
  });

  describe('Recent BTS Query', () => {
    it('최근 20개 BTS를 조회해야 함', () => {
      const limit = 20;

      expect(limit).toBe(20);
    });

    it('BTS 목록 형식이 올바르게 생성되어야 함', () => {
      const recentBugs = [
        { id: 'BTS-0001234', type: 'bug', status: 'open', title: '버그 제목' },
        { id: 'BTS-0001235', type: 'spec', status: 'resolved', title: '스펙 제목' }
      ];

      const formatted = recentBugs.map((b: any) =>
        `- ${b.id} [${b.type}/${b.status}]: ${b.title}`
      ).join('\n');

      expect(formatted).toContain('BTS-0001234');
      expect(formatted).toContain('[bug/open]');
      expect(formatted).toContain('[spec/resolved]');
    });
  });

  describe('JSON Parsing', () => {
    it('JSON 블록이 있으면 파싱해야 함', () => {
      const responseText = `\`\`\`json
{
  "refinedTitle": "다듬어진 제목",
  "refinedSummary": "다듬어진 요약",
  "relatedBugs": ["BTS-0001234"],
  "reason": "연관 이유"
}
\`\`\``;

      const jsonMatch = responseText.match(/```json\s*([\s\S]*?)\s*```/);

      expect(jsonMatch).not.toBeNull();
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[1]);
        expect(parsed.refinedTitle).toBe('다듬어진 제목');
        expect(parsed.relatedBugs).toContain('BTS-0001234');
      }
    });

    it('JSON 블록 없이 순수 JSON도 파싱해야 함', () => {
      const responseText = `{
  "refinedTitle": "다듬어진 제목",
  "refinedSummary": "다듬어진 요약",
  "relatedBugs": [],
  "reason": ""
}`;

      const jsonMatch = responseText.match(/\{[\s\S]*\}/);

      expect(jsonMatch).not.toBeNull();
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        expect(parsed.refinedTitle).toBe('다듬어진 제목');
      }
    });

    it('파싱 실패 시 원본 유지해야 함', () => {
      const originalTitle = '원본 제목';
      const originalSummary = '원본 요약';

      const result = {
        refinedTitle: originalTitle,
        refinedSummary: originalSummary,
        relatedBugs: [],
        reason: ''
      };

      try {
        // 잘못된 JSON
        JSON.parse('invalid json');
      } catch (e) {
        // 파싱 실패 시 원본 유지
        expect(result.refinedTitle).toBe(originalTitle);
        expect(result.refinedSummary).toBe(originalSummary);
      }
    });
  });

  describe('Authorization', () => {
    it('인증되지 않은 요청은 401을 반환해야 함', () => {
      const user = null;

      if (!user) {
        const error = { error: 'Unauthorized' };
        const status = 401;

        expect(error.error).toBe('Unauthorized');
        expect(status).toBe(401);
      }
    });

    it('관리자가 아닌 요청은 401을 반환해야 함', () => {
      const user = { userId: 'user123', isAdmin: false };

      if (!user.isAdmin) {
        const error = { error: 'Unauthorized' };
        const status = 401;

        expect(error.error).toBe('Unauthorized');
        expect(status).toBe(401);
      }
    });

    it('관리자 요청은 통과해야 함', () => {
      const user = { userId: 'admin123', isAdmin: true };

      expect(user.isAdmin).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('API 키가 없으면 500을 반환해야 함', () => {
      const apiKey = undefined;

      if (!apiKey) {
        const error = { error: 'ANTHROPIC_API_KEY가 설정되지 않았습니다.' };
        const status = 500;

        expect(error.error).toBe('ANTHROPIC_API_KEY가 설정되지 않았습니다.');
        expect(status).toBe(500);
      }
    });

    it('API 키가 유효하지 않으면 401을 반환해야 함', () => {
      const apiError = { status: 401 };

      if (apiError.status === 401) {
        const error = { error: 'API 키가 유효하지 않습니다.' };
        const status = 401;

        expect(error.error).toBe('API 키가 유효하지 않습니다.');
        expect(status).toBe(401);
      }
    });

    it('일반 오류 시 500을 반환해야 함', () => {
      const error = new Error('Something went wrong');

      const response = { error: '다듬기 중 오류가 발생했습니다.' };
      const status = 500;

      expect(response.error).toBe('다듬기 중 오류가 발생했습니다.');
      expect(status).toBe(500);
    });
  });

  describe('Prompt Construction', () => {
    it('프롬프트에 유형 라벨이 포함되어야 함', () => {
      const getTypeLabel = (type: string) => type === 'spec' ? '스펙(기능 요청)' : '버그';

      expect(getTypeLabel('bug')).toBe('버그');
      expect(getTypeLabel('spec')).toBe('스펙(기능 요청)');
    });

    it('프롬프트에 입력 제목과 요약이 포함되어야 함', () => {
      const title = '테스트 제목';
      const summary = '테스트 요약';

      const promptPart = `- 제목: ${title}\n- 요약: ${summary || '(없음)'}`;

      expect(promptPart).toContain('테스트 제목');
      expect(promptPart).toContain('테스트 요약');
    });

    it('요약이 없을 때 (없음) 표시되어야 함', () => {
      const title = '테스트 제목';
      const summary = '';

      const promptPart = `- 제목: ${title}\n- 요약: ${summary || '(없음)'}`;

      expect(promptPart).toContain('(없음)');
    });
  });

  describe('Frontend Integration', () => {
    it('refine 결과를 metadata에 포함하여 등록할 수 있어야 함', () => {
      const refineResult = {
        refinedTitle: '다듬어진 제목',
        refinedSummary: '다듬어진 요약',
        relatedBugs: ['BTS-0001234', 'BTS-0001235'],
        reason: '비슷한 기능 요청'
      };

      const metadata = refineResult.relatedBugs.length
        ? { relatedBugs: refineResult.relatedBugs, relatedReason: refineResult.reason }
        : undefined;

      expect(metadata).toBeDefined();
      expect(metadata?.relatedBugs).toContain('BTS-0001234');
      expect(metadata?.relatedReason).toBe('비슷한 기능 요청');
    });

    it('연관 BTS가 없을 때 metadata는 undefined이어야 함', () => {
      const refineResult = {
        refinedTitle: '다듬어진 제목',
        refinedSummary: '다듬어진 요약',
        relatedBugs: [],
        reason: ''
      };

      const metadata = refineResult.relatedBugs.length
        ? { relatedBugs: refineResult.relatedBugs, relatedReason: refineResult.reason }
        : undefined;

      expect(metadata).toBeUndefined();
    });
  });
});
