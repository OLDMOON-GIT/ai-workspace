/**
 * storageUtils.ts 유닛 테스트
 */

import {
  stripMarkdownCodeBlock,
  invalidateFiltersCache,
} from '@/lib/utils/storageUtils';

describe('storageUtils', () => {
  describe('stripMarkdownCodeBlock', () => {
    it('마크다운 코드 블록을 제거해야 함', () => {
      const input = '```json\n{"key": "value"}\n```';
      const result = stripMarkdownCodeBlock(input);
      expect(result).toBe('{"key": "value"}');
    });

    it('코드 블록 없는 JSON은 그대로 반환', () => {
      const input = '{"key": "value"}';
      const result = stripMarkdownCodeBlock(input);
      expect(result).toBe('{"key": "value"}');
    });

    it('언어 지정 없는 코드 블록도 처리', () => {
      const input = '```\n{"test": 123}\n```';
      const result = stripMarkdownCodeBlock(input);
      expect(result).toBe('{"test": 123}');
    });

    it('여러 줄 JSON도 처리', () => {
      const input = '```json\n{\n  "key": "value",\n  "number": 123\n}\n```';
      const result = stripMarkdownCodeBlock(input);
      expect(result).toContain('"key"');
      expect(result).toContain('"number"');
    });

    it('빈 문자열은 빈 문자열 반환', () => {
      const result = stripMarkdownCodeBlock('');
      expect(result).toBe('');
    });
  });

  describe('invalidateFiltersCache', () => {
    it('에러 없이 실행되어야 함', () => {
      expect(() => invalidateFiltersCache()).not.toThrow();
    });
  });
});
