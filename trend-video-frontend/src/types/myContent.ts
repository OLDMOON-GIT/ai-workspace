/**
 * My Content 페이지 관련 타입 정의
 */

export interface Script {
  id: string;
  title: string;
  originalTitle?: string;
  content: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  error?: string;
  type?: 'longform' | 'shortform' | 'sora2' | 'product' | 'product-info';
  promptFormat?: 'longform' | 'shortform' | 'sora2' | 'product' | 'product-info';  // type과 동일, 호환성용
  useClaudeLocal?: boolean; // 로컬 Claude 사용 여부 (true) vs API Claude (false)
  logs?: string[];
  tokenUsage?: {
    input_tokens: number;
    output_tokens: number;
  };
  sourceContentId?: string;  // 원본 컨텐츠 ID (변환된 경우)
  createdAt: string;
  updatedAt: string;
  automationQueue?: {         // 자동화 큐 정보
    inQueue: boolean;
    queueStatus: string;
    scheduledTime?: string;
  };
}

export interface Job {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  step: string;
  videoPath?: string;
  thumbnailPath?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
  title?: string;
  type?: 'longform' | 'shortform' | 'sora2' | 'product' | 'product-info';
  promptFormat?: 'longform' | 'shortform' | 'sora2' | 'product' | 'product-info';  // ⭐ 롱폼/숏폼 구분
  logs?: string[];
  sourceContentId?: string;  // 원본 대본 ID
  automationQueue?: {         // 자동화 큐 정보
    inQueue: boolean;
    queueStatus: string;
    scheduledTime?: string;
  };
}

export type TabType = 'all' | 'videos' | 'scripts' | 'published' | 'settings';

export interface YouTubeChannel {
  id: string;
  title: string;
  description: string;
  customUrl?: string;
  thumbnails: {
    default: { url: string };
    medium: { url: string };
    high: { url: string };
  };
  subscriberCount: string;
  videoCount: string;
  viewCount: string;
}

export interface YouTubeUpload {
  id: string;
  userId: string;
  taskId?: string;
  videoId: string;
  videoUrl: string;
  title: string;
  description?: string;
  thumbnailUrl?: string;
  channelId: string;
  channelTitle?: string;
  privacyStatus?: string;
  publishedAt: string;
  createdAt: string;
}

export interface CoupangSettings {
  accessKey: string;
  secretKey: string;
  trackingId: string;
  isConnected: boolean;
  lastChecked?: string;
}

export interface Product {
  productId: string;
  productName: string;
  productPrice: number;
  productImage: string;
  productUrl: string;
  categoryName: string;
  isRocket: boolean;
}

export interface ShortLink {
  id: string;
  productName: string;
  shortUrl: string;
  productUrl?: string;
  imageUrl?: string;
  category?: string;
  price?: number;
  clicks: number;
  createdAt: string;
}

export type CoupangSubTabType = 'bestsellers' | 'links' | 'search';

export interface ContentItem {
  id: string;
  type: 'script' | 'video';
  createdAt: string;
  data: Script | Job;
}
