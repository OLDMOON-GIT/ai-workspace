const fs = require('fs');

const content = `/**
 * Content 관련 타입 정의
 */

// ==================== Enum 타입 정의 ====================

export enum ContentTypeEnum {
  SCRIPT = 'script',
  VIDEO = 'video'
}

export enum ContentFormatEnum {
  LONGFORM = 'longform',
  SHORTFORM = 'shortform',
  SORA2 = 'sora2',
  PRODUCT = 'product',
  PRODUCT_INFO = 'product-info'
}

export enum ContentStatusEnum {
  DRAFT = 'draft',
  PENDING = 'pending',
  SCRIPT = 'script',
  VIDEO = 'video',
  COMPLETED = 'completed',
  FAILED = 'failed'
}

export enum QueueTypeEnum {
  SCHEDULE = 'schedule',
  SCRIPT = 'script',
  IMAGE = 'image',
  VIDEO = 'video',
  YOUTUBE = 'youtube'
}

export enum QueueStatusEnum {
  WAITING = 'waiting',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled'
}

export enum ScheduleStatusEnum {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
  WAITING_FOR_UPLOAD = 'waiting_for_upload'
}

export enum PromptFormatEnum {
  SHORTFORM = 'shortform',
  LONGFORM = 'longform',
  PRODUCT = 'product',
  PRODUCT_INFO = 'product-info',
  SORA2 = 'sora2'
}

export enum TaskStatusEnum {
  DRAFT = 'draft',
  ACTIVE = 'active',
  COMPLETED = 'completed',
  ARCHIVED = 'archived',
  CANCELLED = 'cancelled'
}

// ==================== 문자열 리터럴 타입 ====================

export type ContentType = 'script' | 'video';
export type ContentFormat = 'longform' | 'shortform' | 'sora2' | 'product' | 'product-info';
export type ContentStatus = 'draft' | 'pending' | 'script' | 'video' | 'completed' | 'failed';
export type QueueType = 'script' | 'image' | 'video' | 'youtube';
export type QueueStatus = 'waiting' | 'processing' | 'completed' | 'failed' | 'cancelled';
export type ScheduleStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled' | 'waiting_for_upload';
export type PromptFormat = 'shortform' | 'longform' | 'product' | 'product-info' | 'sora2';
export type TaskStatus = 'draft' | 'active' | 'completed' | 'archived' | 'cancelled';
export type TaskType = PromptFormat;

// ==================== 상품 정보 ====================

export interface ProductInfo {
  title?: string;
  thumbnail?: string;
  product_link?: string;
  description?: string;
}

export interface TokenUsage {
  input_tokens: number;
  output_tokens: number;
}

// ==================== Content 인터페이스 ====================

export interface Content {
  id: string;
  contentId: string;
  userId: string;
  type?: ContentType;
  format?: ContentFormat;
  promptFormat?: ContentFormat;
  title: string;
  originalTitle?: string;
  scriptContent?: string;
  videoPath?: string;
  content?: string;
  sourceContentId?: string;
  status: ContentStatus;
  progress: number;
  error?: string;
  thumbnailPath?: string;
  ttsVoice?: string;
  youtubeUrl?: string;
  tokenUsage?: TokenUsage;
  useClaudeLocal?: boolean;
  aiModel?: string;
  productInfo?: ProductInfo;
  category?: string;
  logs?: string[];
  folderId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface GetScriptResponse {
  script: Content;
}

export interface GetScriptErrorResponse {
  error: string;
}

export interface GetContentsResponse {
  contents: Content[];
  total: number;
}

export interface CreateContentOptions {
  id?: string;
  format?: ContentFormat;
  promptFormat?: ContentFormat;
  originalTitle?: string;
  scriptContent?: string;
  videoPath?: string;
  content?: string;
  tokenUsage?: TokenUsage;
  useClaudeLocal?: boolean;
  aiModel?: string;
  sourceContentId?: string;
  productInfo?: ProductInfo;
  category?: string;
  folderId?: string;
  ttsVoice?: string;
  youtubeUrl?: string;
}

export type ContentUpdateFields = Partial<Pick<Content,
  | 'status'
  | 'progress'
  | 'error'
  | 'scriptContent'
  | 'videoPath'
  | 'youtubeUrl'
  | 'thumbnailPath'
  | 'tokenUsage'
  | 'aiModel'
> & {
  content?: string;
}>;

export function getContentFilePath(contentId: string, fileType: 'story' | 'video' | 'thumbnail'): string {
  const basePath = \`tasks/\${contentId}\`;
  switch (fileType) {
    case 'story':
      return \`\${basePath}/story.json\`;
    case 'video':
      return \`\${basePath}/output.mp4\`;
    case 'thumbnail':
      return \`\${basePath}/thumbnail.png\`;
  }
}

export function isScript(content: Content): boolean {
  return !!content.scriptContent || content.type === 'script';
}

export function isVideo(content: Content): boolean {
  return !!content.videoPath || content.type === 'video';
}

export function hasScript(content: Content): content is Content & { scriptContent: string } {
  return !!content.scriptContent;
}

export function hasVideo(content: Content): content is Content & { videoPath: string } {
  return !!content.videoPath;
}

export function hasYouTube(content: Content): content is Content & { youtubeUrl: string } {
  return !!content.youtubeUrl;
}

export function hasProductInfo(content: Content): content is Content & { productInfo: ProductInfo } {
  return content.productInfo !== undefined && content.productInfo !== null;
}

export function isValidProductInfo(productInfo: ProductInfo | undefined | null): productInfo is ProductInfo {
  if (!productInfo) return false;
  return !!(productInfo.product_link || productInfo.thumbnail || productInfo.description);
}
`;

fs.writeFileSync('C:/Users/oldmoon/workspace/trend-video-frontend/src/types/content.ts', content, 'utf8');
console.log('File written successfully');
