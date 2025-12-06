/**
 * Page 컴포넌트 관련 타입 정의
 */

import type { DateFilter, SortOption, VideoType, VideoItem } from "./video";
import type { ModelOption } from "@/lib/constants/video";

export type StoredFilters = {
  viewRange: { min: number; max: number };
  subRange: { min: number; max: number };
  videoType: VideoType | "all";
  dateFilter: DateFilter;
  sortBy: SortOption;
  selectedCategories: string[];
  titleQuery: string;
  durationRange: { min: number; max: number };
  selectedModel: ModelOption;
};

export interface PipelineResultItem {
  id: string;
  title: string;
  channelName: string;
  views: number;
  script: string;
  videoUrl: string;
  transcript?: string;
  funHighlights?: string[];
  thumbnailPrompt?: string;
}

export type RunPipelinePayload = {
  results: PipelineResultItem[];
  pipelineModel: ModelOption;
  selectedVideos: VideoItem[];
};

export type ToastType = {
  message: string;
  type: 'success' | 'info' | 'error';
};

export type MediaItem = {
  type: 'image' | 'video';
  file: File;
};

export type TitleTransformItem = {
  original: string;
  options: string[];
  selected: number;
};

export type VideoProgress = {
  step: string;
  progress: number;
};

export type ScriptProgress = {
  step: string;
  progress: number;
};
