/**
 * 씬 데이터 타입 정의
 *
 * Backend의 씬 처리 로직과 연동
 * - seq: 명시적 순서 (우선순위 1)
 * - createdAt: 생성 시간 (우선순위 2)
 * - 둘 다 없으면 원래 순서 유지 (우선순위 3)
 */

export interface Scene {
  /** 씬 번호 */
  sceneNumber?: number;

  /** 제목 */
  title?: string;

  /** 나레이션 텍스트 */
  narration?: string;

  /** 이미지 프롬프트 */
  imagePrompt?: string;

  /** Sora 프롬프트 */
  soraPrompt?: string;

  /** 지속 시간 (초) */
  duration?: number;
  durationSeconds?: number;

  /** 명시적 순서 번호 (우선순위 1) */
  seq?: number | null;

  /** 생성 시간 ISO 8601 (우선순위 2) */
  createdAt?: string | null;

  /** 기타 필드 허용 */
  [key: string]: any;
}

/**
 * 비디오/이미지 미디어 데이터
 */
export interface SceneMedia {
  /** 씬 데이터 */
  scene: Scene;

  /** 미디어 타입 */
  mediaType: 'image' | 'video';

  /** 미디어 파일 경로 */
  mediaPath: string;

  /** 이미지 파일 경로 (mediaType='image'일 때) */
  imagePath?: string | null;

  /** 비디오 파일 경로 (mediaType='video'일 때) */
  videoPath?: string | null;

  /** 씬 디렉토리 */
  sceneDir: string;

  /** 씬 번호 */
  sceneNum: number;
}
