import { NextRequest, NextResponse } from 'next/server';
import { videoTasks } from '@/lib/video-tasks';

/**
 * GET /api/videos/status/[taskId]
 * 영상 생성 작업 상태 조회
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  try {
    const { taskId } = await params;

    const task = videoTasks.get(taskId);

    if (!task) {
      return NextResponse.json(
        { error: 'Task not found', status: 'failed' },
        { status: 404 }
      );
    }

    return NextResponse.json(task);
  } catch (error: any) {
    console.error('GET /api/videos/status/[taskId] error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
