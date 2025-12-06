import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import fs from 'fs';
import path from 'path';

/**
 * GET /api/tasks/[id]/images
 * 태스크 폴더에 있는 이미지 파일 목록 조회 (thumbnail 제외)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: 'Task ID is required' }, { status: 400 });
    }

    // 태스크 폴더 경로
    const BACKEND_PATH = path.join(process.cwd(), '..', 'trend-video-backend');
    const taskFolderPath = path.join(BACKEND_PATH, 'tasks', id);

    if (!fs.existsSync(taskFolderPath)) {
      return NextResponse.json({ images: [] });
    }

    // 폴더 내 모든 파일 가져오기
    const files = fs.readdirSync(taskFolderPath);

    // 이미지 파일만 필터링 (thumbnail.* 제외)
    const imageFiles = files.filter(f =>
      /\.(png|jpg|jpeg|webp)$/i.test(f) && !f.startsWith('thumbnail.')
    );

    // 시퀀스 번호 추출 함수 (Frontend extractSequenceNumber와 동일)
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

      // 4. (숫자) 패턴: "Image_fx (47).jpg" (랜덤 ID 없을 때만)
      match = filename.match(/\((\d+)\)/);
      if (match && !filename.match(/[_-]\w{8,}/)) return parseInt(match[1]);

      return null;
    };

    // 시퀀스 > 시간순 정렬
    const sortedImages = imageFiles.sort((a, b) => {
      const aSeq = extractSequence(a);
      const bSeq = extractSequence(b);

      // 둘 다 시퀀스 있으면 시퀀스로 정렬
      if (aSeq !== null && bSeq !== null) {
        return aSeq - bSeq;
      }
      // 시퀀스 있는 것이 앞으로
      if (aSeq !== null) return -1;
      if (bSeq !== null) return 1;

      // 둘 다 시퀀스 없으면 파일 수정 시간순
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

    // 파일명과 전체 경로 반환
    const images = sortedImages.map(filename => ({
      filename,
      path: path.join(taskFolderPath, filename)
    }));

    console.log(`✅ [GET /api/tasks/${id}/images] Found ${images.length} images (thumbnail excluded)`);

    return NextResponse.json({
      images,
      count: images.length
    });

  } catch (error: any) {
    console.error('GET /api/tasks/[id]/images error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
