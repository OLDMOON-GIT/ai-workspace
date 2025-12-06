/**
 * 비디오 관련 유틸리티 함수
 */

import type { VideoItem } from "@/types/video";
import { numberFormatter } from "@/lib/constants/video";

/**
 * VPH (Views Per Hour) 계산
 */
export function calculateVph(video: VideoItem): number {
  const hours = video.hours || 1;
  return Math.round(video.views / hours);
}

/**
 * 숫자 포맷팅 (한국어 형식)
 */
export function renderCount(value: number): string {
  return numberFormatter.format(value);
}

/**
 * 파일명에서 시퀀스 번호 추출
 */
export function extractSequence(filename: string): number | null {
  const match = filename.match(/(?:scene[_-]?|^)(\d+)/i);
  return match ? parseInt(match[1], 10) : null;
}

/**
 * 시퀀스 번호로 미디어 파일 정렬
 */
export function sortBySequence<T extends { file: File }>(files: T[]): T[] {
  return [...files].sort((a, b) => {
    const seqA = extractSequence(a.file.name);
    const seqB = extractSequence(b.file.name);

    if (seqA !== null && seqB !== null) return seqA - seqB;
    if (seqA !== null) return -1;
    if (seqB !== null) return 1;
    return 0;
  });
}

/**
 * 타임스탬프로 미디어 파일 정렬 (오래된 순)
 */
export function sortByTimestamp<T extends { file: File }>(files: T[]): T[] {
  return [...files].sort((a, b) => {
    const lastModifiedA = a.file.lastModified || 0;
    const lastModifiedB = b.file.lastModified || 0;
    return lastModifiedA - lastModifiedB;
  });
}
