/**
 * Task 관련 타입 정의
 *
 * ⭐ 핵심 ID 규칙:
 *   content_id = task_id = script_id = video_id (모두 동일한 UUID)
 *
 * ⭐ 파일 경로 규칙 (content_id로 계산, DB 컬럼 불필요):
 *   - tasks/{content_id}/story.json (대본)
 *   - tasks/{content_id}/output.mp4 (영상)
 *   - tasks/{content_id}/thumbnail.png (썸네일)
 *
 * ⭐ 테이블 구조:
 *   - task: 태스크 정보 관리 (무엇을)
 *   - task_schedule: 스케줄 관리 (언제)
 *   - task_queue: 단계별 실행 상태 (어떻게)
 *   - content: 생성된 콘텐츠 - PK = (content_id, type)
 */

// ============================================================
// task 테이블: 태스크 정보 관리
// ============================================================

/** 프롬프트 형식 (콘텐츠 타입) */
export type PromptFormat = 'shortform' | 'longform' | 'product' | 'product-info' | 'sora2';

/** 태스크 상태 (라이프사이클) */
export type TaskStatus = 'draft' | 'active' | 'completed' | 'archived' | 'cancelled';

/** 태스크 (task 테이블) */
export interface Task {
  id: string;  // ⭐ 이 ID가 content_id로도 사용됨
  title: string;
  promptFormat: PromptFormat;   // 콘텐츠 형식 (task.prompt_format)
  status: TaskStatus;            // 라이프사이클 상태 (task.status)
  userId?: string;
  productInfo?: string;  // JSON
  settings?: string;     // JSON
  category?: string;
  tags?: string;
  channel?: string;
  scriptMode?: 'chrome' | 'api';
  mediaMode?: string;
  model?: string;
  productUrl?: string;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
}

// ============================================================
// task_schedule 테이블: 스케줄 관리
// ============================================================

/** 스케줄 상태 */
export type ScheduleStatus =
  | 'pending'           // 대기
  | 'processing'        // 처리중
  | 'completed'         // 완료
  | 'failed'            // 실패
  | 'cancelled'         // 취소
  | 'waiting_for_upload'; // 업로드 대기

/** 태스크 스케줄 (task_schedule 테이블) */
export interface TaskSchedule {
  id: string;
  taskId: string;        // task.id 참조
  contentId?: string;    // content.id (실행 후 생성, task_id와 동일)
  scheduledTime: string;
  youtubePublishTime?: string;
  status: ScheduleStatus;
  errorMessage?: string;
  failedStage?: string;
  shortformTaskId?: string;
  parentYoutubeUrl?: string;
  shortformUploaded?: boolean;
  createdAt: string;
  updatedAt: string;
}

// ============================================================
// task_queue 테이블: 단계별 실행 상태
// ============================================================

/** 큐 타입 (실행 단계) - Queue Spec v6: 'schedule' 제거됨 */
export type QueueType = 'script' | 'image' | 'video' | 'youtube';

/** 큐 상태 - Queue Spec v3 */
export type QueueStatus = 'waiting' | 'processing' | 'completed' | 'failed' | 'cancelled';

/** 태스크 큐 (task_queue 테이블) */
export interface TaskQueue {
  taskId: string;       // task.id 참조
  type: QueueType;      // script → image → video → youtube 순차 실행
  status: QueueStatus;
  priority?: number;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  userId: string;
  metadata?: string;    // JSON
  logs?: string;        // JSON
  error?: string;
}

// ============================================================
// Content 타입 (content 테이블)
// ============================================================

/** 콘텐츠 타입 */
export type ContentType = 'script' | 'video';

/** 콘텐츠 상태 */
export type ContentStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';

/** 콘텐츠 (content 테이블) - PK = (content_id, type) */
export interface Content {
  contentId: string;  // ⭐ task_id = script_id = video_id (모두 동일)
  type: ContentType;
  userId: string;
  format?: string;
  title: string;
  originalTitle?: string;
  content?: string;
  status: ContentStatus;
  progress?: number;
  error?: string;
  youtubeUrl?: string;
  published?: boolean;
  publishedAt?: string;
  inputTokens?: number;
  outputTokens?: number;
  useClaudeLocal?: boolean;
  sourceContentId?: string;
  aiModel?: string;
  ttsVoice?: string;
  productInfo?: string;
  category?: string;
  createdAt: string;
  updatedAt: string;
}

// ============================================================
// 유틸리티 함수
// ============================================================

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

// Alias for backward compatibility
export const getTaskFilePath = getContentFilePath;
