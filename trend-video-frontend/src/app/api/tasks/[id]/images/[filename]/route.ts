import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import fs from 'fs/promises';
import path from 'path';

/**
 * GET /api/tasks/{taskId}/images/{filename}
 *
 * task 폴더의 이미지 파일을 반환합니다.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { taskId: string; filename: string } }
) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { taskId, filename } = params;

    // 파일명 검증 (보안)
    if (!/^[a-zA-Z0-9_\-\.]+$/.test(filename)) {
      return NextResponse.json({ error: 'Invalid filename' }, { status: 400 });
    }

    // tasks 폴더 경로
    const backendPath = path.join(process.cwd(), '..', 'trend-video-backend');
    const imagePath = path.join(backendPath, 'tasks', taskId, filename);

    // 파일 존재 확인
    try {
      await fs.access(imagePath);
    } catch {
      return NextResponse.json({ error: 'Image not found' }, { status: 404 });
    }

    // 이미지 파일 읽기
    const imageBuffer = await fs.readFile(imagePath);

    // MIME 타입 결정
    const ext = path.extname(filename).toLowerCase();
    const mimeTypes: Record<string, string> = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp'
    };
    const contentType = mimeTypes[ext] || 'image/jpeg';

    // 이미지 반환
    return new NextResponse(imageBuffer, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000, immutable'
      }
    });

  } catch (error: any) {
    console.error('Failed to serve image:', error);
    return NextResponse.json(
      { error: 'Failed to serve image', details: error.message },
      { status: 500 }
    );
  }
}
