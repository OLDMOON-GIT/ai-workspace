/**
 * BTS-0001238: 버그/스펙 등록 시 Claude Haiku로 제목/요약 다듬기 및 연관 BTS 자동 추출
 *
 * 검증 내용:
 * 1. API /api/bugs/refine 엔드포인트 존재 및 구조 확인
 * 2. 프론트엔드 버그 등록 폼에 AI 다듬기 버튼 및 결과 표시 UI 확인
 * 3. AI 다듬기 결과를 metadata에 저장하는 로직 확인
 */

import * as fs from 'fs';
import * as path from 'path';

describe('BTS-0001238: 버그/스펙 등록 시 Claude Haiku AI 다듬기', () => {
  const refineApiPath = path.join(
    __dirname,
    '../../src/app/api/bugs/refine/route.ts'
  );
  const bugsPagePath = path.join(
    __dirname,
    '../../src/app/admin/bugs/page.tsx'
  );

  let refineApiContent: string;
  let bugsPageContent: string;

  beforeAll(() => {
    refineApiContent = fs.readFileSync(refineApiPath, 'utf-8');
    bugsPageContent = fs.readFileSync(bugsPagePath, 'utf-8');
  });

  describe('API /api/bugs/refine 검증', () => {
    it('refine API 파일이 존재해야 함', () => {
      expect(fs.existsSync(refineApiPath)).toBe(true);
    });

    it('POST 메서드가 export 되어야 함', () => {
      expect(refineApiContent).toMatch(/export\s+async\s+function\s+POST/);
    });

    it('Claude Haiku 모델을 사용해야 함', () => {
      expect(refineApiContent).toContain('claude-3-5-haiku-20241022');
    });

    it('최근 20개 BTS를 조회해야 함', () => {
      expect(refineApiContent).toMatch(/LIMIT\s+20/);
      expect(refineApiContent).toContain('recentBugs');
    });

    it('Anthropic SDK를 사용해야 함', () => {
      expect(refineApiContent).toContain("from '@anthropic-ai/sdk'");
      expect(refineApiContent).toContain('new Anthropic');
    });

    it('JSON 응답 구조에 필수 필드가 있어야 함', () => {
      // API가 반환하는 필드들
      expect(refineApiContent).toContain('refinedTitle');
      expect(refineApiContent).toContain('refinedSummary');
      expect(refineApiContent).toContain('relatedBugs');
      expect(refineApiContent).toContain('reason');
    });

    it('토큰 사용량을 반환해야 함', () => {
      expect(refineApiContent).toContain('input_tokens');
      expect(refineApiContent).toContain('output_tokens');
      expect(refineApiContent).toContain('message.usage');
    });

    it('관리자 권한 체크가 있어야 함', () => {
      expect(refineApiContent).toContain('getCurrentUser');
      expect(refineApiContent).toContain('user.isAdmin');
      expect(refineApiContent).toContain('Unauthorized');
    });

    it('제목 필수 검증이 있어야 함', () => {
      expect(refineApiContent).toContain('Title is required');
    });

    it('JSON 파싱 에러 처리가 있어야 함', () => {
      expect(refineApiContent).toContain('JSON parse error');
      expect(refineApiContent).toMatch(/catch\s*\(\s*parseError\s*\)/);
    });
  });

  describe('프론트엔드 버그 등록 폼 검증', () => {
    it('AI 다듬기 버튼이 존재해야 함', () => {
      expect(bugsPageContent).toContain('AI 다듬기');
    });

    it('AI 다듬기 로딩 상태가 있어야 함', () => {
      expect(bugsPageContent).toContain('refineLoading');
      expect(bugsPageContent).toContain('AI 다듬는 중');
    });

    it('AI 다듬기 결과 상태가 있어야 함', () => {
      expect(bugsPageContent).toContain('refineResult');
      expect(bugsPageContent).toContain('setRefineResult');
    });

    it('/api/bugs/refine API를 호출해야 함', () => {
      expect(bugsPageContent).toContain("fetch('/api/bugs/refine'");
      expect(bugsPageContent).toContain("method: 'POST'");
    });

    it('AI 다듬기 결과 표시 UI가 있어야 함', () => {
      expect(bugsPageContent).toContain('AI 다듬기 결과');
      expect(bugsPageContent).toContain('refinedTitle');
      expect(bugsPageContent).toContain('refinedSummary');
    });

    it('연관 BTS 표시가 있어야 함', () => {
      expect(bugsPageContent).toContain('relatedBugs');
      expect(bugsPageContent).toContain('연관 BTS');
    });

    it('적용하기/원본 유지 버튼이 있어야 함', () => {
      expect(bugsPageContent).toContain('적용하기');
      expect(bugsPageContent).toContain('원본 유지');
    });

    it('적용하기 시 제목/요약이 업데이트되어야 함', () => {
      // setNewTitle, setNewSummary가 refineResult 값으로 설정되는지 확인
      expect(bugsPageContent).toMatch(/setNewTitle\s*\(\s*refineResult\.refinedTitle\s*\)/);
      expect(bugsPageContent).toMatch(/setNewSummary\s*\(\s*refineResult\.refinedSummary\s*\)/);
    });
  });

  describe('연관 BTS metadata 저장 검증', () => {
    it('등록 시 relatedBugs를 metadata에 포함해야 함', () => {
      expect(bugsPageContent).toContain('refineResult?.relatedBugs');
      expect(bugsPageContent).toContain('relatedBugs:');
      expect(bugsPageContent).toContain('relatedReason:');
    });

    it('metadata가 POST body에 포함되어야 함', () => {
      // fetch body에 metadata가 포함되는지 확인
      expect(bugsPageContent).toMatch(/body:\s*JSON\.stringify\s*\(\s*\{[\s\S]*?metadata/);
    });
  });

  describe('UI/UX 검증', () => {
    it('제목 없이 AI 다듬기 버튼 클릭 시 경고가 표시되어야 함', () => {
      expect(bugsPageContent).toContain("제목을 입력해주세요");
    });

    it('AI 다듬기 버튼은 제목이 없으면 비활성화되어야 함', () => {
      expect(bugsPageContent).toMatch(/disabled=\{.*refineLoading.*\|\|.*!newTitle\.trim\(\)/);
    });

    it('닫기 버튼으로 AI 결과를 숨길 수 있어야 함', () => {
      expect(bugsPageContent).toContain('setRefineResult(null)');
      expect(bugsPageContent).toMatch(/✕\s*닫기/);
    });

    it('type(bug/spec)이 refine API에 전달되어야 함', () => {
      expect(bugsPageContent).toMatch(/type:\s*newType/);
    });
  });
});
