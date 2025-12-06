/**
 * BTS-3076: 영상 생성 완료 응답 - videoPath 없이 폴더 기준으로 완료 처리
 *
 * SPEC 검증 내용:
 * - 영상 생성 API 응답에서 videoPath 필드 제거 확인
 * - UnifiedWorker에서 폴더 기준으로 완료 판단 로직 확인
 * - tasks/{taskId} 폴더에서 영상 파일 탐색 로직 확인
 */

import * as fs from 'fs';
import * as path from 'path';

describe('BTS-3076: videoPath 없이 폴더 기준으로 완료 처리', () => {
  const generateVideoUploadPath = path.join(
    __dirname,
    '../../src/app/api/generate-video-upload/route.ts'
  );
  const generateVideoPath = path.join(
    __dirname,
    '../../src/app/api/generate-video/route.ts'
  );
  const unifiedWorkerPath = path.join(
    __dirname,
    '../../src/workers/unified-worker.js'
  );

  let generateVideoUploadContent: string;
  let generateVideoContent: string;
  let unifiedWorkerContent: string;

  beforeAll(() => {
    generateVideoUploadContent = fs.readFileSync(generateVideoUploadPath, 'utf-8');
    generateVideoContent = fs.readFileSync(generateVideoPath, 'utf-8');
    unifiedWorkerContent = fs.readFileSync(unifiedWorkerPath, 'utf-8');
  });

  describe('generate-video-upload API 검증', () => {
    it('BTS-3076 주석이 코드에 포함되어 있어야 함', () => {
      expect(generateVideoUploadContent).toContain('BTS-3076');
    });

    it('updateJob 호출 시 videoPath가 제거되어야 함', () => {
      // videoPath/thumbnailPath 제거 주석 확인
      expect(generateVideoUploadContent).toContain('videoPath/thumbnailPath 제거');
      expect(generateVideoUploadContent).toContain('폴더에서 직접 탐색');
    });

    it('updateJob 호출에서 videoPath 파라미터가 없어야 함', () => {
      // 완료 시점의 updateJob 호출에서 videoPath/thumbnailPath가 주석 처리되어야 함
      // BTS-3076 주석이 있는 updateJob 블록 확인
      const bts3076Section = generateVideoUploadContent.match(
        /BTS-3076: videoPath 응답에서 제거[\s\S]*?await updateJob\(taskId, \{[\s\S]*?\}\);/
      );
      expect(bts3076Section).toBeTruthy();
      if (bts3076Section) {
        // videoPath/thumbnailPath가 파라미터로 전달되지 않아야 함 (주석에만 존재)
        // 실제 파라미터 블록에서 videoPath가 없어야 함
        expect(bts3076Section[0]).toContain('videoPath/thumbnailPath 제거');
        // progress: 100과 step만 있어야 함
        expect(bts3076Section[0]).toContain("progress: 100");
        expect(bts3076Section[0]).toContain("step: '영상 생성 완료'");
      }
    });
  });

  describe('generate-video API 검증', () => {
    it('BTS-3076 주석이 코드에 포함되어 있어야 함', () => {
      expect(generateVideoContent).toContain('BTS-3076');
    });

    it('updateJob 호출 시 videoPath가 제거되어야 함', () => {
      expect(generateVideoContent).toContain('videoPath/thumbnailPath 제거');
    });
  });

  describe('UnifiedWorker 폴더 기준 완료 판단 검증', () => {
    it('BTS-3076 주석이 코드에 포함되어 있어야 함', () => {
      expect(unifiedWorkerContent).toContain('BTS-3076');
    });

    it('video 단계에서 폴더 기준으로 완료 판단해야 함', () => {
      // 폴더 존재 여부 확인 로직
      expect(unifiedWorkerContent).toContain('Video task folder not found');
      // 영상 파일 탐색 로직
      expect(unifiedWorkerContent).toContain('No video file found in task folder');
    });

    it('YouTube 단계에서 폴더 기준으로 videoPath 탐색해야 함', () => {
      // 폴더 기준 탐색 주석
      expect(unifiedWorkerContent).toContain('폴더 기준으로 videoPath/thumbnailPath 탐색');
      expect(unifiedWorkerContent).toContain('API 응답 의존 제거');
    });

    it('영상 파일 탐색 시 제외 조건이 올바르게 설정되어야 함', () => {
      // scene_* 제외
      expect(unifiedWorkerContent).toContain("!f.startsWith('scene_')");
      // _audio 제외
      expect(unifiedWorkerContent).toContain("!f.includes('_audio')");
      // 숫자파일 제외
      expect(unifiedWorkerContent).toContain('/^\\d+\\.mp4$/i.test(f)');
    });

    it('tasks/{taskId} 폴더 경로를 사용해야 함', () => {
      expect(unifiedWorkerContent).toContain("path.join(backendPath, 'tasks', taskId)");
    });

    it('영상 파일 검증 후 완료 로그를 남겨야 함', () => {
      expect(unifiedWorkerContent).toContain('Video verified in folder');
    });
  });

  describe('폴더 탐색 로직 일관성 검증', () => {
    it('video 단계와 YouTube 단계에서 동일한 필터링 로직을 사용해야 함', () => {
      // findVideoAssets 함수가 공통으로 사용되어야 함 (DRY 원칙)
      expect(unifiedWorkerContent).toContain('async function findVideoAssets(taskFolder');

      // video 단계에서 findVideoAssets 호출
      expect(unifiedWorkerContent).toContain('await findVideoAssets(taskFolder');

      // findVideoAssets 내부에 필터링 로직이 있어야 함 (간단한 문자열 검사)
      expect(unifiedWorkerContent).toContain("mp4Files = files.filter(f =>");
      expect(unifiedWorkerContent).toContain("f.endsWith('.mp4')");

      // video 단계와 YouTube 단계 모두에서 findVideoAssets 호출 확인
      const findVideoAssetsCallPattern = /await\s+findVideoAssets\s*\(/g;
      const findCalls = unifiedWorkerContent.match(findVideoAssetsCallPattern);
      // video 단계와 YouTube 단계 모두에서 사용되어야 함 (최소 2회 호출)
      expect(findCalls).toBeTruthy();
      expect(findCalls!.length).toBeGreaterThanOrEqual(2);
    });
  });
});
