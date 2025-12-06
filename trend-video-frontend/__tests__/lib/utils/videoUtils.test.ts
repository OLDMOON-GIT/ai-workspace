/**
 * videoUtils.ts 유닛 테스트
 */

import {
  calculateVph,
  renderCount,
  extractSequence,
  sortBySequence,
  sortByTimestamp,
} from '@/lib/utils/videoUtils';

describe('videoUtils', () => {
  describe('calculateVph', () => {
    it('조회수를 시간으로 나눠 VPH를 계산해야 함', () => {
      const video = { views: 1000, hours: 10 } as any;
      expect(calculateVph(video)).toBe(100);
    });

    it('hours가 없으면 1로 간주해야 함', () => {
      const video = { views: 500, hours: undefined } as any;
      expect(calculateVph(video)).toBe(500);
    });

    it('hours가 0이면 기본값 1 사용해야 함', () => {
      const video = { views: 300, hours: 0 } as any;
      // hours || 1 이므로 0은 falsy라 1이 됨
      expect(calculateVph(video)).toBe(300);
    });

    it('소수점은 반올림해야 함', () => {
      const video = { views: 333, hours: 2 } as any;
      expect(calculateVph(video)).toBe(167); // 166.5 -> 167
    });
  });

  describe('renderCount', () => {
    it('숫자를 포맷팅해야 함', () => {
      const result = renderCount(1000);
      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
    });

    it('큰 숫자도 포맷팅해야 함', () => {
      const result = renderCount(1000000);
      expect(result).toBeDefined();
    });

    it('0도 포맷팅해야 함', () => {
      const result = renderCount(0);
      expect(result).toBeDefined();
    });
  });

  describe('extractSequence', () => {
    it('scene_01 형식에서 추출해야 함', () => {
      expect(extractSequence('scene_01.jpg')).toBe(1);
      expect(extractSequence('scene_02_hook.png')).toBe(2);
      expect(extractSequence('scene_10.jpeg')).toBe(10);
    });

    it('scene-01 형식에서 추출해야 함', () => {
      expect(extractSequence('scene-01.jpg')).toBe(1);
      expect(extractSequence('scene-05.png')).toBe(5);
    });

    it('scene01 형식에서 추출해야 함', () => {
      expect(extractSequence('scene01.jpg')).toBe(1);
      expect(extractSequence('scene12.png')).toBe(12);
    });

    it('숫자로 시작하는 파일에서 추출해야 함', () => {
      expect(extractSequence('01.jpg')).toBe(1);
      expect(extractSequence('05_image.png')).toBe(5);
    });

    it('시퀀스가 없는 파일은 null 반환', () => {
      expect(extractSequence('image.jpg')).toBeNull();
      expect(extractSequence('thumbnail.png')).toBeNull();
    });

    it('대소문자 구분 없이 추출해야 함', () => {
      expect(extractSequence('SCENE_01.jpg')).toBe(1);
      expect(extractSequence('Scene_05.png')).toBe(5);
    });
  });

  describe('sortBySequence', () => {
    const createFile = (name: string, lastModified = 0): { file: File } => ({
      file: new File([''], name, { lastModified }),
    });

    it('시퀀스 번호로 정렬해야 함', () => {
      const files = [
        createFile('scene_03.jpg'),
        createFile('scene_01.jpg'),
        createFile('scene_02.jpg'),
      ];

      const sorted = sortBySequence(files);
      expect(sorted[0].file.name).toBe('scene_01.jpg');
      expect(sorted[1].file.name).toBe('scene_02.jpg');
      expect(sorted[2].file.name).toBe('scene_03.jpg');
    });

    it('시퀀스가 있는 파일이 먼저 오게 정렬해야 함', () => {
      const files = [
        createFile('thumbnail.jpg'),
        createFile('scene_01.jpg'),
      ];

      const sorted = sortBySequence(files);
      expect(sorted[0].file.name).toBe('scene_01.jpg');
      expect(sorted[1].file.name).toBe('thumbnail.jpg');
    });

    it('원본 배열을 변경하지 않아야 함', () => {
      const files = [
        createFile('scene_02.jpg'),
        createFile('scene_01.jpg'),
      ];

      const originalFirst = files[0].file.name;
      sortBySequence(files);
      expect(files[0].file.name).toBe(originalFirst);
    });

    it('빈 배열은 빈 배열 반환', () => {
      const sorted = sortBySequence([]);
      expect(sorted).toEqual([]);
    });
  });

  describe('sortByTimestamp', () => {
    const createFile = (name: string, lastModified: number): { file: File } => ({
      file: new File([''], name, { lastModified }),
    });

    it('타임스탬프로 오래된 순 정렬해야 함', () => {
      const files = [
        createFile('file3.jpg', 3000),
        createFile('file1.jpg', 1000),
        createFile('file2.jpg', 2000),
      ];

      const sorted = sortByTimestamp(files);
      expect(sorted[0].file.name).toBe('file1.jpg');
      expect(sorted[1].file.name).toBe('file2.jpg');
      expect(sorted[2].file.name).toBe('file3.jpg');
    });

    it('같은 lastModified를 가진 파일은 순서 유지', () => {
      const files = [
        createFile('file1.jpg', 1000),
        createFile('file2.jpg', 1000),
      ];

      const sorted = sortByTimestamp(files);
      // 같은 타임스탬프는 원래 순서 유지
      expect(sorted[0].file.name).toBe('file1.jpg');
      expect(sorted[1].file.name).toBe('file2.jpg');
    });

    it('원본 배열을 변경하지 않아야 함', () => {
      const files = [
        createFile('file2.jpg', 2000),
        createFile('file1.jpg', 1000),
      ];

      const originalFirst = files[0].file.name;
      sortByTimestamp(files);
      expect(files[0].file.name).toBe(originalFirst);
    });
  });
});
