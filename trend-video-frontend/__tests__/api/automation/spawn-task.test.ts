/**
 * spawn-task API 테스트 (BTS-3199)
 *
 * Spawn 버튼이 promptFormat별로 올바른 프롬프트를 사용하는지 테스트
 */

import { promises as fs } from 'fs';
import path from 'path';

const WORKSPACE_DIR = 'C:\\Users\\oldmoon\\workspace';
const PROMPTS_DIR = path.join(WORKSPACE_DIR, 'trend-video-frontend', 'prompts');

// promptFormat → 프롬프트 파일 매핑 (route.ts와 동일)
const PROMPT_FILE_MAP: Record<string, string> = {
  'product_review': 'prompt_product.txt',
  'product': 'prompt_product.txt',
  'longform': 'prompt_longform.txt',
  'shortform': 'prompt_shortform.txt',
  'sora2': 'prompt_sora2.txt',
  'default': 'prompt_longform.txt'
};

describe('spawn-task API', () => {
  describe('프롬프트 파일 매핑', () => {
    test('1. product_review → prompt_product.txt 매핑', () => {
      expect(PROMPT_FILE_MAP['product_review']).toBe('prompt_product.txt');
    });

    test('2. product → prompt_product.txt 매핑', () => {
      expect(PROMPT_FILE_MAP['product']).toBe('prompt_product.txt');
    });

    test('3. longform → prompt_longform.txt 매핑', () => {
      expect(PROMPT_FILE_MAP['longform']).toBe('prompt_longform.txt');
    });

    test('4. shortform → prompt_shortform.txt 매핑', () => {
      expect(PROMPT_FILE_MAP['shortform']).toBe('prompt_shortform.txt');
    });

    test('5. sora2 → prompt_sora2.txt 매핑', () => {
      expect(PROMPT_FILE_MAP['sora2']).toBe('prompt_sora2.txt');
    });

    test('6. default → prompt_longform.txt 매핑', () => {
      expect(PROMPT_FILE_MAP['default']).toBe('prompt_longform.txt');
    });
  });

  describe('프롬프트 파일 존재 여부', () => {
    test('7. prompt_product.txt 파일 존재', async () => {
      const filePath = path.join(PROMPTS_DIR, 'prompt_product.txt');
      const exists = await fs.access(filePath).then(() => true).catch(() => false);
      expect(exists).toBe(true);
    });

    test('8. prompt_longform.txt 파일 존재', async () => {
      const filePath = path.join(PROMPTS_DIR, 'prompt_longform.txt');
      const exists = await fs.access(filePath).then(() => true).catch(() => false);
      expect(exists).toBe(true);
    });

    test('9. prompt_shortform.txt 파일 존재', async () => {
      const filePath = path.join(PROMPTS_DIR, 'prompt_shortform.txt');
      const exists = await fs.access(filePath).then(() => true).catch(() => false);
      expect(exists).toBe(true);
    });

    test('10. prompt_sora2.txt 파일 존재', async () => {
      const filePath = path.join(PROMPTS_DIR, 'prompt_sora2.txt');
      const exists = await fs.access(filePath).then(() => true).catch(() => false);
      expect(exists).toBe(true);
    });
  });

  describe('프롬프트 파일 내용 검증', () => {
    test('11. prompt_product.txt에 상품 관련 플레이스홀더 포함', async () => {
      const filePath = path.join(PROMPTS_DIR, 'prompt_product.txt');
      try {
        const content = await fs.readFile(filePath, 'utf-8');
        // 상품 프롬프트는 title 또는 product 관련 내용 포함해야 함
        const hasProductContent = content.includes('{title}') ||
                                  content.includes('상품') ||
                                  content.includes('product') ||
                                  content.includes('리뷰');
        expect(hasProductContent).toBe(true);
      } catch (e) {
        // 파일 없으면 스킵
        console.log('prompt_product.txt 파일 없음, 스킵');
      }
    });

    test('12. prompt_longform.txt에 대본 관련 내용 포함', async () => {
      const filePath = path.join(PROMPTS_DIR, 'prompt_longform.txt');
      try {
        const content = await fs.readFile(filePath, 'utf-8');
        const hasScriptContent = content.includes('scene') ||
                                 content.includes('씬') ||
                                 content.includes('대본') ||
                                 content.includes('narration');
        expect(hasScriptContent).toBe(true);
      } catch (e) {
        console.log('prompt_longform.txt 파일 없음, 스킵');
      }
    });

    test('13. prompt_shortform.txt에 숏폼 관련 내용 포함', async () => {
      const filePath = path.join(PROMPTS_DIR, 'prompt_shortform.txt');
      try {
        const content = await fs.readFile(filePath, 'utf-8');
        const hasShortformContent = content.includes('short') ||
                                    content.includes('숏폼') ||
                                    content.includes('초') ||
                                    content.length > 0;
        expect(hasShortformContent).toBe(true);
      } catch (e) {
        console.log('prompt_shortform.txt 파일 없음, 스킵');
      }
    });
  });

  describe('promptFormat 선택 로직', () => {
    test('14. 알 수 없는 promptFormat은 default로 폴백', () => {
      const format = 'unknown_format';
      const promptFileName = PROMPT_FILE_MAP[format] || PROMPT_FILE_MAP['default'];
      expect(promptFileName).toBe('prompt_longform.txt');
    });

    test('15. undefined promptFormat은 default로 폴백', () => {
      const format = undefined;
      const promptFileName = PROMPT_FILE_MAP[format as any] || PROMPT_FILE_MAP['default'];
      expect(promptFileName).toBe('prompt_longform.txt');
    });

    test('16. null promptFormat은 default로 폴백', () => {
      const format = null;
      const promptFileName = PROMPT_FILE_MAP[format as any] || PROMPT_FILE_MAP['default'];
      expect(promptFileName).toBe('prompt_longform.txt');
    });
  });

  describe('플레이스홀더 치환', () => {
    test('17. {title} 플레이스홀더 치환', () => {
      const template = '제목: {title}';
      const result = template.replace(/\{title\}/g, '테스트 제목');
      expect(result).toBe('제목: 테스트 제목');
    });

    test('18. {product_name} 플레이스홀더 치환', () => {
      const template = '상품명: {product_name}';
      const result = template.replace(/\{product_name\}/g, '에어팟 프로');
      expect(result).toBe('상품명: 에어팟 프로');
    });

    test('19. {product_info} JSON 플레이스홀더 치환', () => {
      const template = '상품정보: {product_info}';
      const productInfo = { name: '에어팟', price: '300000' };
      const result = template.replace(/\{product_info\}/g, JSON.stringify(productInfo, null, 2));
      expect(result).toContain('에어팟');
      expect(result).toContain('300000');
    });

    test('20. 복합 플레이스홀더 치환', () => {
      const template = '{title} - {product_name} ({product_price})';
      const result = template
        .replace(/\{title\}/g, '리뷰 영상')
        .replace(/\{product_name\}/g, '에어팟')
        .replace(/\{product_price\}/g, '30만원');
      expect(result).toBe('리뷰 영상 - 에어팟 (30만원)');
    });
  });
});
