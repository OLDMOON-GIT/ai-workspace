import { NextRequest, NextResponse } from 'next/server';
import { findJobById } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';
import db from '@/lib/sqlite';
import { getContentLogs } from '@/lib/content';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const taskId = searchParams.get('taskId');
    const type = searchParams.get('type');
    const status = searchParams.get('status');

    // type과 status로 진행 중인 작업 찾기
    if (type && status) {
      const user = await getCurrentUser(request);
      if (!user) {
        return NextResponse.json(
          { error: '로그인이 필요합니다.' },
          { status: 401 }
        );
      }

      // 가장 최근의 해당 타입, 해당 상태 작업 찾기 (jobs → contents 통합)
      // ⚠️ video_path 컬럼 없음 - 경로는 task_id에서 계산됨
      const job = await db.prepare(`
        SELECT * FROM content
        WHERE user_id = ? AND prompt_format = ? AND status = ?
        ORDER BY created_at DESC
        LIMIT 1
      `).get(user.userId, type, status) as any;

      if (!job) {
        return NextResponse.json({ taskId: null });
      }

      // 로그 가져오기 (파일 기반)
      const logs = getContentLogs(job.id);

      return NextResponse.json({
        taskId: job.id,
        status: job.status,
        progress: job.progress || 0,
        step: job.step,
        logs: logs,
        error: job.error
      });
    }

    // taskId로 특정 작업 찾기
    if (!taskId) {
      return NextResponse.json(
        { error: 'taskId가 필요합니다.' },
        { status: 400 }
      );
    }

    const job = await findJobById(taskId);

    if (!job) {
      return NextResponse.json(
        { error: '작업을 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      status: job.status,
      progress: job.progress || 0,
      step: job.step,
      logs: job.logs || '',
      outputPath: job.videoPath,
      error: job.error
    });

  } catch (error: any) {
    console.error('Job 상태 조회 오류:', error);
    return NextResponse.json(
      { error: error.message || '상태 조회 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
