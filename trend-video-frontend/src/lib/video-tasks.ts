/**
 * 영상 생성 작업 상태 관리 (메모리 기반)
 * 프로덕션에서는 Redis 등 사용 권장
 */

export type VideoTaskStatus = {
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  step: string;
  videoPath?: string;
  thumbnailPath?: string;
  videoId?: string;
  error?: string;
};

export const videoTasks = new Map<string, VideoTaskStatus>();

// 하위 호환성을 위한 alias
export type VideoJobStatus = VideoTaskStatus;
export const videoJobs = videoTasks;
