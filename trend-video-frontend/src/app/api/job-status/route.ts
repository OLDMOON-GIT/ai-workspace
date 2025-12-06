import { NextRequest, NextResponse } from 'next/server';
import { findJobById } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';
import { getOne } from '@/lib/mysql';
import { getContentLogs } from '@/lib/content';
import { initAutomationTables } from '@/lib/automation';

// 테이블 초기화
(async () => {
  try {
    await initAutomationTables();
  } catch (error) {
    console.error('Failed to initialize automation tables:', error);
  }
})();

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get('jobId');
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

      // ⭐ product_batch는 category가 '상품'인 작업을 의미 (video_path 조건 제거)
      let job: any = null;
      if (type === 'product_batch') {
        job = await getOne(`
          SELECT * FROM content
          WHERE user_id = ? AND category = '상품' AND status = ?
          ORDER BY created_at DESC
          LIMIT 1
        `, [user.userId, status]);
      } else {
        // ⭐ 일반적인 경우: prompt_format으로 필터링 (video_path 조건 제거)
        job = await getOne(`
          SELECT * FROM content
          WHERE user_id = ? AND prompt_format = ? AND status = ?
          ORDER BY created_at DESC
          LIMIT 1
        `, [user.userId, type, status]);
      }

      if (!job) {
        return NextResponse.json({ jobId: null });
      }

      // 로그 가져오기 (파일 기반)
      const logs = getContentLogs(job.content_id);

      return NextResponse.json({
        jobId: job.content_id,
        status: job.status,
        progress: job.progress || 0,
        step: job.step,
        logs: logs,
        error: job.error
      });
    }

    // jobId로 특정 작업 찾기
    if (!jobId) {
      return NextResponse.json(
        { error: 'jobId가 필요합니다.' },
        { status: 400 }
      );
    }

    const job = await findJobById(jobId);

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
