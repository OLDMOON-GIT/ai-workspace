/**
 * BTS-0000424: 내콘텐츠 버튼 순서 변경 - 폴더 버튼 제일 앞으로
 *
 * 검증 내용:
 * - 모든 상태(completed, failed/cancelled, script/video/image)에서 폴더 버튼이 첫 번째로 표시되는지 확인
 */

import * as fs from 'fs';
import * as path from 'path';

describe('BTS-0000424: 내콘텐츠 버튼 순서 변경', () => {
  const myContentPagePath = path.join(
    __dirname,
    '../../src/app/my-content/page.tsx'
  );

  let pageContent: string;

  beforeAll(() => {
    pageContent = fs.readFileSync(myContentPagePath, 'utf-8');
  });

  describe('버튼 순서 검증', () => {
    it('completed 상태에서 폴더 버튼이 첫 번째로 정의되어야 함', () => {
      // completed 상태 블록 찾기
      const completedBlockMatch = pageContent.match(
        /item\.data\.status === 'completed'[\s\S]*?<>\s*([\s\S]*?)<\/>/
      );

      expect(completedBlockMatch).toBeTruthy();

      if (completedBlockMatch) {
        const completedBlock = completedBlockMatch[1];

        // 첫 번째 버튼이 handleOpenFolder인지 확인
        const firstButtonMatch = completedBlock.match(
          /<button[^>]*onClick=\{[^}]*\}[^>]*>/
        );

        expect(firstButtonMatch).toBeTruthy();
        expect(completedBlock).toMatch(/handleOpenFolder.*폴더/s);

        // 폴더 버튼이 로그 버튼보다 앞에 있는지 확인
        const folderIndex = completedBlock.indexOf('handleOpenFolder');
        const logIndex = completedBlock.indexOf('expandedLogJobId');

        expect(folderIndex).toBeLessThan(logIndex);
      }
    });

    it('failed/cancelled 상태에서 폴더 버튼이 첫 번째로 정의되어야 함', () => {
      // failed/cancelled 상태 블록 찾기
      const failedBlockMatch = pageContent.match(
        /item\.data\.status === 'failed'.*cancelled[\s\S]*?<>\s*([\s\S]*?)<\/>/
      );

      expect(failedBlockMatch).toBeTruthy();

      if (failedBlockMatch) {
        const failedBlock = failedBlockMatch[1];

        // 폴더 버튼이 로그 버튼보다 앞에 있는지 확인
        const folderIndex = failedBlock.indexOf('handleOpenFolder');
        const logIndex = failedBlock.indexOf('expandedLogJobId');

        // 폴더가 먼저 나와야 함 (로그는 조건부로 렌더링될 수 있음)
        expect(folderIndex).toBeGreaterThan(-1);
        if (logIndex > -1) {
          expect(folderIndex).toBeLessThan(logIndex);
        }
      }
    });

    it('pending/processing 상태에서 폴더 버튼이 첫 번째로 정의되어야 함', () => {
      // pending/processing 상태 블록 찾기
      const pendingBlockMatch = pageContent.match(
        /item\.data\.status === 'pending'.*processing[\s\S]*?<>\s*([\s\S]*?)<\/>/
      );

      expect(pendingBlockMatch).toBeTruthy();

      if (pendingBlockMatch) {
        const pendingBlock = pendingBlockMatch[1];

        // 폴더 버튼 위치 확인
        const folderIndex = pendingBlock.indexOf('handleOpenFolder');
        expect(folderIndex).toBeGreaterThan(-1);

        // 첫 번째 버튼이 폴더인지 확인
        const firstButtonIndex = pendingBlock.indexOf('<button');
        const buttonContent = pendingBlock.substring(firstButtonIndex, firstButtonIndex + 300);
        expect(buttonContent).toContain('handleOpenFolder');
      }
    });

    it('script/video/image 상태에서 폴더 버튼이 첫 번째로 정의되어야 함', () => {
      // script/video/image 상태 블록 찾기
      const scriptBlockMatch = pageContent.match(
        /item\.data\.status === 'script'.*'video'.*'image'[\s\S]*?<>\s*([\s\S]*?)삭제/
      );

      expect(scriptBlockMatch).toBeTruthy();

      if (scriptBlockMatch) {
        const scriptBlock = scriptBlockMatch[1];

        // 첫 번째 버튼이 폴더인지 확인
        const folderIndex = scriptBlock.indexOf('handleOpenFolder');
        expect(folderIndex).toBeGreaterThan(-1);

        const firstButtonIndex = scriptBlock.indexOf('<button');
        const buttonContent = scriptBlock.substring(firstButtonIndex, firstButtonIndex + 300);
        expect(buttonContent).toContain('handleOpenFolder');
      }
    });
  });

  describe('폴더 버튼 렌더링 속성 검증', () => {
    it('폴더 버튼에 올바른 title 속성이 있어야 함', () => {
      // 폴더 버튼에 title="폴더 열기" 속성 확인
      const folderButtonMatches = pageContent.match(/title="폴더 열기"/g);
      expect(folderButtonMatches).toBeTruthy();
      expect(folderButtonMatches!.length).toBeGreaterThanOrEqual(4); // 최소 4개 상태에서 사용
    });

    it('폴더 버튼에 폴더 이모지가 있어야 함', () => {
      // 📁 폴더 텍스트 확인
      const folderEmojiMatches = pageContent.match(/📁 폴더/g);
      expect(folderEmojiMatches).toBeTruthy();
      expect(folderEmojiMatches!.length).toBeGreaterThanOrEqual(4);
    });
  });
});
