/**
 * Automation 페이지 관련 타입 정의
 */

// ============================================================
// 자동화 큐 상태 정의 (새로운 세분화된 상태 시스템)
// ============================================================

// 스케줄 상태 타입 (각 단계별 세분화)
export type ScheduleStatus =
  | 'scheduled'           // 예약대기
  | 'script_processing'   // 대본작성중
  | 'script_failed'       // 대본실패
  | 'image_processing'    // 이미지업로드중
  | 'image_failed'        // 이미지실패
  | 'video_processing'    // 영상제작중
  | 'video_failed'        // 영상실패
  | 'youtube_processing'  // 유튜브업로드중
  | 'youtube_failed'      // 유튜브업로드실패
  | 'completed'           // 완료
  | 'cancelled'           // 취소됨
  // 레거시 호환
  | 'pending'
  | 'processing'
  | 'failed'
  | 'waiting_for_upload';

// 상태별 한글 라벨
export const STATUS_LABELS: Record<string, string> = {
  'scheduled': '예약대기',
  'script_processing': '대본작성중',
  'script_failed': '대본실패',
  'image_processing': '이미지업로드중',
  'image_failed': '이미지실패',
  'video_processing': '영상제작중',
  'video_failed': '영상실패',
  'youtube_processing': '유튜브업로드중',
  'youtube_failed': '유튜브업로드실패',
  'completed': '완료',
  'cancelled': '취소됨',
  // 레거시 호환
  'pending': '예약대기',
  'processing': '진행중',
  'failed': '실패',
  'waiting_for_upload': '이미지업로드중',
};

// 실패 상태 목록 (cancelled도 포함 - 재시도 가능)
export const FAILED_STATUSES = [
  'script_failed',
  'image_failed',
  'video_failed',
  'youtube_failed',
  'failed',  // 레거시
  'cancelled',  // 취소됨 - 재시도 가능
];

// 진행중 상태 목록
export const PROCESSING_STATUSES = [
  'script_processing',
  'image_processing',
  'video_processing',
  'youtube_processing',
  'processing',  // 레거시
];

// 상태가 실패 상태인지 확인
export function isFailedStatus(status: string): boolean {
  return FAILED_STATUSES.includes(status);
}

// 상태가 진행중 상태인지 확인
export function isProcessingStatus(status: string): boolean {
  return PROCESSING_STATUSES.includes(status);
}

/**
 * 제목 추가 폼 데이터
 */
export interface NewTitleForm {
  title: string;
  promptFormat: string;
  category: string;
  tags: string;
  productUrl: string;
  scheduleTime: string;
  channel: string;
  scriptMode: 'chrome' | 'api';
  mediaMode: string;
  aiModel: string;
  youtubeSchedule: 'immediate' | 'scheduled';
  youtubePublishAt: string;
  youtubePrivacy: string;
}

/**
 * 제목 편집 폼 데이터
 */
export interface EditTitleForm {
  title?: string;
  promptFormat?: string;
  category?: string;
  tags?: string;
  productUrl?: string;
  scheduleTime?: string;
  channel?: string;
  scriptMode?: 'chrome' | 'api';
  mediaMode?: string;
  model?: string;
  youtubeSchedule?: 'immediate' | 'scheduled';
  youtubePublishAt?: string;
  youtubePrivacy?: string;
}

/**
 * 제목 항목 (큐 관리)
 */
export interface TitleItem {
  id: string;
  title: string;
  type: string;
  category: string;
  tags?: string;
  productUrl?: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'waiting_for_upload' | 'cancelled';
  scheduleTime?: string;
  createdAt: string;
  updatedAt?: string;
  scriptId?: string;
  jobId?: string;
  videoPath?: string;
  error?: string;
  channel?: string;
  scriptMode?: 'chrome' | 'api';
  mediaMode?: string;
  model?: string;
  youtubeSchedule?: 'immediate' | 'scheduled';
  youtubePublishAt?: string;
  youtubePrivacy?: string;
  youtubeVideoId?: string;
  youtubeUploadedAt?: string;
}

/**
 * 스케줄 항목 (캘린더/스케줄 관리)
 */
export interface ScheduleItem {
  id: string;
  title: string;
  scheduledTime: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  type: string;
  category: string;
  channel?: string;
  youtubeVideoId?: string;
}

/**
 * 스케줄러 상태
 */
export interface SchedulerStatus {
  isRunning: boolean;
  lastChecked?: string;
  nextSchedule?: string;
  activeTasks?: number;
  error?: string;
}

/**
 * 자동화 설정
 */
export interface AutomationSettings {
  defaultChannel?: string;
  defaultCategory?: string;
  defaultType?: string;
  defaultModel?: string;
  defaultMediaMode?: string;
  defaultPrivacy?: string;
  [key: string]: any;
}

/**
 * YouTube 채널 정보
 */
export interface YouTubeChannel {
  id: string;
  channelId: string;
  channelTitle: string;
  thumbnailUrl?: string;
  subscriberCount?: number;
  description?: string;
  isDefault?: boolean;
}

/**
 * 진행률 정보
 */
export interface ProgressInfo {
  scriptProgress?: number;
  videoProgress?: number;
}

/**
 * 상품 데이터 (쿠팡 상품 관리에서 전달)
 */
export interface ProductData {
  productId: string;
  productName: string;
  productPrice: number;
  productImage: string;
  productUrl: string; // 딥링크 (수익화 필수)
  categoryName?: string;
  // 백엔드 대본용 키
  title?: string;
  thumbnail?: string;
  product_link?: string; // 딥링크 (수익화 필수)
  description?: string;
}

/**
 * 상품관리에서 전달된 자동 입력 데이터
 */
export interface AutomationPrefillData {
  title?: string;
  type?: string;
  category?: string;
  tags?: string;
  productUrl?: string; // 딥링크
  productData?: ProductData;
}

/**
 * 제목 풀 항목
 */
export interface PoolTitleItem {
  id: string;
  title: string;
  category: string;
  score: number;
  reason?: string;
  createdAt: string;
  usedAt?: string;
  status: 'available' | 'used';
}

/**
 * 제목 풀 통계
 */
export interface PoolStats {
  category: string;
  total: number;
  available: number;
  used: number;
  avgScore: number;
}

/**
 * 로그 항목
 */
export interface LogItem {
  timestamp: string;
  level: 'info' | 'error' | 'warn' | 'success';
  message: string;
  details?: any;
}

/**
 * 메인 탭 타입
 */
export type MainTabType = 'queue' | 'schedule-management' | 'monitoring' | 'title-pool';

/**
 * 큐 탭 타입 (새로운 8개 탭)
 * - schedule: 예약큐
 * - script: 대본큐
 * - image: 이미지업로드큐
 * - video: 영상제작큐
 * - youtube: 유튜브업로드큐
 * - failed: 실패
 * - completed: 완료
 * - cancelled: 중지
 */
export type QueueTabType = 'schedule' | 'script' | 'image' | 'video' | 'youtube' | 'failed' | 'completed' | 'cancelled';

// 큐 탭별 표시되는 상태 매핑 (레거시 상태 포함)
export const QUEUE_TAB_STATUS_MAP: Record<QueueTabType, string[]> = {
  'schedule': ['scheduled', 'pending', 'waiting'],  // waiting: 레거시 호환 (schedule 타입)
  'script': ['script_processing', 'processing'],  // processing: 레거시 호환
  'image': ['image_processing', 'waiting_for_upload'],
  'video': ['video_processing', 'video_pending', 'waiting_for_video'],  // 레거시 호환
  'youtube': ['youtube_processing', 'youtube_pending', 'waiting_for_youtube'],  // 레거시 호환
  'failed': ['script_failed', 'image_failed', 'video_failed', 'youtube_failed', 'failed'],
  'completed': ['completed'],
  'cancelled': ['cancelled'],
};

// 큐 탭별 라벨
export const QUEUE_TAB_LABELS: Record<QueueTabType, string> = {
  'schedule': '예약',
  'script': '대본',
  'image': '이미지',
  'video': '영상',
  'youtube': '유튜브',
  'failed': '실패',
  'completed': '완료',
  'cancelled': '중지',
};

/**
 * 스케줄 관리 탭 타입
 */
export type ScheduleManagementTabType = 'channel-settings' | 'category-management' | 'calendar';
