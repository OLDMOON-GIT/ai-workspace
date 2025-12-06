/**
 * BTS-0000429: 자동화 완료탭에 썸네일 표시
 *
 * 검증 내용:
 * - 자동화 완료 탭에서 썸네일 이미지가 표시되는지 확인
 * - 썸네일 API 호출이 올바르게 구성되는지 확인
 * - 이미지 로드 실패 시 fallback 처리가 있는지 확인
 */

import * as fs from 'fs';
import * as path from 'path';

describe('BTS-0000429: 자동화 완료탭에 썸네일 표시', () => {
  const automationPagePath = path.join(
    __dirname,
    '../../src/app/automation/page.tsx'
  );

  let pageContent: string;

  beforeAll(() => {
    pageContent = fs.readFileSync(automationPagePath, 'utf-8');
  });

  describe('썸네일 렌더링 검증', () => {
    it('완료 탭에서 썸네일 img 태그가 렌더링되어야 함', () => {
      // queueTab === 'completed' 조건과 함께 img 태그 존재 확인
      const hasThumbnailInCompleted = pageContent.includes(
        "queueTab === 'completed'"
      ) && pageContent.includes('/api/thumbnail?taskId=');

      expect(hasThumbnailInCompleted).toBe(true);
    });

    it('썸네일 API URL이 올바른 형식이어야 함', () => {
      // /api/thumbnail?taskId=${taskId} 패턴 확인
      const thumbnailApiPattern = /\/api\/thumbnail\?taskId=\$\{taskId\}/;
      expect(pageContent).toMatch(thumbnailApiPattern);
    });

    it('썸네일 이미지에 object-cover 스타일이 적용되어야 함', () => {
      // 썸네일 이미지 블록에서 object-cover 클래스 확인
      const thumbnailBlockMatch = pageContent.match(
        /\/api\/thumbnail\?taskId[\s\S]*?object-cover/
      );
      expect(thumbnailBlockMatch).toBeTruthy();
    });
  });

  describe('썸네일 fallback 처리 검증', () => {
    it('이미지 로드 실패 시 onError 핸들러가 있어야 함', () => {
      // onError 핸들러 존재 확인
      const hasOnError = pageContent.includes('onError={(e)');
      expect(hasOnError).toBe(true);
    });

    it('fallback으로 기본 이모지(🎬)가 표시되어야 함', () => {
      // 🎬 이모지가 fallback으로 사용되는지 확인
      const hasFallbackEmoji = pageContent.match(/innerHTML.*🎬/);
      expect(hasFallbackEmoji).toBeTruthy();
    });

    it('이미지 컨테이너에 적절한 크기가 설정되어야 함', () => {
      // w-24 h-24 (96px x 96px) 크기 확인
      const hasProperSize = pageContent.match(/w-24 h-24.*rounded-lg.*overflow-hidden/);
      expect(hasProperSize).toBeTruthy();
    });
  });

  describe('taskId 추출 로직 검증', () => {
    it('titleSchedules에서 scriptId 또는 taskId를 추출해야 함', () => {
      // scriptId 또는 taskId 추출 로직 확인
      const hasScriptIdExtraction = pageContent.includes(
        'titleSchedules.find((s: any) => s.scriptId || s.taskId)'
      );
      expect(hasScriptIdExtraction).toBe(true);
    });

    it('fallback으로 title.taskId 또는 title.id를 사용해야 함', () => {
      // title.taskId || title.id fallback 확인
      const hasTitleFallback = pageContent.includes('title.taskId || title.id');
      expect(hasTitleFallback).toBe(true);
    });
  });

  describe('썸네일 API 라우트 검증', () => {
    const thumbnailApiPath = path.join(
      __dirname,
      '../../src/app/api/thumbnail/route.ts'
    );

    let apiContent: string;

    beforeAll(() => {
      apiContent = fs.readFileSync(thumbnailApiPath, 'utf-8');
    });

    it('썸네일 API가 GET 메서드를 지원해야 함', () => {
      expect(apiContent).toContain('export async function GET');
    });

    it('썸네일 API가 taskId 파라미터를 받아야 함', () => {
      expect(apiContent).toContain("searchParams.get('taskId')");
    });

    it('썸네일 API가 이미지 파일을 반환해야 함', () => {
      expect(apiContent).toContain("'Content-Type'");
      expect(apiContent).toMatch(/image\/(png|jpeg)/);
    });

    it('썸네일 API가 권한 체크를 수행해야 함', () => {
      expect(apiContent).toContain('job.userId !== user.userId');
    });
  });
});
