/**
 * modelUtils.ts 유닛 테스트
 */

import {
  normalizeModel,
  composeLLMPrompt,
} from '@/lib/utils/modelUtils';

describe('modelUtils', () => {
  describe('normalizeModel', () => {
    it('유효한 모델은 그대로 반환', () => {
      expect(normalizeModel('chatgpt')).toBe('chatgpt');
      expect(normalizeModel('gemini')).toBe('gemini');
      expect(normalizeModel('claude')).toBe('claude');
      expect(normalizeModel('grok')).toBe('grok');
    });

    it('유효하지 않은 모델은 chatgpt 반환', () => {
      expect(normalizeModel('invalid')).toBe('chatgpt');
      expect(normalizeModel('')).toBe('chatgpt');
      expect(normalizeModel('openai')).toBe('chatgpt');
    });

    it('undefined는 chatgpt 반환', () => {
      expect(normalizeModel(undefined)).toBe('chatgpt');
    });
  });

  describe('composeLLMPrompt', () => {
    const mockVideo = {
      title: '테스트 영상',
      views: 10000,
      channelName: '테스트 채널',
    } as any;

    it('기본 프롬프트를 생성해야 함', () => {
      const result = composeLLMPrompt({
        video: mockVideo,
        script: '테스트 스크립트',
        model: 'chatgpt',
      });

      expect(result).toContain('테스트 영상');
      expect(result).toContain('10,000');
      expect(result).toContain('테스트 채널');
      expect(result).toContain('테스트 스크립트');
    });

    it('chatgpt 모델 지시사항 포함', () => {
      const result = composeLLMPrompt({
        video: mockVideo,
        script: '스크립트',
        model: 'chatgpt',
      });

      expect(result).toContain('명확하고 간결한');
    });

    it('gemini 모델 지시사항 포함', () => {
      const result = composeLLMPrompt({
        video: mockVideo,
        script: '스크립트',
        model: 'gemini',
      });

      expect(result).toContain('창의적이고 다채로운');
    });

    it('claude 모델 지시사항 포함', () => {
      const result = composeLLMPrompt({
        video: mockVideo,
        script: '스크립트',
        model: 'claude',
      });

      expect(result).toContain('논리적이고 체계적인');
    });

    it('grok 모델 지시사항 포함', () => {
      const result = composeLLMPrompt({
        video: mockVideo,
        script: '스크립트',
        model: 'grok',
      });

      expect(result).toContain('빠르고 효율적인');
    });
  });

  describe('openModelTab', () => {
    const mockVideo = {
      title: '테스트 영상',
      views: 10000,
      channelName: '테스트 채널',
    } as any;

    let mockWindow: any;
    let originalWindow: Window;

    beforeEach(() => {
      originalWindow = global.window;
      mockWindow = {
        open: jest.fn().mockReturnValue({
          focus: jest.fn(),
        }),
      };
      global.window = mockWindow as any;
      global.navigator = {
        clipboard: {
          writeText: jest.fn().mockResolvedValue(undefined),
        },
      } as any;
    });

    afterEach(() => {
      global.window = originalWindow;
    });

    it('새 창을 열어야 함', () => {
      const { openModelTab } = require('@/lib/utils/modelUtils');
      openModelTab('chatgpt', mockVideo, '스크립트');

      expect(mockWindow.open).toHaveBeenCalledWith('https://chat.openai.com/', '_blank');
    });

    it('gemini URL로 열어야 함', () => {
      const { openModelTab } = require('@/lib/utils/modelUtils');
      openModelTab('gemini', mockVideo, '스크립트');

      expect(mockWindow.open).toHaveBeenCalledWith('https://gemini.google.com/', '_blank');
    });

    it('claude URL로 열어야 함', () => {
      const { openModelTab } = require('@/lib/utils/modelUtils');
      openModelTab('claude', mockVideo, '스크립트');

      expect(mockWindow.open).toHaveBeenCalledWith('https://claude.ai/', '_blank');
    });

    it('grok URL로 열어야 함', () => {
      const { openModelTab } = require('@/lib/utils/modelUtils');
      openModelTab('grok', mockVideo, '스크립트');

      expect(mockWindow.open).toHaveBeenCalledWith('https://grok.com/', '_blank');
    });
  });
});
