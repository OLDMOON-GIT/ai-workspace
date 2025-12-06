import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import fs from 'fs';
import path from 'path';

/**
 * GET /api/tasks/[id]/media
 * 태스크 폴더에 있는 미디어 파일(이미지/비디오) 목록 조회
 * 영상 제작 버튼 클릭 시 기존 미디어를 첨부하기 위해 사용
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    if (!id) {
      return NextResponse.json({ success: false, error: 'Task ID is required' }, { status: 400 });
    }

    // 태스크 폴더 경로
    const BACKEND_PATH = path.join(process.cwd(), '..', 'trend-video-backend');
    const taskFolderPath = path.join(BACKEND_PATH, 'tasks', id);

    if (!fs.existsSync(taskFolderPath)) {
      return NextResponse.json({ success: true, media: [] });
    }

    // 폴더 내 모든 파일 가져오기
    const files = fs.readdirSync(taskFolderPath);

    // 이미지 확장자
    const imageExtensions = /\.(png|jpg|jpeg|webp|gif)$/i;
    // 비디오 확장자
    const videoExtensions = /\.(mp4|webm|mov|avi)$/i;

    // 미디어 파일만 필터링 (thumbnail.*, story.json 등 제외)
    const mediaFiles = files.filter(f => {
      // thumbnail, story.json 등 제외
      if (f.startsWith('thumbnail.') || f === 'story.json') return false;
      return imageExtensions.test(f) || videoExtensions.test(f);
    });

    // 시퀀스 번호 추출 함수
    const extractSequence = (filename: string): number | null => {
      // 1. 숫자로 시작: "1.jpg", "02.png"
      let match = filename.match(/^(\d+)\./);
      if (match) return parseInt(match[1]);

      // 2. scene_XX_ 패턴: "scene_00_hook.jpeg" (Whisk/ImageFX)
      match = filename.match(/^scene_(\d+)_/);
      if (match) return parseInt(match[1]);

      // 3. _숫자. 또는 -숫자. 패턴: "image_01.jpg"
      match = filename.match(/[_-](\d{1,3})\./);
      if (match) return parseInt(match[1]);

      // 4. (숫자) 패턴: "Image_fx (47).jpg"
      match = filename.match(/\((\d+)\)/);
      if (match && !filename.match(/[_-]\w{8,}/)) return parseInt(match[1]);

      return null;
    };

    // 시퀀스 > 시간순 정렬
    const sortedMedia = mediaFiles.sort((a, b) => {
      const aSeq = extractSequence(a);
      const bSeq = extractSequence(b);

      if (aSeq !== null && bSeq !== null) {
        return aSeq - bSeq;
      }
      if (aSeq !== null) return -1;
      if (bSeq !== null) return 1;

      // 파일 수정 시간순
      const aPath = path.join(taskFolderPath, a);
      const bPath = path.join(taskFolderPath, b);
      try {
        const aStat = fs.statSync(aPath);
        const bStat = fs.statSync(bPath);
        return aStat.mtimeMs - bStat.mtimeMs;
      } catch {
        return 0;
      }
    });

    // API 응답 형식: { name, url, type }
    const media = sortedMedia.map(filename => {
      const isVideo = videoExtensions.test(filename);
      return {
        name: filename,
        url: `/api/tasks/${id}/file/${encodeURIComponent(filename)}`,
        type: isVideo ? 'video' : 'image' as 'image' | 'video'
      };
    });

    console.log(`✅ [GET /api/tasks/${id}/media] Found ${media.length} media files:`, media.map(m => m.name));

    return NextResponse.json({
      success: true,
      media,
      count: media.length
    });

  } catch (error: any) {
    console.error('GET /api/tasks/[id]/media error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
