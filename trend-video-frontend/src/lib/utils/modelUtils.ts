/**
 * AI 모델 관련 유틸리티 함수
 */

import type { ModelOption } from "@/lib/constants/video";
import type { VideoItem } from "@/types/video";

/**
 * 모델 값 정규화
 */
export function normalizeModel(value: string | undefined): ModelOption {
  if (value === 'chatgpt' || value === 'gemini' || value === 'claude' || value === 'grok') {
    return value as ModelOption;
  }
  return 'chatgpt';
}

/**
 * LLM 프롬프트 구성
 */
export function composeLLMPrompt({
  video,
  script,
  model,
}: {
  video: VideoItem;
  script: string;
  model: ModelOption;
}): string {
  const basePrompt = `영상 정보:
제목: ${video.title}
조회수: ${video.views.toLocaleString()}
채널: ${video.channelName}

스크립트 초안:
${script}

위 영상의 스크립트를 바탕으로 더 매력적이고 구조화된 대본을 작성해주세요.`;

  // 모델별 추가 지시사항
  const modelSpecificInstructions: Record<ModelOption, string> = {
    chatgpt: '\n\n명확하고 간결한 문체로 작성해주세요.',
    gemini: '\n\n창의적이고 다채로운 표현을 사용해주세요.',
    claude: '\n\n논리적이고 체계적인 구조로 작성해주세요.',
    grok: '\n\n빠르고 효율적인 응답으로 작성해주세요.',
  };

  return basePrompt + (modelSpecificInstructions[model] || '');
}

/**
 * AI 모델 탭 열기
 */
export function openModelTab(
  model: ModelOption,
  video: VideoItem,
  script: string,
  targetWindow?: Window | null
): void {
  const prompt = composeLLMPrompt({ video, script, model });

  const urls: Record<ModelOption, string> = {
    chatgpt: 'https://chat.openai.com/',
    gemini: 'https://gemini.google.com/',
    claude: 'https://claude.ai/',
    grok: 'https://grok.com/',
  };

  const url = urls[model];

  if (targetWindow && !targetWindow.closed) {
    targetWindow.location.href = url;
    targetWindow.focus();
  } else {
    const newWindow = window.open(url, '_blank');
    if (newWindow) {
      newWindow.focus();
      // 프롬프트를 클립보드에 복사
      navigator.clipboard.writeText(prompt).catch(err => {
        console.error('Failed to copy prompt:', err);
      });
    }
  }
}
