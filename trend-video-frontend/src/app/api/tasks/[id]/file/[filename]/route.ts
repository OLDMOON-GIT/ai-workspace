import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import fs from 'fs';
import path from 'path';

/**
 * GET /api/tasks/[id]/file/[filename]
 * 태스크 폴더의 특정 파일 반환 (이미지/비디오)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; filename: string }> }
) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id, filename } = await params;
    if (!id || !filename) {
      return NextResponse.json({ error: 'Task ID and filename are required' }, { status: 400 });
    }

    // 디코딩된 파일명
    const decodedFilename = decodeURIComponent(filename);

    // 태스크 폴더 경로
    const BACKEND_PATH = path.join(process.cwd(), '..', 'trend-video-backend');
    const filePath = path.join(BACKEND_PATH, 'tasks', id, decodedFilename);

    // 보안: 경로 탈출 방지
    const resolvedPath = path.resolve(filePath);
    const allowedDir = path.resolve(BACKEND_PATH, 'tasks', id);
    if (!resolvedPath.startsWith(allowedDir)) {
      return NextResponse.json({ error: 'Invalid file path' }, { status: 403 });
    }

    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    // 파일 읽기
    const fileBuffer = fs.readFileSync(filePath);

    // Content-Type 결정
    const ext = path.extname(decodedFilename).toLowerCase();
    const contentTypes: Record<string, string> = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.webp': 'image/webp',
      '.gif': 'image/gif',
      '.mp4': 'video/mp4',
      '.webm': 'video/webm',
      '.mov': 'video/quicktime',
      '.avi': 'video/x-msvideo',
    };
    const contentType = contentTypes[ext] || 'application/octet-stream';

    return new NextResponse(fileBuffer, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `inline; filename="${decodedFilename}"`,
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });

  } catch (error: any) {
    console.error('GET /api/tasks/[id]/file/[filename] error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
