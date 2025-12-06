/**
 * 비디오 카드 컴포넌트
 */

import Image from "next/image";
import { type KeyboardEvent } from "react";
import type { VideoItem } from "@/types/video";
import { renderCount } from "@/lib/utils/videoUtils";
import { categoryLabelMap } from "@/lib/constants/video";

interface VideoCardProps {
  video: VideoItem;
  isSelected: boolean;
  onToggle: () => void;
}

export default function VideoCard({
  video,
  isSelected,
  onToggle,
}: VideoCardProps) {
  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      onToggle();
    }
  };

  const categoryLabel = video.categoryId ? categoryLabelMap[video.categoryId] : undefined;

  return (
    <article
      role="checkbox"
      aria-checked={isSelected}
      tabIndex={0}
      onClick={onToggle}
      onKeyDown={handleKeyDown}
      className={`relative flex cursor-pointer flex-col overflow-hidden rounded-2xl border bg-white shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 ${
        isSelected
          ? "border-emerald-300 ring-2 ring-emerald-300"
          : "border-zinc-200 ring-1 ring-transparent hover:ring-emerald-200"
      }`}
    >
      <div className="absolute left-4 top-4 z-20 flex items-center gap-2">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={(event) => {
            event.stopPropagation();
            onToggle();
          }}
          onClick={(event) => event.stopPropagation()}
          className="h-4 w-4 cursor-pointer rounded border-slate-300 text-emerald-500 focus:ring-emerald-400"
        />
        <span
          className={`rounded-full px-2 py-1 text-xs font-semibold shadow ${
            isSelected ? "bg-emerald-500 text-emerald-950" : "bg-black/60 text-slate-100"
          }`}
        >
          {isSelected ? "선택됨" : "탐색"}
        </span>
      </div>

      <div className="relative aspect-video w-full overflow-hidden">
        <Image
          src={video.thumbnailUrl}
          alt={video.title}
          fill
          sizes="(min-width: 1280px) 384px, (min-width: 768px) 50vw, 100vw"
          className="object-cover"
          priority={video.id === "1"}
        />
        <span className="absolute bottom-2 right-2 rounded-md bg-black/75 px-2 py-1 text-xs font-medium text-white">
          {video.duration}
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-3 p-5">
        {/* 제목 영역 */}
        <div className="min-w-0">
          <h3
            className="text-base font-semibold leading-5 text-zinc-900"
            style={{ display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: 2, overflow: 'hidden' }}
            title={video.title}
          >
            {video.title}
          </h3>
        </div>

        {/* 버튼 영역 */}
        <div className="flex flex-wrap items-center gap-2">
          <a
            href={video.videoUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(event) => event.stopPropagation()}
            className="inline-flex items-center justify-center whitespace-nowrap rounded-full border border-zinc-200 px-3 py-1 text-xs font-medium text-slate-700 transition hover:border-slate-500 hover:text-slate-900"
          >
            영상 보기
          </a>
          <a
            href={`http://downsub.com/?url=${encodeURIComponent(video.videoUrl)}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(event) => event.stopPropagation()}
            className="inline-flex items-center justify-center whitespace-nowrap rounded-full border border-zinc-200 px-3 py-1 text-xs font-medium text-slate-700 transition hover:border-slate-500 hover:text-slate-900"
          >
            자막 받기
          </a>
          <button
            onClick={async (event) => {
              event.stopPropagation();
              try {
                const response = await fetch(video.thumbnailUrl);
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `thumbnail_${video.id}.jpg`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                window.URL.revokeObjectURL(url);
              } catch (error) {
                console.error('썸네일 다운로드 실패:', error);
                alert('썸네일 다운로드에 실패했습니다.');
              }
            }}
            className="inline-flex items-center justify-center whitespace-nowrap rounded-full border border-zinc-200 px-3 py-1 text-xs font-medium text-slate-700 transition hover:border-slate-500 hover:text-slate-900"
          >
            썸네일
          </button>
        </div>
        <dl className="grid grid-cols-2 gap-3 text-sm text-zinc-600">
          <div>
            <dt className="text-xs text-zinc-500">조회수</dt>
            <dd className="font-medium text-zinc-900">{renderCount(video.views)}</dd>
          </div>
          <div>
            <dt className="text-xs text-zinc-500">좋아요</dt>
            <dd className="font-medium text-zinc-900">{renderCount(video.likes)}</dd>
          </div>
          <div>
            <dt className="text-xs text-zinc-500">댓글</dt>
            <dd className="font-medium text-zinc-900">{renderCount(video.comments)}</dd>
          </div>
          <div>
            <dt className="text-xs text-zinc-500">게시일</dt>
            <dd className="font-medium text-zinc-900">
              {new Date(video.publishedAt).toLocaleDateString("ko-KR")}
            </dd>
          </div>
        </dl>
        <div className="mt-auto flex flex-wrap items-center gap-2 rounded-xl bg-zinc-100/80 p-3 text-xs text-zinc-700">
          <span className="rounded-md bg-white px-2 py-1 font-semibold text-slate-700">
            {video.type.toUpperCase()}
          </span>
          {categoryLabel && (
            <span className="rounded-md bg-white px-2 py-1 font-semibold text-slate-700">
              {categoryLabel}
            </span>
          )}
          <span>
            채널: <strong>{video.channelName}</strong>
          </span>
          <span>
            구독자 {renderCount(video.channelSubscribers)}명
          </span>
        </div>
      </div>
    </article>
  );
}
