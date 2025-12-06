import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET(
  request: NextRequest,
  { params }: { params: { taskId: string; filename: string } }
) {
  try {
    const { taskId, filename } = params;

    // backend tasks 경로
    const backendPath = path.resolve(process.cwd(), '..', 'trend-video-backend', 'tasks', taskId, filename);

    // 파일 존재 확인
    if (!fs.existsSync(backendPath)) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    // 파일 읽기
    const fileBuffer = fs.readFileSync(backendPath);

    // MIME 타입 결정
    const ext = path.extname(filename).toLowerCase();
    const mimeTypes: Record<string, string> = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.mp4': 'video/mp4',
      '.webm': 'video/webm'
    };

    const contentType = mimeTypes[ext] || 'application/octet-stream';

    // 이미지 반환
    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000, immutable'
      }
    });
  } catch (error: any) {
    console.error('Task image fetch error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
