import path from 'path';
import { promises as fs } from 'fs';

interface CacheEntry {
  content: string;
  loadedAt: number;
}

// 프롬프트 캐시 (메모리 캐시)
const promptCache = new Map<string, CacheEntry>();

// 프롬프트 디렉토리
const promptsDir = path.join(process.cwd(), 'prompts');

/**
 * 캐시에서 프롬프트를 가져오거나, 없으면 파일에서 로드 후 캐싱
 */
export async function getCachedPrompt(promptType: string): Promise<string> {
  const cached = promptCache.get(promptType);

  if (cached) {
    console.log(`📦 [프롬프트 캐시] ${promptType} - 캐시에서 로드됨 (캐시 시간: ${new Date(cached.loadedAt).toLocaleTimeString()})`);
    return cached.content;
  }

  // 캐시에 없으면 파일에서 로드
  const content = await loadPromptFromFile(promptType);

  // 캐시에 저장
  promptCache.set(promptType, {
    content,
    loadedAt: Date.now()
  });

  console.log(`📂 [프롬프트 캐시] ${promptType} - 파일에서 로드 후 캐싱됨`);
  return content;
}

/**
 * 파일에서 프롬프트 로드
 */
async function loadPromptFromFile(promptType: string): Promise<string> {
  const fileName = `prompt_${promptType}.txt`;
  const filePath = path.join(promptsDir, fileName);

  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return content;
  } catch (error) {
    console.error(`❌ [프롬프트 캐시] ${fileName} 파일 읽기 실패:`, error);
    throw new Error(`프롬프트 파일을 찾을 수 없습니다: ${fileName}`);
  }
}

/**
 * 특정 프롬프트의 캐시 갱신 (파일에서 다시 로드)
 */
export async function refreshPromptCache(promptType: string): Promise<void> {
  try {
    const content = await loadPromptFromFile(promptType);

    promptCache.set(promptType, {
      content,
      loadedAt: Date.now()
    });

    console.log(`🔄 [프롬프트 캐시] ${promptType} - 캐시 갱신됨`);
  } catch (error) {
    // 파일이 없으면 캐시에서 제거
    promptCache.delete(promptType);
    console.warn(`⚠️ [프롬프트 캐시] ${promptType} - 캐시 제거됨 (파일 없음)`);
  }
}

/**
 * 모든 프롬프트 캐시 초기화
 */
export function clearAllPromptCache(): void {
  const count = promptCache.size;
  promptCache.clear();
  console.log(`🗑️ [프롬프트 캐시] 전체 캐시 초기화됨 (${count}개)`);
}

/**
 * 캐시 상태 조회
 */
export function getPromptCacheStatus(): Array<{
  type: string;
  loadedAt: Date;
  contentLength: number;
}> {
  const status: Array<{ type: string; loadedAt: Date; contentLength: number }> = [];

  promptCache.forEach((entry, type) => {
    status.push({
      type,
      loadedAt: new Date(entry.loadedAt),
      contentLength: entry.content.length
    });
  });

  return status;
}

// 프롬프트 타입 매핑 (파일명 → 캐시 키)
export const PROMPT_TYPES = {
  shortform: 'shortform',
  longform: 'longform',
  sora2: 'sora2',
  product: 'product',
  product_info: 'product_info',
  product_description: 'product_description'
} as const;

export type PromptType = keyof typeof PROMPT_TYPES;
