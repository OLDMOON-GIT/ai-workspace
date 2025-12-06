// C:\Users\oldmoon\workspace\trend-video-frontend\src\components\ImagePreviewModal.tsx
// BTS-3318: 롱폼/숏폼 이미지 미리보기 모달
'use client';

import { useEffect, useState, useCallback } from 'react';

export interface PreviewImage {
  filename: string;
  url: string;
  sceneIndex?: number;
  narration?: string;
  type?: 'image' | 'video';
}

interface ImagePreviewModalProps {
  taskId: string;
  title: string;
  images: PreviewImage[];
  promptFormat: 'longform' | 'shortform' | 'product';
  onClose: () => void;
  onConfirm: () => void;
  onRegenerate?: () => void;
  onReorder?: (reorderedImages: PreviewImage[]) => void;
  isLoading?: boolean;
}

export default function ImagePreviewModal({
  taskId,
  title,
  images,
  promptFormat,
  onClose,
  onConfirm,
  onRegenerate,
  onReorder,
  isLoading = false
}: ImagePreviewModalProps) {
  const [orderedImages, setOrderedImages] = useState<PreviewImage[]>(images);
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const [selectedImage, setSelectedImage] = useState<PreviewImage | null>(null);

  useEffect(() => {
    setOrderedImages(images);
  }, [images]);

  // ESC 키로 닫기
  useEffect(() => {
    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (selectedImage) {
          setSelectedImage(null);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose, selectedImage]);

  // 드래그 앤 드롭 핸들러
  const handleDragStart = useCallback((e: React.DragEvent, index: number) => {
    setDraggingIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    if (draggingIndex === null || draggingIndex === dropIndex) {
      setDraggingIndex(null);
      return;
    }

    const newImages = [...orderedImages];
    const [draggedItem] = newImages.splice(draggingIndex, 1);
    newImages.splice(dropIndex, 0, draggedItem);

    setOrderedImages(newImages);
    setDraggingIndex(null);

    if (onReorder) {
      onReorder(newImages);
    }
  }, [draggingIndex, orderedImages, onReorder]);

  const handleDragEnd = useCallback(() => {
    setDraggingIndex(null);
  }, []);

  // 포맷에 따른 aspect ratio
  const getAspectRatio = () => {
    return promptFormat === 'longform' ? 'aspect-video' : 'aspect-[9/16]';
  };

  return (
    <div
      className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[99999] p-4"
      onClick={onClose}
    >
      <div
        className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-6xl max-h-[95vh] flex flex-col overflow-hidden shadow-2xl shadow-purple-500/20"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between p-4 border-b border-slate-700 bg-slate-800/50">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🖼️</span>
            <div>
              <h2 className="text-xl font-bold text-white">이미지 미리보기</h2>
              <p className="text-sm text-slate-400 mt-0.5 truncate max-w-lg">{title}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`px-3 py-1 rounded-full text-xs font-medium ${
              promptFormat === 'longform'
                ? 'bg-blue-600/30 text-blue-300 border border-blue-500/50'
                : promptFormat === 'shortform'
                ? 'bg-purple-600/30 text-purple-300 border border-purple-500/50'
                : 'bg-orange-600/30 text-orange-300 border border-orange-500/50'
            }`}>
              {promptFormat === 'longform' ? '롱폼' : promptFormat === 'shortform' ? '숏폼' : '상품'}
            </span>
            <span className="text-sm text-slate-400">
              {orderedImages.length}개 이미지
            </span>
            <button
              onClick={onClose}
              className="ml-2 text-slate-400 hover:text-white transition p-1 hover:bg-slate-700 rounded"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* 이미지 그리드 */}
        <div className="flex-1 overflow-y-auto p-4">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-16">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500"></div>
              <p className="mt-4 text-slate-400">이미지 로딩 중...</p>
            </div>
          ) : orderedImages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400">
              <span className="text-6xl mb-4">📭</span>
              <p className="text-lg">생성된 이미지가 없습니다</p>
              <p className="text-sm mt-2">이미지 크롤링이 완료되면 여기에 표시됩니다</p>
            </div>
          ) : (
            <>
              <p className="text-sm text-slate-400 mb-4 flex items-center gap-2">
                <span>💡</span>
                <span>이미지를 드래그하여 순서를 변경할 수 있습니다. 클릭하면 크게 볼 수 있습니다.</span>
              </p>
              <div className={`grid gap-4 ${
                promptFormat === 'longform'
                  ? 'grid-cols-2 lg:grid-cols-3'
                  : 'grid-cols-3 sm:grid-cols-4 lg:grid-cols-5'
              }`}>
                {orderedImages.map((image, index) => (
                  <div
                    key={`${image.filename}-${index}`}
                    draggable
                    onDragStart={(e) => handleDragStart(e, index)}
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleDrop(e, index)}
                    onDragEnd={handleDragEnd}
                    onClick={() => setSelectedImage(image)}
                    className={`relative group cursor-pointer bg-slate-800 rounded-xl overflow-hidden border transition-all ${
                      draggingIndex === index
                        ? 'opacity-50 border-purple-500 scale-95'
                        : 'border-slate-700 hover:border-purple-500 hover:shadow-lg hover:shadow-purple-500/20'
                    }`}
                  >
                    {/* 씬 번호 */}
                    <div className="absolute top-2 left-2 z-10 bg-black/70 text-white px-2 py-1 rounded text-sm font-bold">
                      {image.sceneIndex !== undefined ? `씬 ${image.sceneIndex}` : `#${index + 1}`}
                    </div>

                    {/* 드래그 핸들 */}
                    <div className="absolute top-2 right-2 z-10 bg-black/70 text-white p-1.5 rounded opacity-0 group-hover:opacity-100 transition cursor-grab active:cursor-grabbing">
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 16 16">
                        <path d="M2 4h12v1H2V4zm0 3.5h12v1H2v-1zM2 11h12v1H2v-1z"/>
                      </svg>
                    </div>

                    {/* 이미지 */}
                    <div className={`${getAspectRatio()} bg-slate-900`}>
                      <img
                        src={image.url}
                        alt={image.filename}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    </div>

                    {/* 파일명 */}
                    <div className="p-2 bg-slate-800/90 border-t border-slate-700">
                      <p className="text-xs text-slate-300 truncate" title={image.filename}>
                        {image.filename}
                      </p>
                      {image.narration && (
                        <p className="text-xs text-slate-500 truncate mt-1" title={image.narration}>
                          {image.narration.slice(0, 50)}...
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* 푸터 */}
        <div className="p-4 border-t border-slate-700 bg-slate-800/50 flex items-center justify-between">
          <div className="text-sm text-slate-400">
            {orderedImages.length > 0 && (
              <span>총 {orderedImages.length}개의 이미지가 준비되었습니다</span>
            )}
          </div>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition"
            >
              닫기
            </button>
            {onRegenerate && (
              <button
                onClick={onRegenerate}
                className="px-4 py-2 bg-yellow-600 hover:bg-yellow-500 text-white rounded-lg transition flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                재생성
              </button>
            )}
            <button
              onClick={onConfirm}
              disabled={orderedImages.length === 0}
              className="px-6 py-2 bg-purple-600 hover:bg-purple-500 disabled:bg-slate-600 disabled:cursor-not-allowed text-white rounded-lg transition flex items-center gap-2 font-medium"
            >
              <span>✅ 확인 후 영상 생성</span>
            </button>
          </div>
        </div>
      </div>

      {/* 이미지 확대 모달 */}
      {selectedImage && (
        <div
          className="fixed inset-0 bg-black/90 flex items-center justify-center z-[100000] p-4"
          onClick={() => setSelectedImage(null)}
        >
          <div className="relative max-w-5xl max-h-[90vh]">
            <button
              onClick={() => setSelectedImage(null)}
              className="absolute -top-12 right-0 text-white hover:text-slate-300 transition flex items-center gap-2"
            >
              <span>닫기</span>
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <img
              src={selectedImage.url}
              alt={selectedImage.filename}
              className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl"
            />
            <div className="absolute bottom-0 left-0 right-0 bg-black/70 text-white p-3 rounded-b-lg">
              <p className="font-medium">{selectedImage.filename}</p>
              {selectedImage.narration && (
                <p className="text-sm text-slate-300 mt-1">{selectedImage.narration}</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
