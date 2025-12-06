import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { QueueManager } from '@/lib/queue-manager';
import crypto from 'crypto';

/**
 * POST /api/queue/enqueue
 * 작업을 큐에 추가
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { type, projectId, metadata } = body;

    // Validation
    if (!type || !['script', 'image', 'video'].includes(type)) {
      return NextResponse.json(
        { error: 'Invalid task type. Must be: script, image, or video' },
        { status: 400 }
      );
    }

    if (!projectId) {
      return NextResponse.json(
        { error: 'projectId is required' },
        { status: 400 }
      );
    }

    // 큐에 작업 추가
    const manager = new QueueManager();

    try {
      // ⭐ taskId 생성 (projectId 기반) - UUID만 사용 (prefix 없음!)
      const taskId = projectId || crypto.randomUUID();

      const task = await manager.enqueue({
        taskId,
        promptFormat: type,  // QueueTask interface에서는 promptFormat
        userId: user.email || user.userId,
        projectId,
        metadata: metadata || {}
      });

      // 큐 내 위치 및 예상 대기 시간 계산
      const position = await manager.getPosition(task.taskId, type);

      // 예상 대기 시간 (대략적)
      // script: 5분, image: 10분, video: 15분
      const estimatedTimePerTask = {
        script: 5 * 60,
        image: 10 * 60,
        video: 15 * 60
      };

      const estimatedWaitTime = position !== null
        ? position * estimatedTimePerTask[type as keyof typeof estimatedTimePerTask]
        : 0;

      return NextResponse.json({
        success: true,
        task,
        position,
        estimatedWaitTime,
        message: `${type === 'script' ? '대본작성' : type === 'image' ? '이미지크롤링' : '영상제작'} 작업이 큐에 추가되었습니다.`
      });

    } finally {
      manager.close();
    }

  } catch (error: any) {
    console.error('❌ Queue enqueue error:', error);
    return NextResponse.json(
      { error: error.message || '서버 오류' },
      { status: 500 }
    );
  }
}
