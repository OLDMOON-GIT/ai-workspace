/**                                                                             
 * Content 관련 타입 정의                                                       
 *                                                                              
 * ⚠️ 중요: DB 스키마 변경 시 여기를 먼저 업데이트하세요!                        
 * 타입 에러가 발생하면 관련된 모든 코드가 표시됩니다.                          
 *                                                                              
 * ⭐ 핵심 ID 규칙 (Queue Spec v3 패턴):                                         
 *   content_id = task_id (1:1 매핑)                                            
 *   PK = content_id only                                                       
 *                                                                              
 * ⭐ 진행도 추적:                                                               
 *   script_content 존재 → 대본 완료                                            
 *   video_path 존재 → 영상 완료                                                
 *   youtube_url 존재 → 퍼블리시 노출                                           
 */                                                                             
                                                                                
// ==================== Enum 타입 정의 ====================                     
                                                                                
/**                                                                             
 * @deprecated ContentType 제거됨 - Queue Spec v3에서 type 컬럼 삭제            
 * 이제 script_content와 video_path로 진행도 추적                               
 */                                                                             
export enum ContentTypeEnum {                                                   
  SCRIPT = 'script',                                                            
  VIDEO = 'video'                                                               
}                                                                               
                                                                                
/**                                                                             
 * 콘텐츠 포맷 (영상 종류)                                                      
 */                                                                             
export enum ContentFormatEnum {                                                 
  LONGFORM = 'longform',                                                        
  SHORTFORM = 'shortform',                                                      
  SORA2 = 'sora2',                                                              
  PRODUCT = 'product',           // 상품 대본 (쿠팡 링크 포함)                  
  PRODUCT_INFO = 'product-info'  // 상품 기입 정보 (YouTube/릴스용)             
}                                                                               
                                                                                
/**                                                                             
 * 콘텐츠 상태 (content.status)                                                 
 *                                                                              
 * BTS-3363: 3단계로 단순화                                                     
 * - draft: 내콘텐츠에 안 나옴 (초안)                                           
 * - script: 대본탭에 표시                                                      
 * - video: 영상탭에 표시                                                       
 * - completed: 완료 (YouTube 업로드 포함)                                      
 * - failed: 실패                                                               
 */                                                                             
export enum ContentStatusEnum {                                                 
  DRAFT = 'draft',                                                              
  PENDING = 'pending',                                                          
  SCRIPT = 'script',                                                            
  VIDEO = 'video',                                                              
  COMPLETED = 'completed',                                                      
  FAILED = 'failed'                                                             
}                                                                               
                                                                                
/**                                                                             
 * 큐 타입 (task_queue.type) - 처리 단계                                        
 * schedule → script → image → video → youtube 순차 실행                        
 */                                                                             
export enum QueueTypeEnum {                                                     
  SCHEDULE = 'schedule',                                                        
  SCRIPT = 'script',                                                            
  IMAGE = 'image',                                                              
  VIDEO = 'video',                                                              
  YOUTUBE = 'youtube'                                                           
}                                                                               
                                                                                
/**                                                                             
 * 큐 상태 (task_queue.status)                                                  
 */                                                                             
export enum QueueStatusEnum {                                                   
  WAITING = 'waiting',                                                          
  PROCESSING = 'processing',                                                    
  COMPLETED = 'completed',                                                      
  FAILED = 'failed',                                                            
  CANCELLED = 'cancelled'                                                       
}                                                                               
                                                                                
/**                                                                             
 * 스케줄 상태 (task_schedule.status)                                           
 */                                                                             
export enum ScheduleStatusEnum {                                                
  PENDING = 'pending',                                                          
  PROCESSING = 'processing',                                                    
  COMPLETED = 'completed',                                                      
  FAILED = 'failed',                                                            
  CANCELLED = 'cancelled',                                                      
  WAITING_FOR_UPLOAD = 'waiting_for_upload'                                     
}                                                                               
                                                                                
/**                                                                             
 * 프롬프트 포맷 (task.prompt_format)                                           
 */                                                                             
export enum PromptFormatEnum {                                                  
  SHORTFORM = 'shortform',                                                      
  LONGFORM = 'longform',                                                        
  PRODUCT = 'product',                                                          
  PRODUCT_INFO = 'product-info',                                                
  SORA2 = 'sora2'                                                               
}                                                                               
                                                                                
/**                                                                             
 * 태스크 상태 (task.status)                                                    
 */                                                                             
export enum TaskStatusEnum {                                                    
  DRAFT = 'draft',                                                              
  ACTIVE = 'active',                                                            
  COMPLETED = 'completed',                                                      
  ARCHIVED = 'archived',                                                        
  CANCELLED = 'cancelled'                                                       
}                                                                               
                                                                                
// ==================== 문자열 리터럴 타입 (하위 호환성) ====================   
                                                                                
/**                                                                             
 * @deprecated ContentType 제거됨 - Queue Spec v3에서 type 컬럼 삭제            
 */                                                                             
export type ContentType = 'script' | 'video';                                   
export type ContentFormat = 'longform' | 'shortform' | 'sora2' | 'product' | 'product-info';                                                                    
export type ContentStatus = 'draft' | 'pending' | 'script' | 'video' | 'completed' | 'failed';                                                                  
                                                                                
export type QueueType = 'script' | 'image' | 'video' | 'youtube';  // v6: 'schedule' 제거됨                                                                     
export type QueueStatus = 'waiting' | 'processing' | 'completed' | 'failed' | 'cancelled';                                                                      
export type ScheduleStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled' | 'waiting_for_upload';                                            
export type PromptFormat = 'shortform' | 'longform' | 'product' | 'product-info' | 'sora2';                                                                     
export type TaskStatus = 'draft' | 'active' | 'completed' | 'archived' | 'cancelled';                                                                           
                                                                                
/** @deprecated TaskType은 PromptFormat으로 이름이 변경되었습니다 */            
export type TaskType = PromptFormat;                                            
                                                                                
// ==================== 상품 정보 ====================                          
                                                                                
/**                                                                             
 * 상품 정보 (쿠팡 파트너스)                                                    
 *                                                                              
 * DB 저장: content.product_info (JSON 문자열)                                  
 * API 반환: Content.productInfo (객체)                                         
 */                                                                             
export interface ProductInfo {                                                  
  title?: string;        // 상품명                                              
  thumbnail?: string;    // 썸네일 URL                                          
  product_link?: string; // 쿠팡 파트너스 링크                                  
  description?: string;  // 상품 설명                                           
}                                                                               
                                                                                
// ==================== AI 토큰 사용량 ====================                     
                                                                                
export interface TokenUsage {                                                   
  input_tokens: number;                                                         
  output_tokens: number;                                                        
}                                                                               
                                                                                
// ==================== Content 인터페이스 ====================                 
                                                                                
/**                                                                             
 * 통합 Content 타입 (Queue Spec v3 패턴)                                       
 *                                                                              
 * DB 테이블: content                                                           
 * PK: content_id only                                                          
 *                                                                              
 * ⭐ ID 규칙: content_id = task_id (1:1 매핑)                                   
 * ⭐ 진행도 추적:                                                               
 *   - script_content 존재 → 대본 완료                                          
 *   - video_path 존재 → 영상 완료                                              
 *   - youtube_url 존재 → 퍼블리시 노출                                         
 */                                                                             
export interface Content {                                                      
  // 기본 정보                                                                  
  /** @deprecated id 대신 contentId 사용. 하위 호환성을 위해 유지 */            
  id: string;                                                                   
  /** ⭐ 콘텐츠 ID (= task_id) */                                                
  contentId: string;                                                            
  userId: string;                                                               
  /** @deprecated type 제거됨 - Queue Spec v3에서 type 컬럼 삭제 */             
  type?: ContentType;                                                           
  /** @deprecated format 대신 promptFormat 사용. DB 컬럼명: prompt_format */    
  format?: ContentFormat;                                                       
  /** 콘텐츠 포맷 (DB: prompt_format) */                                        
  promptFormat?: ContentFormat;                                                 
                                                                                
  // 내용                                                                       
  title: string;                                                                
  originalTitle?: string;  // 사용자 입력 원본 제목                             
                                                                                
  // ⭐ Queue Spec v3: type 대신 각 단계별 필드로 분리                           
  scriptContent?: string;  // 대본 JSON (기존 type='script'의 content)          
  videoPath?: string;      // 영상 경로 (기존 type='video'의 content)           
                                                                                
  /** @deprecated content 제거됨 - scriptContent 사용 */                        
  content?: string;                                                             
                                                                                
  // 변환 정보                                                                  
  sourceContentId?: string;  // 원본 컨텐츠 ID                                  
                                                                                
  // 상태                                                                       
  status: ContentStatus;                                                        
  progress: number;  // 0-100 (⭐ DB 저장 안함, status로 계산)                   
  error?: string;                                                               
                                                                                
  // 영상 관련                                                                  
  // ⚠️ thumbnailPath는 DB에 저장하지 않음                                       
  // tasks/{contentId}/thumbnail.png 로 계산                                    
  thumbnailPath?: string;  // @deprecated - getContentFilePath() 사용           
  ttsVoice?: string;       // TTS 음성                                          
  youtubeUrl?: string;     // 유튜브 URL (퍼블리시 노출 기준)                   
                                                                                
  // AI 사용량                                                                  
  tokenUsage?: TokenUsage;                                                      
  useClaudeLocal?: boolean;  // 로컬 Claude 사용 여부                           
  aiModel?: string;                                                             
                                                                                
  // ⭐ 상품 정보 (format='product' 또는 'product-info'일 때)                    
  productInfo?: ProductInfo;                                                    
                                                                                
  // 카테고리 (대본 스타일 구분)                                                
  category?: string;                                                            
                                                                                
  // 로그                                                                       
  logs?: string[];                                                              
                                                                                
  // 폴더                                                                       
  folderId?: string;                                                            
                                                                                
  // 시간                                                                       
  createdAt: string;                                                            
  updatedAt: string;                                                            
}                                                                               
                                                                                
// ==================== API 응답 타입 ====================                      
                                                                                
/**                                                                             
 * GET /api/scripts/[id] 응답                                                   
 */                                                                             
export interface GetScriptResponse {                                            
  script: Content;                                                              
}                                                                               
                                                                                
/**                                                                             
 * GET /api/scripts/[id] 에러 응답                                              
 */                                                                             
export interface GetScriptErrorResponse {                                       
  error: string;                                                                
}                                                                               
                                                                                
/**                                                                             
 * GET /api/contents 응답 (내콘텐츠 목록)                                       
 */                                                                             
export interface GetContentsResponse {                                          
  contents: Content[];                                                          
  total: number;                                                                
}                                                                               
                                                                                
// ==================== 생성 옵션 ====================                          
                                                                                
export interface CreateContentOptions {                                         
  id?: string;  // ⭐ 외부에서 ID 지정 가능 (content_id = task_id)               
  /** @deprecated format 대신 promptFormat 사용 */                              
  format?: ContentFormat;                                                       
  promptFormat?: ContentFormat;                                                 
  originalTitle?: string;                                                       
                                                                                
  // ⭐ Queue Spec v3: scriptContent와 videoPath로 분리                          
  scriptContent?: string;  // 대본 JSON                                         
  videoPath?: string;      // 영상 경로                                         
                                                                                
  /** @deprecated content 대신 scriptContent 사용 */                            
  content?: string;                                                             
                                                                                
  tokenUsage?: TokenUsage;                                                      
  useClaudeLocal?: boolean;                                                     
  aiModel?: string;                                                             
  sourceContentId?: string;                                                     
  productInfo?: ProductInfo;  // ⭐ 상품 정보 (task에서 전달)                    
  category?: string;  // ⭐ 카테고리 (상품이면 자동 "상품")                      
  folderId?: string;                                                            
  ttsVoice?: string;  // ⭐ TTS 음성 (영상용)                                    
  youtubeUrl?: string;  // 유튜브 URL                                           
}                                                                               
                                                                                
// ==================== 업데이트 타입 ====================                      
                                                                                
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
  /** @deprecated content 대신 scriptContent 사용 */                            
  content?: string;                                                             
}>;                                                                             
                                                                                
// ==================== 유틸리티 함수 ====================                      
                                                                                
/**                                                                             
 * content_id로 파일 경로 생성                                                  
 * @param contentId 콘텐츠 ID (= task_id = script_id = video_id)                
 * @param fileType 파일 타입                                                    
 * @returns 파일 경로                                                           
 */                                                                             
export function getContentFilePath(contentId: string, fileType: 'story' | 'video' | 'thumbnail'): string {                                                      
  const basePath = `tasks/${contentId}`;                                        
  switch (fileType) {                                                           
    case 'story':                                                               
      return `${basePath}/story.json`;                                          
    case 'video':                                                               
      return `${basePath}/output.mp4`;                                          
    case 'thumbnail':                                                           
      return `${basePath}/thumbnail.png`;                                       
  }                                                                             
}                                                                               
                                                                                
// ==================== 타입 가드 ====================                          
                                                                                
/**                                                                             
 * @deprecated type 컬럼 제거됨 - scriptContent 존재 여부로 확인                
 */                                                                             
export function isScript(content: Content): boolean {                           
  return !!content.scriptContent || content.type === 'script';                  
}                                                                               
                                                                                
/**                                                                             
 * @deprecated type 컬럼 제거됨 - videoPath 존재 여부로 확인                    
 */                                                                             
export function isVideo(content: Content): boolean {                            
  return !!content.videoPath || content.type === 'video';                       
}                                                                               
                                                                                
/**                                                                             
 * Content가 대본을 가지고 있는지 확인                                          
 */                                                                             
export function hasScript(content: Content): content is Content & { scriptConten
t: string } {                                                                   
  return !!content.scriptContent;                                               
}                                                                               
                                                                                
/**                                                                             
 * Content가 영상을 가지고 있는지 확인                                          
 */                                                                             
export function hasVideo(content: Content): content is Content & { videoPath: st
ring } {                                                                        
  return !!content.videoPath;                                                   
}                                                                               
                                                                                
/**                                                                             
 * Content가 YouTube에 업로드되었는지 확인                                      
 */                                                                             
export function hasYouTube(content: Content): content is Content & { youtubeUrl:
 string } {                                                                     
  return !!content.youtubeUrl;                                                  
}                                                                               
                                                                                
/**                                                                             
 * Content가 상품 정보를 가지고 있는지 확인                                     
 */                                                                             
export function hasProductInfo(content: Content): content is Content & { product
Info: ProductInfo } {                                                           
  return content.productInfo !== undefined && content.productInfo !== null;     
}                                                                               
                                                                                
/**                                                                             
 * ProductInfo가 유효한지 확인 (필수 필드 존재)                                 
 */                                                                             
export function isValidProductInfo(productInfo: ProductInfo | undefined | null):
 productInfo is ProductInfo {                                                   
  if (!productInfo) return false;                                               
  return !!(productInfo.product_link || productInfo.thumbnail || productInfo.des
cription);                                                                      
}