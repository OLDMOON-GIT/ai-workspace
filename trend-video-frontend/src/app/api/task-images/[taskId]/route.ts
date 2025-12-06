import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET(
  request: NextRequest,
  { params }: { params: { taskId: string } }
) {
  try {
    const { taskId } = params;

    // backend tasks 경로
    const tasksPath = path.resolve(process.cwd(), '..', 'trend-video-backend', 'tasks', taskId);

    // 폴더 존재 확인
    if (!fs.existsSync(tasksPath)) {
      return NextResponse.json({ error: 'Task folder not found' }, { status: 404 });
    }

    // 폴더 내 모든 파일 읽기
    const files = fs.readdirSync(tasksPath);

    // 이미지/비디오 파일만 필터링
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
    const videoExtensions = ['.mp4', '.webm', '.mov'];
    const mediaExtensions = [...imageExtensions, ...videoExtensions];

    const mediaFiles = files
      .filter(file => {
        const ext = path.extname(file).toLowerCase();
        return mediaExtensions.includes(ext);
      })
      .map(file => {
        const ext = path.extname(file).toLowerCase();
        const isVideo = videoExtensions.includes(ext);
        const filePath = path.join(tasksPath, file);
        const stats = fs.statSync(filePath);

        return {
          filename: file,
          type: isVideo ? 'video' : 'image',
          size: stats.size,
          url: `/api/task-images/${taskId}/${file}`
        };
      })
      .sort((a, b) => a.filename.localeCompare(b.filename));

    return NextResponse.json({
      taskId,
      files: mediaFiles,
      total: mediaFiles.length
    });
  } catch (error: any) {
    console.error('Task images list error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
